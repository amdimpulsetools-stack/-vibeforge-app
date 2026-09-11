# Reporte personalizado — Datos y eficiencia

Análisis de solo lectura (2026-09-11). Repo `/home/user/-vibeforge-app`. Todas las rutas de
migración son `supabase/migrations/<n>_*.sql`; "mig 251:29-66" = líneas 29-66 de esa migración.

**Validación ejecutable**: el borrador del RPC de la sección 4 se corrió contra un Postgres 16
desechable (`run.sh` en este directorio: stub del esquema → mig 251 VERBATIM → borrador →
`10_reconcile_test.sql`). **38/38 aserciones PASS**, incluida
`TOTAL FINAL == get_reports_overview.payments_amount + treatment_payments_amount`.
Salida completa en `test-output.txt`. No hubo acceso a producción: los volúmenes de la sección 5
son estimaciones razonadas, no conteos reales.

---

## 0. Lo que ya existe y manda (fuente de verdad)

| Número | Dónde vive | Definición |
|---|---|---|
| **Cobrado total** de Reportes › Financiero | `get_reports_overview` mig 251:98-101 → `financial-report.tsx:155` | Σ `patient_payments.amount` con `payment_date` en el rango y cubeta ≠ `treatments` |
| **Desglose** (`collected_breakdown`) | mig 251:67-85 (CTE `range_payments`, CASE 71-80) y 120-129 | Cubetas disjuntas que **siempre** suman `payments_amount`: `pharmacy` (source='pos') · `treatments` (treatment_id) · `period_appointments` (cita del rango) · `other_appointments` (cita fuera del rango) · `plans` (treatment_plan_id) · `other` (nada) |
| **Cobros por tratamientos** | mig 251:102-105; decisión mig 244:5-9 | Σ cubeta `treatments` (implícitamente `source='clinical'` porque `pos` se evalúa antes, 251:72-73) |
| **Facturado por citas** (desde 7-sep) | mig 251:1-18, 51-58 (`collected_in_range`), 159-162 | Cobrado en el rango sobre citas del rango == cubeta `period_appointments` |
| **Precio real de la cita** | mig 100:16-18, 219:29-34, 251:43-46; espejo `lib/patient-debt.ts:48-55` | `GREATEST(0, COALESCE(price_snapshot, base_price, 0) − discount_amount)` |
| **Ingresos por servicio** (Operacional) | mig 251:170-186 (`revenue` solo `completed`, línea 180) | Única cifra de producción (precio, no cobro) — `docs/mapa-del-dinero.md:59` |
| Dinero de tratamiento | mig 245:18-26, 292-299; espejo `lib/treatments/money.ts:6-12` | `paid_clinic` = Σ pagos con `treatment_id` y `COALESCE(source,'clinical')='clinical'` |
| Deuda de cita/paciente | mig 243:61-62; `lib/patient-debt.ts:71-75` | Excluye `source='pos'` y `treatment_id IS NOT NULL` |

Columnas verificadas (no supuestas):
- `patient_payments`: `amount numeric(10,2)`, `payment_method`, `notes`, **`payment_date DATE`** (mig 008:81-90), `organization_id` (013:182), `treatment_plan_id` (099:71-72), `source 'clinical'|'pos'`, `cash_shift_id`, `sale_id`, `created_by`, `tender_kind` (213:18-34), `einvoice_id` (108:331-332), `treatment_id`, `treatment_concept_id`, `revenue_bucket`, `external_receipt_ref` (242:203-210). CHECK "un contenedor": 242:217-218. Concepto obligatorio en tratamiento: 242:224-225.
- `appointments`: `service_id`, `appointment_date DATE`, `start_time`, `status` ∈ scheduled/confirmed/completed/cancelled/no_show (007:5-24, 019:10-11), `price_snapshot` (011:11), `discount_amount` (100:56-60), `treatment_session_id` (099:63-64), seguros `payment_mode/insurance_coverage_amount/patient_copay` (160:254-266).
- `services`: `name`, `base_price`, `category_id` (004:48-59), `igv_affectation` (108:310-316), `is_bookable` (239:26-27).
- `treatment_payment_concepts`: `key`, `label`, `revenue_bucket` (242:115-130); seed de 10 conceptos por org fértil (242:167-179). **La `label` NO se snapshotea en el pago** (solo `revenue_bucket`, 242:206-208).
- Farmacia: `pharmacy_sales` (216:41-136: `status borrador|confirmada|anulada`, `total`, `payment_id`, `sale_number`; `sale_date` 232:45-47), `pharmacy_sale_items` (216:185-257: `description` snapshot, `quantity numeric(12,3)`, `unit_price` CON IGV, `line_discount`, `line_total` GENERATED 215-217, `product_id XOR service_id` 241). `inventory_products.sale_price/igv_affectation` (209:43, 213:141). `inventory_movements` (209:155-213) — kardex, no dinero cobrado.
- Devoluciones: `cash_movements.movement_type='devolucion'`, `amount` negativo (214:174-223).

Cómo entra cada cobro (los "4 formularios" + 2 rutas), lo que decide la cubeta:

| Origen | Estampa | Cubeta resultante |
|---|---|---|
| Sidebar de cita `appointment-sidebar.tsx:894-907` | `appointment_id` (+ `treatment_plan_id` si es sesión de plan) | period/other_appointments (el CASE mira `appointment_id` antes que `treatment_plan_id`) |
| Anticipo al crear cita `appointment-form-modal.tsx:1166-1178` | `appointment_id`, notas "Anticipo" | period/other_appointments |
| Drawer del paciente `patient-drawer.tsx:695-703` (selector 1785-1793: cualquier cita no cancelada, de cualquier fecha, o "-- Ninguna --") | `appointment_id` opcional | period/other_appointments **o `other`** ("abono directo") |
| Anticipo a plan `budgets-panel.tsx:185-196` | `treatment_plan_id`, `appointment_id: null` | `plans` |
| Tratamientos `api/treatments/[id]/payments/route.ts:196-208` | `treatment_id` + `treatment_concept_id`, `source:'clinical'` | `treatments` |
| Link Culqi `lib/culqi/reconcile.ts:100-111` | `appointment_id` del link (puede ser null) | appointments u `other` |
| POS `pharmacy_confirm_sale` mig 232:319-328 | `source:'pos'`, `sale_id`, `amount = Σ line_total` (232:223-232), `payment_date = sale_date` | `pharmacy` (aunque lleve `appointment_id`) |

---

## 1. Mapa sección → datos

Regla aplicada: **cada sección reproduce una cubeta de `collected_breakdown`** con las mismas CTEs
de la mig 251 (copiadas, no reescritas), el mismo rango por `payment_date`, el mismo `source` y el
mismo precio real. "Cantidad · Precio · Total" se derivan **encima** de esa cubeta; nunca la
redefinen.

### 1.1 SERVICIOS  ⇢ cubeta `period_appointments`

- **Filas base**: CTE `range_appointments` VERBATIM (mig 251:29-66) — citas de la org con
  `appointment_date` en el rango, **de cualquier estado** (incluye canceladas con cobro, decisión
  251:159-162 "el dinero entró aunque la cita siga programada"), con `collected_in_range` = Σ
  cobros de ESA cita con `payment_date` en rango, `COALESCE(source,'clinical')='clinical'`,
  `treatment_id IS NULL` (251:51-58).
- **Agrupación**: `service_name` = `COALESCE(services.name,'Sin servicio')` (251:40). No hay
  snapshot del nombre del servicio en la cita: renombrar un servicio reagrupa la historia.
- **Descripción** = nombre del servicio. **Cantidad** = nº de citas del rango con
  `collected_in_range > 0` (una cita con dos cobros cuenta 1). **Precio** = precio real de esas
  citas si es único; `NULL` ("varios") + `price_min/price_max` si difiere. **Total** = Σ
  `collected_in_range`.
- Extras (sin entrar al total): `attended` = COUNT `status='completed'` y `production_total` = Σ
  precio real de completadas — **es exactamente `services[].revenue` de 251:170-186** ("Ingresos
  por servicio" de la pestaña Operacional), por si la UI quiere una columna "Atendidas / Producción".
- **Identidad**: Σ `collected_in_range` sobre `range_appointments` ≡ cubeta `period_appointments`
  (mismo conjunto: cita ∈ rango ∧ pago ∈ rango ∧ clínico ∧ sin tratamiento; lo afirma la propia
  mig 251:13-15 y lo prueba el test `overview.period_appointments == Σ doctors[].collected`).

### 1.2 ABONOS Y SERVICIOS FUTUROS  ⇢ cubetas `other_appointments` + `other` + `plans`

Tres sub-grupos, con `kind` para que la UI ponga subtítulos:

| kind | Qué es | Descripción | Cantidad | Precio | Total |
|---|---|---|---|---|---|
| `appointment_future` | cobro del rango sobre cita **posterior** al rango (adelanto) | servicio de la cita | citas distintas | precio real de la cita (único o "varios") | Σ amount |
| `appointment_past` | cobro del rango sobre cita **anterior** al rango (pago atrasado) | servicio de la cita | citas distintas | ídem | Σ amount |
| `direct` | `other`: sin cita, plan ni tratamiento ("abono directo" del drawer, link Culqi sin cita) | "Abono directo (sin cita asociada)" | nº cobros | monto si único | Σ amount |
| `plan` | `plans`: anticipos a planes (099:18-21; `budgets-panel.tsx:191` "Anticipo al plan") | "Anticipo a plan — <título>" | nº cobros | monto si único | Σ amount |

- El founder describió exactamente los dos primeros ("pagos vinculados a citas de otras fechas /
  adelantos") y el tercero ("pagos registrados desde el drawer / abonos directos"). El cuarto
  (`plans`) **no lo listó**; ver 2(c): recomiendo meterlo aquí porque semánticamente es un abono a
  servicios futuros y así TOTAL FINAL cuadra.
- Para `appointment_*` la "cita de otra fecha" se resuelve con `JOIN appointments` por
  `appointment_id` (existe seguro: si se borró la cita el FK pone NULL y el pago cae en `other`,
  008:84).

### 1.3 FARMACIA  ⇢ cubeta `pharmacy`

- **Filas base**: cobros `bucket='pharmacy'` (source='pos') del rango → `pharmacy_sales` por
  `sale_id = pharmacy_sales.id` (PK) → `pharmacy_sale_items`.
- **Por qué cuadra**: `pharmacy_confirm_sale` fija `amount = Σ line_total` y `payment_date =
  sale_date` (232:223-232, 319-328); las líneas de una venta cerrada son inmutables por trigger
  (216:272-307). Luego Σ `line_total` de ventas confirmadas == Σ cobros pos de esas ventas.
- **Descripción** = `description` (snapshot del nombre, 216:199-200; incluye **servicios vendidos
  en mostrador**, `service_id`, 216:241 — no solo productos). **Cantidad** = Σ `quantity`
  (3 decimales). **Precio** = `unit_price` (CON IGV) si único en el rango, si no `NULL` + min/max
  (un cambio de lista a mitad de mes, mig 252, produce "varios"). **Total** = Σ `line_total`
  (= cantidad × precio − descuento de línea).
- **Ventas anuladas**: su cobro **sigue en `patient_payments`** (232:446-493 solo escribe
  `cash_movements` si Caja está activa; sin Caja no hay reverso alguno). Por eso `pharmacy` las
  incluye y "Cobrado total" también. El reporte las muestra como fila aparte, marcada
  `voided=true`, para que la suma cuadre y la doctora vea el porqué (ver 2(f)).
- **Cierres contables**: fila "Farmacia (sin detalle de venta)" para un cobro pos sin venta
  localizable, y fila "Ajuste" si Σ líneas ≠ Σ cobros (p.ej. alguien editó `amount` de un cobro
  pos: la policy de UPDATE de 008:102-104 lo permite fuera de turno cerrado, 214:350-392). Test
  `cobro POS editado` lo cubre.
- Fuente **descartada**: `inventory_movements.revenue_total` (209:179) — es kardex (fecha
  `movement_date`, contra-asientos), no dinero cobrado; ya lo usa Almacén › Rentabilidad
  (`profit-tab.tsx:79-120`) para margen NETO, otra pregunta.

### 1.4 PAGOS POR TRATAMIENTOS  ⇢ `treatment_payments_amount` (cubeta `treatments`)

- **Filas base**: cobros `bucket='treatments'` del rango (== mig 251:102-105 == `period_pay` de
  `get_treatments_overview` 245:292-299 sin el scope por doctora).
- **Descripción** = `treatment_payment_concepts.label` vía `treatment_concept_id` (LEFT JOIN;
  "Sin concepto" si faltara, aunque el CHECK 242:224-225 lo impide). **Cantidad** = nº de cobros
  ("número de veces cobrado", como pidió). **Precio** = monto si todos iguales, si no `NULL` +
  min/max. **Total** = Σ amount.
- Los **pagos directos a terceros** (`treatment_external_payments`, 242:277-308) **no entran**: no
  son cobro (CLAUDE.md, 245:21-26).

### 1.5 TOTAL FINAL

Σ de los `total` de las secciones marcadas. Con las cuatro marcadas ≡
`payments_amount + treatment_payments_amount` (prueba en §3).

---

## 2. Problemas de definición y recomendación

**(a) "Precio" cuando el mismo servicio se cobró a precios distintos o parcialmente.**
Hay cuatro candidatos: catálogo (`services.base_price`), precio real de la cita
(`price_snapshot − descuento`), promedio (`total / cantidad`) o "varios". Recomendación: **precio
real de la cita** (la fórmula canónica que ya usa toda la app, 219:29-34) **cuando es único en el
grupo; si no, "varios" con el rango (S/ 180 – 200)**. Nunca promedio: `total/cantidad` con cobros
parciales produce "1era consulta S/ 150" cuando la consulta vale 200 y se cobró la mitad — un
número que no existe en ningún sitio. Consecuencia que hay que enseñar: **Cantidad × Precio ≠
Total** cuando hay parciales o descuentos; la columna Total es la que manda. En FARMACIA el
precio es `unit_price` (snapshot con IGV) y la diferencia con cantidad × precio es el descuento de
línea.

**(b) SERVICIOS = producción (citas atendidas) o caja (cobrado en el rango sobre citas del
rango).** Desde el 7-sep "Facturado por citas" es caja (mig 251:1-18) y toda la pestaña
Financiero mide caja (`docs/mapa-del-dinero.md:61-64`). Recomendación: **caja**, exactamente la
cubeta `period_appointments`, para que la primera línea del reporte impreso coincida con la
tarjeta que la doctora ya mira. Efectos a explicar: (1) una consulta atendida hoy y no pagada **no
aparece** (o aparece con total 0 si se muestran las filas `attended>0`); (2) una cancelada con
cobro **sí** aparece (251:159-162); (3) una consulta de ayer pagada hoy no está aquí sino en
ABONOS › `appointment_past`. Como concesión, el RPC devuelve `attended` y `production_total`
(== "Ingresos por servicio" de Operacional) para una columna secundaria opcional; no propongo
una tercera definición.

**(c) Cubeta `plans` no listada.** Es core (099), la alimenta `budgets-panel.tsx:185-196`, y en
Reportes aparece como "Planes de tratamiento" (`language-provider.tsx:494`). Si se omite, con
todo marcado TOTAL FINAL = Cobrado total − plans y la doctora verá dos números distintos en la
misma pantalla. Recomendación: **incluirla dentro de ABONOS Y SERVICIOS FUTUROS** como filas
`kind='plan'` ("Anticipo a plan — <título>"): un anticipo a un plan **es** un abono a servicios
futuros, no requiere quinta sección y no aparece en orgs que no usan planes (0 filas). Alternativa
descartada: sección propia "PLANES" — más ruido para el 90 % de orgs.

**(d) Cobros parciales y a cuenta.** Un parcial sobre cita del rango entra en SERVICIOS por lo
cobrado (Cantidad 1, Precio real, Total parcial). El saldo **no** se muestra: "Pendiente" tiene su
propia fórmula (251:107-118, estado ∈ completed/confirmed y pagos de cualquier fecha) y mezclarla
aquí rompería "un número, una fórmula". Los "a cuenta" sin cita van a ABONOS › `direct`; los "a
cuenta" de tratamiento (concepto `a_cuenta`, 242:177) van a TRATAMIENTOS por su etiqueta.

**(e) Descuentos.** De cita: ya están dentro del precio real (100:16-18); el cobro es bruto, así
que Total no cambia y Precio ya viene neto de descuento (test `Control: precio real con descuento
= 80`). De farmacia: `line_discount` reduce `line_total` (216:215-217); Precio muestra el
`unit_price` de lista y Total el neto. No hay descuentos en planes ni tratamientos.

**(f) Anulaciones y devoluciones.**
- Farmacia (`pharmacy_void_sale`, 232:375-548): stock se revierte, la venta pasa a `anulada`,
  **el cobro pos se queda** y, solo con Caja activa (addon + `cash_settings`, mig 226), se
  escribe `cash_movements 'devolucion'`. `get_reports_overview` **no lee `cash_movements`** → la
  venta anulada sigue en "Cobrado total". Sin Caja, ningún número del sistema la descuenta (el
  dashboard v3 netea devoluciones, 233:305-317, pero solo si existen). Recomendación: fila
  explícita "Ventas anuladas" en FARMACIA (implementada) y una **mig posterior** que excluya de
  las cubetas los cobros pos cuya venta esté `anulada` — en `get_reports_overview` y en el reporte
  a la vez.
- Citas (`appointment_cancel_refund`, 233:26-190): con Caja → `cash_movements` (pago intacto);
  **sin Caja → DELETE/UPDATE del pago** (233:148-169). Es decir, el mismo hecho contable deja
  huella distinta según el addon: con Caja el reporte lo sigue contando; sin Caja desaparece y un
  reporte impreso ayer ya no cuadra hoy.
- Recomendación de diseño: TOTAL FINAL **no** neta devoluciones (para igualar "Cobrado total") y
  el JSON trae `reconciliation.refunds_in_range` (Σ `cash_movements 'devolucion'` por fecha civil
  de la org) como línea informativa al pie: "Devoluciones registradas en Caja: −S/ 95". Que la
  doctora decida (pregunta 2, §7).

---

## 3. Reconciliación obligatoria

**Identidad algebraica.** El CASE de `range_payments` (251:71-80) es una partición: cada cobro
del rango cae en **exactamente una** cubeta de {pharmacy, treatments, period_appointments,
other_appointments, plans, other}. Las secciones cubren cubetas disjuntas y completas:

```
SERVICIOS    = period_appointments
ABONOS       = other_appointments + other + plans
FARMACIA     = pharmacy
TRATAMIENTOS = treatments
──────────────────────────────────────────────────
Σ secciones  = Σ todas las cubetas
             = (Σ cubetas ≠ treatments) + treatments
             = payments_amount + treatment_payments_amount      (251:98-105)
```

Dentro de cada sección, Σ filas == cubeta porque las filas se agrupan **sobre las mismas
filas de `range_payments`** (ABONOS, TRATAMIENTOS), sobre `collected_in_range` de
`range_appointments` (SERVICIOS; ≡ `period_appointments` por construcción, 251:13-15) o sobre
líneas de venta con las filas de cierre "anuladas / sin detalle / ajuste" (FARMACIA).

**SQL de comprobación** (el RPC lo devuelve en `reconciliation`; ejecutable en cualquier org):

```sql
-- Con las 4 secciones marcadas, grand_total debe ser igual a la suma de la mig 251.
WITH r AS (SELECT get_custom_report(:org, :from, :to, NULL) AS j),
     o AS (SELECT get_reports_overview(:from, :to) AS j)
SELECT (r.j->>'grand_total')::numeric AS total_final,
       (o.j->'totals'->>'payments_amount')::numeric
     + (o.j->'totals'->>'treatment_payments_amount')::numeric AS cobrado_mas_tratamientos,
       (r.j->>'grand_total')::numeric =
       (o.j->'totals'->>'payments_amount')::numeric
     + (o.j->'totals'->>'treatment_payments_amount')::numeric AS cuadra
FROM r, o;
```

**Resultado en el harness** (datos sintéticos con todos los casos límite; `test-output.txt`):

```
PASS  period_appointments (SERVICIOS)  (=530.00)     ← 200 + 100 parcial + 80 con descuento + 150 cancelada
PASS  other_appointments  (=200.00)                  ← 50 adelanto futura + 150 pago atrasado
PASS  other (abono directo)  (=300.00)
PASS  plans  (=400.00)
PASS  pharmacy (incluye anulada)  (=187.00)          ← 97 + 45 (pos con appointment_id) + 45 anulada
PASS  treatment_payments_amount  (=4500.00)
PASS  SERVICIOS.total == period_appointments · ABONOS.total == 900 · FARMACIA.total == pharmacy · TRATAMIENTOS.total == treatment_payments_amount
PASS  Σ filas de cada sección == total de sección (4 aserciones)
PASS  TOTAL FINAL == overview.payments_amount + treatment_payments_amount  (=6117.00)
PASS  overview.period_appointments == Σ doctors[].collected  (=530.00)
PASS  Consulta: precio NULL (varios 180/200) · producción = 380 (== services[].revenue)
PASS  Control: precio real con descuento = 80 · Ecografía cancelada con cobro cuenta (mig 251)
PASS  Ovusitol qty 3 (anulada fuera) · Paracetamol 7.00 (descuento de línea) · fila anuladas = 45
PASS  Devoluciones en Caja (informativo, fecha civil Lima, 21:30 Lima cuenta el día 7) = -95
PASS  Solo SERVICIOS+FARMACIA = 717 · sección no marcada viene NULL · hoy: from == to
PASS  cobro POS editado: fila de ajuste = 10 · FARMACIA sigue == pharmacy · TOTAL FINAL sigue cuadrando
PASS  gating: receptionist ⇒ forbidden · otra org ⇒ forbidden
TODAS LAS ASERCIONES PASARON (38)
```

**Dónde NO puede cuadrar por diseño y qué se le enseña a la doctora:**
1. Si desmarca una sección, TOTAL FINAL < "Cobrado total" por definición. El JSON trae
   `expected_grand_total` (Σ cubetas de lo marcado) para que la UI diga "Total de lo marcado" y
   no "Cobrado total".
2. **Usuario multi-org**: `get_reports_overview` suma **todas** las orgs del usuario
   (`IN (SELECT get_user_org_ids())`, 251:63 y 82); el reporte es por `p_org_id`. Para la doctora
   (una org) es idéntico; para el founder con dos orgs no. Se arregla añadiendo `p_org_id` a
   `get_reports_overview` (pregunta 6).
3. Devoluciones (§2f): "Cobrado total" es bruto de devoluciones; el reporte también. La línea
   informativa `refunds_in_range` explica la diferencia con el Dashboard (que sí netea,
   233:305-317).
4. Un reporte impreso es una **foto**: sin Caja, devolver una cita borra el pago (233:158) y el
   mismo rango impreso mañana da otro total. Pie de página con fecha/hora de generación.

---

## 4. Diseño del RPC — `get_custom_report`

Firma pedida `get_custom_report(p_org_id uuid, p_from date, p_to date, p_sections text[])`, con
dos comodidades: `p_from/p_to NULL ⇒ "hoy" civil de la org` (`organizations.timezone`, mig
240:22-23, mismo cálculo que 245:134) y `p_sections NULL ⇒ todas`.

Qué reutiliza **verbatim** de 244/250/251:
- CTE `range_appointments` completa (251:29-66) incluida `collected_in_range` (251:51-58) y el
  precio real (251:43-46). Único cambio: `a.organization_id = p_org_id`.
- CTE `range_payments` con el CASE de cubetas (251:71-80) sin tocar; se añaden columnas para
  agrupar (`id, appointment_id, treatment_plan_id, treatment_concept_id, sale_id, notes`).
- Cubetas de referencia `payments_amount / treatment_payments_amount / collected_breakdown`
  (251:98-105, 120-129) reproducidas en la CTE `buckets` y devueltas en `reconciliation`.
- Gating M12 (236:51-60): `p_org_id ∈ get_user_org_ids()` + `get_user_org_role(p_org_id)` ∈
  owner/admin (235:68-78). `treatments_caller_role` (245:30-44) no aplica: existe para mapear
  asesoras del módulo Tratamientos, no para un reporte financiero global.
- Grants como 193(d)/198:206-209: `REVOKE … FROM PUBLIC, anon; GRANT … TO authenticated`.

Forma del JSON (ejemplo real del harness recortado):

```json
{
  "range": {"from":"2026-09-01","to":"2026-09-07","timezone":"America/Lima"},
  "role": "owner",
  "sections_available": {"services":true,"advances":true,"pharmacy":true,"treatments":true},
  "sections": {
    "services":   {"rows":[{"description":"1era consulta de fertilidad","quantity":2,"price":null,"price_min":180,"price_max":200,"total":300,"attended":2,"production_total":380}, …], "total":530},
    "advances":   {"rows":[{"kind":"appointment_future","description":"1era consulta de fertilidad","quantity":1,"price":200,"total":50}, {"kind":"direct",…}, {"kind":"plan","description":"Anticipo a plan — Plan Fisio",…}], "total":900, "by_bucket":{"other_appointments":200,"other":300,"plans":400}},
    "pharmacy":   {"rows":[{"description":"Ovusitol","quantity":3.000,"price":45,"total":135,"voided":false}, …, {"description":"Ventas anuladas (…)","total":45,"voided":true}], "total":187},
    "treatments": {"rows":[{"description":"Honorarios — aspiración","quantity":1,"price":2500,"total":2500}, {"description":"Medicación","quantity":2,"price":null,"price_min":800,"price_max":1200,"total":2000}], "total":4500}
  },
  "grand_total": 6117,
  "reconciliation": {"payments_amount":1617,"treatment_payments_amount":4500,"collected_breakdown":{…},"expected_grand_total":6117,"refunds_in_range":-95}
}
```

### SQL completo (validado en el harness; archivo `get_custom_report.sql`)

```sql
-- ═══════════════════════════════════════════════════════════════════
-- BORRADOR mig 2XX: get_custom_report — "Reporte personalizado" de /reports
--
-- Un solo RPC, una sola pasada por citas y cobros del rango, JSON con las
-- tablas agrupadas de cada sección + total por sección + TOTAL FINAL.
--
-- REGLA DE ORO: cada sección REPRODUCE una cubeta de
-- get_reports_overview(mig 250/251).totals.collected_breakdown — mismas
-- CTEs (copiadas, no reescritas), mismo rango por payment_date, mismo
-- source, mismo precio real de la cita (mig 100/219):
--   SERVICIOS                 = collected_breakdown.period_appointments
--   ABONOS Y SERVICIOS FUTUROS= other_appointments + other + plans
--   FARMACIA                  = collected_breakdown.pharmacy
--   PAGOS POR TRATAMIENTOS    = totals.treatment_payments_amount
--   TOTAL FINAL (4 secciones) = payments_amount + treatment_payments_amount
--
-- Gating (patrón M12, mig 236): org del caller + rol owner/admin.
-- Cambios respecto de la 251 (deliberados, comentados con "custom:"):
--   · organization_id = p_org_id (org explícita, ya gateada) en vez de
--     IN (SELECT get_user_org_ids()): sargable y sin mezclar orgs de un
--     usuario multi-org.
--   · range_payments expone las columnas de agrupación (appointment_id,
--     treatment_plan_id, treatment_concept_id, sale_id, notes). El CASE
--     de la cubeta es VERBATIM.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_custom_report(
  p_org_id   uuid,
  p_from     date   DEFAULT NULL,   -- NULL ⇒ "hoy" civil de la org (mig 240)
  p_to       date   DEFAULT NULL,   -- NULL ⇒ p_from
  p_sections text[] DEFAULT NULL    -- NULL ⇒ todas las disponibles
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role        text;
  v_tz          text;
  v_today       date;
  v_from        date;
  v_to          date;
  v_sections    text[];
  v_has_almacen boolean;
  v_has_fert    boolean;
  result        json;
BEGIN
  -- ── Gating: org del caller + rol permitido (patrón M12, mig 236) ──
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_role := get_user_org_role(p_org_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- ── "Hoy" civil de la org (mig 240 / 245), nunca CURRENT_DATE en UTC ──
  SELECT COALESCE(o.timezone, 'America/Lima') INTO v_tz
    FROM organizations o WHERE o.id = p_org_id;
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_from  := COALESCE(p_from, v_today);
  v_to    := COALESCE(p_to, v_from);
  IF v_to < v_from THEN
    RAISE EXCEPTION 'Rango inválido: la fecha final es anterior a la inicial'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_to - v_from > 366 THEN
    RAISE EXCEPTION 'El rango máximo del reporte es de un año'
      USING ERRCODE = 'check_violation';
  END IF;

  v_sections := COALESCE(p_sections, ARRAY['services','advances','pharmacy','treatments']);
  IF EXISTS (
    SELECT 1 FROM unnest(v_sections) s
    WHERE s NOT IN ('services','advances','pharmacy','treatments')
  ) THEN
    RAISE EXCEPTION 'Sección desconocida' USING ERRCODE = 'check_violation';
  END IF;

  -- Módulos activos (mismo criterio que la RLS de pharmacy_sales, mig 216,
  -- y que treatment_start_from_budget, mig 245).
  SELECT EXISTS (
    SELECT 1 FROM organization_addons oa
    WHERE oa.organization_id = p_org_id AND oa.addon_key = 'almacen' AND oa.enabled = true
  ) INTO v_has_almacen;
  SELECT EXISTS (
    SELECT 1 FROM organization_addons oa
    WHERE oa.organization_id = p_org_id
      AND oa.addon_key IN ('fertility_basic','fertility_premium') AND oa.enabled = true
  ) INTO v_has_fert;

  WITH range_appointments AS (
    -- VERBATIM mig 251 (custom: organization_id = p_org_id).
    SELECT
      a.id                                   AS appointment_id,
      a.appointment_date,
      a.start_time,
      a.status,
      COALESCE(d.full_name, 'Sin doctor')    AS doctor_name,
      COALESCE(d.color, '#9ca3af')           AS doctor_color,
      COALESCE(s.name, 'Sin servicio')       AS service_name,
      -- Precio REAL de la cita (fórmula canónica mig 100 / 219): precio
      -- acordado con fallback al catálogo, menos descuento, nunca negativo.
      GREATEST(
        0,
        COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0)
      )                                      AS base_price,
      COALESCE(o.name, 'Sin consultorio')    AS office_name,
      -- Mig 251: cobrado sobre ESTA cita dentro del rango (clínico, sin
      -- farmacia ni tratamientos). Mismo criterio que la cubeta
      -- period_appointments de collected_breakdown.
      COALESCE((
        SELECT SUM(pp.amount) FROM patient_payments pp
        WHERE pp.appointment_id = a.id
          AND pp.payment_date >= v_from
          AND pp.payment_date <= v_to
          AND COALESCE(pp.source, 'clinical') = 'clinical'
          AND pp.treatment_id IS NULL
      ), 0)                                  AS collected_in_range
    FROM appointments a
    LEFT JOIN doctors d  ON d.id = a.doctor_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN offices o  ON o.id = a.office_id
    WHERE a.organization_id = p_org_id
      AND a.appointment_date >= v_from
      AND a.appointment_date <= v_to
  ),
  range_payments AS (
    -- Cobros del rango por fecha de pago, ya clasificados en su cubeta.
    -- CASE VERBATIM mig 250/251 (custom: columnas extra para agrupar).
    SELECT
      pp.id,
      pp.amount,
      pp.appointment_id,
      pp.treatment_plan_id,
      pp.treatment_concept_id,
      pp.sale_id,
      pp.notes,
      CASE
        WHEN COALESCE(pp.source, 'clinical') = 'pos'            THEN 'pharmacy'
        WHEN pp.treatment_id IS NOT NULL                        THEN 'treatments'
        WHEN pp.appointment_id IS NOT NULL
             AND pp.appointment_id IN (SELECT appointment_id FROM range_appointments)
                                                                THEN 'period_appointments'
        WHEN pp.appointment_id IS NOT NULL                      THEN 'other_appointments'
        WHEN pp.treatment_plan_id IS NOT NULL                   THEN 'plans'
        ELSE 'other'
      END AS bucket
    FROM patient_payments pp
    WHERE pp.organization_id = p_org_id
      AND pp.payment_date >= v_from
      AND pp.payment_date <= v_to
  ),

  -- ── 1. SERVICIOS = cubeta period_appointments, agrupada por servicio ──
  -- Cantidad = citas del rango con cobro en el rango; Precio = precio real
  -- de esas citas (NULL = "varios" cuando difieren); Total = Σ cobrado.
  -- attended / production_total replican `services[].revenue` de la mig
  -- 198/251 (producción: precio de las citas completadas) por si la UI
  -- quiere una columna secundaria "Atendidas / Producción".
  svc AS (
    SELECT
      ra.service_name                                                     AS description,
      COUNT(*) FILTER (WHERE ra.collected_in_range > 0)                   AS quantity,
      MIN(ra.base_price) FILTER (WHERE ra.collected_in_range > 0)         AS price_min,
      MAX(ra.base_price) FILTER (WHERE ra.collected_in_range > 0)         AS price_max,
      COALESCE(SUM(ra.collected_in_range), 0)                             AS total,
      COUNT(*) FILTER (WHERE ra.status = 'completed')                     AS attended,
      COALESCE(SUM(ra.base_price) FILTER (WHERE ra.status = 'completed'), 0) AS production_total,
      MIN(ra.appointment_date)                                            AS first_date
    FROM range_appointments ra
    GROUP BY ra.service_name
    HAVING COALESCE(SUM(ra.collected_in_range), 0) > 0
        OR COUNT(*) FILTER (WHERE ra.status = 'completed') > 0
  ),

  -- ── 2. ABONOS Y SERVICIOS FUTUROS = other_appointments + other + plans ──
  adv_appt AS (
    -- Cobros del rango sobre citas de OTRAS fechas: adelantos (cita
    -- posterior al rango) y pagos atrasados (cita anterior).
    SELECT
      CASE WHEN a.appointment_date > v_to THEN 'appointment_future'
           ELSE 'appointment_past' END                                    AS kind,
      COALESCE(s.name, 'Sin servicio')                                    AS description,
      COUNT(DISTINCT rp.appointment_id)                                   AS quantity,
      MIN(GREATEST(0, COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0))) AS price_min,
      MAX(GREATEST(0, COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0))) AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    JOIN appointments a ON a.id = rp.appointment_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE rp.bucket = 'other_appointments'
    GROUP BY 1, 2
  ),
  adv_direct AS (
    -- Abonos directos: registrados desde el drawer del paciente (o link de
    -- cobro Culqi) sin cita, plan ni tratamiento. Cantidad = nº de cobros.
    SELECT
      'direct'::text                                                      AS kind,
      'Abono directo (sin cita asociada)'::text                           AS description,
      COUNT(*)                                                            AS quantity,
      MIN(rp.amount)                                                      AS price_min,
      MAX(rp.amount)                                                      AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    WHERE rp.bucket = 'other'
    HAVING COUNT(*) > 0
  ),
  adv_plan AS (
    -- Anticipos a planes de tratamiento (mig 099, core). El founder no
    -- los listó; si se omiten, TOTAL FINAL no cuadra con "Cobrado total".
    SELECT
      'plan'::text                                                        AS kind,
      'Anticipo a plan — ' || COALESCE(tp.title, 'Plan sin título')       AS description,
      COUNT(*)                                                            AS quantity,
      MIN(rp.amount)                                                      AS price_min,
      MAX(rp.amount)                                                      AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    LEFT JOIN treatment_plans tp ON tp.id = rp.treatment_plan_id
    WHERE rp.bucket = 'plans'
    GROUP BY 2
  ),
  adv AS (
    SELECT * FROM adv_appt
    UNION ALL SELECT * FROM adv_direct
    UNION ALL SELECT * FROM adv_plan
  ),

  -- ── 3. FARMACIA = cubeta pharmacy, detallada por producto ──
  -- Del cobro (source='pos') a su venta por sale_id (PK) y a sus líneas.
  -- Σ line_total de una venta confirmada == pharmacy_sales.total ==
  -- patient_payments.amount (pharmacy_confirm_sale, mig 217/232).
  pos_pay AS (
    SELECT rp.id, rp.amount, rp.sale_id, s.status AS sale_status
    FROM range_payments rp
    LEFT JOIN pharmacy_sales s ON s.id = rp.sale_id AND s.organization_id = p_org_id
    WHERE rp.bucket = 'pharmacy'
  ),
  ph_items AS (
    SELECT
      i.description,
      SUM(i.quantity)                                                     AS quantity,
      MIN(i.unit_price)                                                   AS price_min,
      MAX(i.unit_price)                                                   AS price_max,
      SUM(i.line_total)                                                   AS total,
      false                                                               AS voided
    FROM pos_pay pp
    JOIN pharmacy_sale_items i ON i.sale_id = pp.sale_id
    WHERE pp.sale_status = 'confirmada'
    GROUP BY i.description
  ),
  ph_voided AS (
    -- La venta anulada CONSERVA su cobro (mig 217/232: la devolución vive
    -- en cash_movements si Caja está activa; sin Caja no hay reverso).
    -- Por eso sigue dentro de "Cobrado total" y aquí se muestra aparte.
    SELECT
      'Ventas anuladas (cobro aún registrado; devolución por Caja)'::text AS description,
      COUNT(*)::numeric                                                   AS quantity,
      MIN(pp.amount)                                                      AS price_min,
      MAX(pp.amount)                                                      AS price_max,
      SUM(pp.amount)                                                      AS total,
      true                                                                AS voided
    FROM pos_pay pp
    WHERE pp.sale_status = 'anulada'
    HAVING COUNT(*) > 0
  ),
  ph_orphan AS (
    -- Cobro pos sin venta localizable (no debería existir; cierre contable).
    SELECT
      'Farmacia (sin detalle de venta)'::text                             AS description,
      COUNT(*)::numeric                                                   AS quantity,
      MIN(pp.amount)                                                      AS price_min,
      MAX(pp.amount)                                                      AS price_max,
      SUM(pp.amount)                                                      AS total,
      false                                                               AS voided
    FROM pos_pay pp
    WHERE pp.sale_status IS NULL OR pp.sale_status NOT IN ('confirmada','anulada')
    HAVING COUNT(*) > 0
  ),
  ph_adjust AS (
    -- Cierre contable: si Σ líneas ≠ Σ cobros pos (p.ej. alguien editó
    -- patient_payments.amount de una venta fuera de turno cerrado — la
    -- policy de UPDATE de la mig 008 lo permite), la diferencia aparece
    -- como fila y la sección SIGUE cuadrando con la cubeta pharmacy.
    SELECT
      'Ajuste (cobro registrado ≠ detalle de venta)'::text                AS description,
      NULL::numeric                                                       AS quantity,
      NULL::numeric                                                       AS price_min,
      NULL::numeric                                                       AS price_max,
      (SELECT COALESCE(SUM(amount), 0) FROM pos_pay)
        - (SELECT COALESCE(SUM(total), 0) FROM ph_items)
        - (SELECT COALESCE(SUM(total), 0) FROM ph_voided)
        - (SELECT COALESCE(SUM(total), 0) FROM ph_orphan)                 AS total,
      false                                                               AS voided
  ),
  ph AS (
    SELECT * FROM ph_items
    UNION ALL SELECT * FROM ph_voided
    UNION ALL SELECT * FROM ph_orphan
    UNION ALL SELECT * FROM ph_adjust WHERE total <> 0
  ),

  -- ── 4. PAGOS POR TRATAMIENTOS = treatment_payments_amount, por concepto ──
  tr AS (
    SELECT
      COALESCE(c.label, 'Sin concepto')                                   AS description,
      COUNT(*)                                                            AS quantity,
      MIN(rp.amount)                                                      AS price_min,
      MAX(rp.amount)                                                      AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    LEFT JOIN treatment_payment_concepts c ON c.id = rp.treatment_concept_id
    WHERE rp.bucket = 'treatments'
    GROUP BY 1
  ),

  -- ── Cubetas de referencia (VERBATIM mig 250/251) para reconciliar ──
  buckets AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE bucket <> 'treatments'), 0)         AS payments_amount,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'treatments'), 0)          AS treatment_payments_amount,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'period_appointments'), 0) AS period_appointments,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'other_appointments'), 0)  AS other_appointments,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'plans'), 0)               AS plans,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'pharmacy'), 0)            AS pharmacy,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'other'), 0)               AS other
    FROM range_payments
  ),
  totals AS (
    SELECT
      (SELECT COALESCE(SUM(total), 0) FROM svc) AS services_total,
      (SELECT COALESCE(SUM(total), 0) FROM adv) AS advances_total,
      (SELECT COALESCE(SUM(total), 0) FROM ph)  AS pharmacy_total,
      (SELECT COALESCE(SUM(total), 0) FROM tr)  AS treatments_total,
      b.*
    FROM buckets b
  )
  SELECT json_build_object(
    'range', json_build_object('from', v_from, 'to', v_to, 'timezone', v_tz),
    'role', v_role,
    -- Qué secciones existen para ESTA org: módulos activos, o datos
    -- históricos aunque el módulo se haya apagado (mismo criterio que
    -- showTreatments en financial-report.tsx:185).
    'sections_available', json_build_object(
      'services',   true,
      'advances',   true,
      'pharmacy',   v_has_almacen OR t.pharmacy > 0,
      'treatments', v_has_fert OR t.treatments_total > 0
    ),
    'sections', json_build_object(
      'services', CASE WHEN 'services' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total,
                   'attended', attended,
                   'production_total', production_total
                 ) ORDER BY total DESC, first_date ASC, description ASC), '[]'::json) FROM svc),
        'total', t.services_total
      ) END,
      'advances', CASE WHEN 'advances' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'kind', kind,
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total
                 ) ORDER BY kind, total DESC, description ASC), '[]'::json) FROM adv),
        'total', t.advances_total,
        'by_bucket', json_build_object(
          'other_appointments', t.other_appointments, 'other', t.other, 'plans', t.plans)
      ) END,
      'pharmacy', CASE WHEN 'pharmacy' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total,
                   'voided', voided
                 ) ORDER BY voided ASC, total DESC, description ASC), '[]'::json) FROM ph),
        'total', t.pharmacy_total
      ) END,
      'treatments', CASE WHEN 'treatments' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total
                 ) ORDER BY total DESC, description ASC), '[]'::json) FROM tr),
        'total', t.treatments_total
      ) END
    ),
    -- TOTAL FINAL = Σ de las secciones marcadas.
    'grand_total',
        CASE WHEN 'services'   = ANY(v_sections) THEN t.services_total   ELSE 0 END
      + CASE WHEN 'advances'   = ANY(v_sections) THEN t.advances_total   ELSE 0 END
      + CASE WHEN 'pharmacy'   = ANY(v_sections) THEN t.pharmacy_total   ELSE 0 END
      + CASE WHEN 'treatments' = ANY(v_sections) THEN t.treatments_total ELSE 0 END,
    -- Reconciliación con get_reports_overview (misma definición, mismo rango).
    'reconciliation', json_build_object(
      'payments_amount',           t.payments_amount,
      'treatment_payments_amount', t.treatment_payments_amount,
      'collected_breakdown', json_build_object(
        'period_appointments', t.period_appointments,
        'other_appointments',  t.other_appointments,
        'plans',               t.plans,
        'pharmacy',            t.pharmacy,
        'other',               t.other),
      'expected_grand_total',
          CASE WHEN 'services'   = ANY(v_sections) THEN t.period_appointments ELSE 0 END
        + CASE WHEN 'advances'   = ANY(v_sections) THEN t.other_appointments + t.other + t.plans ELSE 0 END
        + CASE WHEN 'pharmacy'   = ANY(v_sections) THEN t.pharmacy ELSE 0 END
        + CASE WHEN 'treatments' = ANY(v_sections) THEN t.treatment_payments_amount ELSE 0 END,
      -- Informativo, FUERA del total: devoluciones registradas en Caja en
      -- el rango (fecha civil de la org). get_reports_overview no las
      -- neta; el dashboard v3 (mig 230/233) sí. Ver pregunta al founder.
      'refunds_in_range', (
        SELECT COALESCE(SUM(cm.amount), 0)
        FROM cash_movements cm
        WHERE cm.organization_id = p_org_id
          AND cm.movement_type = 'devolucion'
          AND (cm.created_at AT TIME ZONE v_tz)::date >= v_from
          AND (cm.created_at AT TIME ZONE v_tz)::date <= v_to
      )
    )
  ) INTO result
  FROM totals t;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_custom_report(uuid, date, date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_custom_report(uuid, date, date, text[]) TO authenticated;

COMMENT ON FUNCTION public.get_custom_report(uuid, date, date, text[]) IS
  'Reporte personalizado de /reports: tablas agrupadas (Descripción · Cantidad · Precio · Total) por sección + TOTAL FINAL. Cada sección reproduce una cubeta de get_reports_overview.collected_breakdown (misma CTE, mismo rango por payment_date). Gating M12: owner/admin de p_org_id.';
```

Notas de implementación:
- Rollback trivial: `DROP FUNCTION public.get_custom_report(uuid, date, date, text[]);` (no toca
  tablas ni otras funciones; patrón `rollbacks/25x_*`).
- Cliente: `supabase.rpc("get_custom_report", { p_org_id, p_from, p_to, p_sections })` desde el
  componente, como `reports/page.tsx:136-139` hace con `get_reports_overview`. El "Hoy" del
  preset **debe** salir de `useOrgToday()` (`hooks/use-org-today.ts:18`), no de `new Date()`.
- Impresión/PDF: ya hay `lib/report-export.ts` (jspdf + html2canvas, `package.json:53-54`) y
  `ReportExportConfig` (`lib/report-export-types.ts:17-23`: `kpis[] + tables[]`) — el JSON de
  arriba se mapea 1:1 a `tables[]` (una por sección) + `kpis[]` (TOTAL FINAL). Para "imprimir" basta
  un `@media print` sobre las tablas, más barato y fiel que html2canvas.

---

## 5. Rendimiento

**Índices existentes que sirven (verificados en migraciones):**

| Acceso del RPC | Índice | Mig |
|---|---|---|
| `patient_payments WHERE organization_id = ? AND payment_date BETWEEN` (CTE `range_payments`) | `idx_patient_payments_org_date (organization_id, payment_date)` | 057:20-21 |
| `appointments WHERE organization_id = ? AND appointment_date BETWEEN` (CTE `range_appointments`) | `idx_appointments_org_date` / `idx_appointments_org_date_status` | 057:8-13 |
| subconsulta correlada `collected_in_range` por cita | `idx_patient_payments_appt_amt (appointment_id) INCLUDE (amount)` (los filtros `payment_date/source/treatment_id` requieren visitar el heap: no es covering para esta consulta) | 103:38-39 |
| `pharmacy_sales` por `sale_id` | PK (no existe índice en `pharmacy_sales(payment_id)` ni en `patient_payments(sale_id)`: por eso el join va de cobro → venta por PK, nunca al revés) | 216:41 |
| `pharmacy_sale_items WHERE sale_id` | `idx_pharmacy_sale_items_sale (sale_id, position)` | 216:259-260 |
| `treatment_payment_concepts`, `treatment_plans`, `appointments` (ABONOS) | PK | — |
| `organization_addons (organization_id, addon_key)` | PK | 091:36 |
| `cash_movements` devoluciones por org | `idx_cash_movements_org_created (organization_id, created_at DESC)` — el filtro es sobre `created_at AT TIME ZONE`, **no sargable**: lee todos los movimientos de la org. Son pocos (solo egresos/devoluciones), aceptable; si crece, índice de expresión o filtrar `created_at` por un rango UTC ampliado ±1 día antes de convertir | 214:227-228 |
| No usado pero disponible | `idx_appointments_org_service_date (organization_id, service_id, appointment_date)` 203:23-24 — solo serviría si SERVICIOS agrupara por `service_id` directo sin pasar por `range_appointments` | 203 |
| Parciales que **no** aplican al rango por fecha | `idx_payments_treatment` (242:212-213), `idx_payments_plan` (099:74-76): son por FK, útiles para la ficha, no para "cobros del rango" | — |

**Volumen esperado (estimado, sin prod).** Referencias del repo: clínica piloto con 4 citas y ~10
cobros en un día "grande" (mig 250:3-7), y el perf review advierte de "2000+ filas" de citas en un
rango de 90 días para una clínica establecida (`docs/performance-review-2026-04-22.md:105`). Por
rango: **Hoy** ≈ 5-30 citas, 5-50 cobros; **mes** ≈ 100-700 citas, 150-1 000 cobros; **año** (tope
del RPC, 366 días) ≈ 1 200-8 000 citas, 2 000-12 000 cobros. Trabajo del RPC: dos range scans por
índice (citas, cobros) + una sonda de índice por cita (`collected_in_range`) + N_pos lecturas por
PK + N_pos scans de líneas. Todo lineal en filas del rango; decenas de ms en el peor caso anual.
Salida: filas = servicios distintos (≤ 50) + productos vendidos (≤ 200) + conceptos (10) + abonos
(≤ 50) → < 20 KB. La CTE `range_appointments` se referencia dos veces (svc y el `IN` del CASE): se
materializa una vez, como en la 251.

**RPC vs cliente: RPC, sin duda.** Es el mismo argumento de la mig 198:6-18: PostgREST trunca a
1 000 filas en silencio y agregar en el navegador exige N+1 (Farmacia hoy trae ventas y luego
líneas por lotes de ids, `farmacia/page.tsx:205-232`). Además la única forma de garantizar "misma
fórmula que Cobrado total" es compartir la CTE en SQL. Coste extra en el servidor respecto de
`get_reports_overview`: el join de líneas de farmacia y tres GROUP BY pequeños; despreciable.
Oportunidad (no necesaria): `collected_in_range` podría calcularse con un JOIN a `range_payments`
en vez de la subconsulta correlada, pero rompería el "verbatim" con la 251; no lo recomiendo hasta
que la 251 misma lo cambie.

**Caché cliente**: React Query con clave `["custom-report", orgId, from, to, sections]`, como
`["reports","shared",…]` en `reports/page.tsx:130`; imprimir no vuelve a consultar.

---

## 6. Gating por módulos y especialidad

| Org | Secciones que existen | Fuente |
|---|---|---|
| **Core** (sin addons) | SERVICIOS · ABONOS Y SERVICIOS FUTUROS (incl. `plan` si usan planes, que son core 099) · TOTAL FINAL. FARMACIA y TRATAMIENTOS ocultas **salvo que haya datos históricos** en el rango (`sections_available` = addon activo **o** cubeta > 0, mismo criterio que `showTreatments` en `financial-report.tsx:184-185`) | RPC |
| **+ `almacen`** (Farmacia vive dentro, `lib/module-lifecycle-emails.ts:43-44`; S/39 o incluido desde Centro Médico, 210:62-65) | + FARMACIA. El gate es `organization_addons.enabled` (216:332-342 y 232:167-175), **no** `addons.is_active` (beta oculta, 209:14-15) | RPC |
| **+ `fertility_basic|premium`** | + PAGOS POR TRATAMIENTOS (conceptos sembrados por org, 242:184-194; etiquetas editables en Admin) | RPC |
| **`caja`** | No añade sección. Solo cambia si las devoluciones dejan rastro (`refunds_in_range`) o borran pagos (§2f) | — |

**Especialidad** (`organizations.primary_specialty_id`, `organization_specialties`, 076:25-54):
**no cambia ningún número**. Lo único que difiere es el catálogo de servicios (nombres) y, en
fertilidad, que los tratamientos TRA son `is_bookable=false` (239:3-19) y por tanto nunca
aparecen en SERVICIOS sino en TRATAMIENTOS. El mapeo canónico (`organization_service_canonical_mapping`,
127:51-58) que usa `api/reports/fertility/route.ts:122-135` para identificar "1ª/2ª consulta"
**no** debe usarse aquí: la doctora quiere leer sus nombres de servicio, no categorías canónicas.
Recomendación: cero lógica de especialidad en el RPC; como mucho, el título de la sección
("SERVICIOS" → "CONSULTAS Y PROCEDIMIENTOS") lo decide la UI.

**Roles**: owner/admin (M12, `docs/security-review-2026-09-01.md:91`). Un doctor no ve el
reporte (el dashboard del doctor ya limita a sus citas, y aquí saldrían honorarios de otros).
Recepción: hoy `forbidden`; ver pregunta 5.

---

## 7. Riesgos y preguntas para el founder (con recomendación)

1. **Planes de tratamiento no listados (cubeta `plans`).** Sin ellos TOTAL FINAL ≠ Cobrado total.
   → Recomiendo mostrarlos dentro de ABONOS Y SERVICIOS FUTUROS como "Anticipo a plan — <título>"
   (ya implementado). ¿De acuerdo, o prefieres una quinta sección?
2. **Ventas de farmacia anuladas siguen contando como cobro** (232:446-493 deja el pago; sin Caja
   no hay reverso; `get_reports_overview` no lee `cash_movements`). El reporte las muestra en una
   fila propia para cuadrar con "Cobrado total". → Recomiendo una mig posterior que excluya de
   las cubetas los cobros pos con venta `anulada` **en `get_reports_overview` y en este RPC a la
   vez**, y que el Dashboard deje de depender de `cash_movements` para ese caso. ¿TOTAL FINAL debe
   restar devoluciones (Caja) o quedarse bruto como "Cobrado total"?
3. **"Precio" cuando difiere.** → Precio real si es único; "varios (S/ min – max)" si no; nunca
   promedio. Aviso en el pie: "Cantidad × Precio puede no coincidir con Total por cobros parciales
   y descuentos". ¿Vale, o quieres una columna "Pendiente" por servicio? (tiene otra fórmula,
   251:107-118, y otra semántica de estado; no la recomiendo en esta hoja).
4. **SERVICIOS mide caja, no producción** (decisión del 7-sep, mig 251). Una consulta atendida y
   no pagada no suma; una cancelada con cobro sí. → Mantener caja y ofrecer columnas secundarias
   "Atendidas / Producción" (`attended`, `production_total` == "Ingresos por servicio"). ¿Las
   quieres impresas o solo en pantalla?
5. **¿Quién imprime?** El RPC es owner/admin (M12). Si recepción debe imprimir el cierre del día,
   → abrir `receptionist` solo con `p_from = p_to = hoy` y **sin** la sección TRATAMIENTOS (las
   etiquetas "Honorarios — …" son lo que `get_treatments_overview` le oculta, 245:13-15, 282).
6. **Usuario multi-org**: `get_reports_overview` mezcla todas las orgs del usuario (251:63, 82);
   el reporte es por org. → Mig que añada `p_org_id` a `get_reports_overview` (o wrapper) para que
   ambas pantallas cuadren también para ti (dos orgs). Para la doctora es indiferente.
7. **"Hoy" en Reportes usa `new Date()`** (`reports/page.tsx:97-98, 171`): después de las 19:00
   Lima el preset pide mañana — la misma clase de bug de la mig 240. → El reporte personalizado usa
   `useOrgToday()` y el RPC acepta `p_from/p_to NULL ⇒ hoy de la org`; arreglar también los presets
   existentes en el mismo PR.
8. **El reporte es una foto**: sin Caja, devolver una cita borra o reduce el pago (233:148-169) y
   el mismo rango cambia de un día a otro; y renombrar un concepto de tratamiento (242: `label` no
   snapshoteada) o un servicio reagrupa la historia. → Pie de página con fecha/hora de generación
   y usuario; no persistir PDFs como verdad contable. ¿Aceptable, o hace falta snapshotear
   `label`/`service name` en el pago/cita (mig aparte)?

---

### Archivos de este directorio
- `datos.md` — este informe.
- `get_custom_report.sql` — borrador del RPC (validado).
- `00_stub_schema.sql` — stub mínimo del esquema (columnas copiadas de las migraciones reales).
- `10_reconcile_test.sql` — datos sintéticos + 38 aserciones.
- `run.sh` — levanta Postgres 16 desechable, aplica mig 251 verbatim y corre el test.
- `test-output.txt` — salida completa (JSON del RPC + PASS/FAIL).
