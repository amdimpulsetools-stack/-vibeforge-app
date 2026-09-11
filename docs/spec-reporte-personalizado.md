# Resumen de cobros del periodo ("Reporte personalizado") — análisis y diseño

> Síntesis del orquestador sobre cuatro informes de expertos (datos, UX, UI, reportes modernos)
> más verificación directa contra producción (org de la Dra. Patricia, 1–10 set. 2026).
> Anexos completos en `docs/reporte-personalizado/` (incluido el SQL del RPC, validado en un
> banco de pruebas con 38 aserciones). **Documento de análisis: no hay código en producción.**

## 0. Resumen ejecutivo

**Qué pidió el founder.** Un subapartado en Reportes donde la doctora marque con checks qué
secciones quiere (Servicios · Abonos y servicios futuros · Farmacia · Pagos por tratamientos),
elija un rango o "Hoy", y obtenga tablas agrupadas *Descripción · Cantidad · Precio · Total* con
un TOTAL FINAL, imprimible o guardable en PDF. Para todas las orgs, con secciones según módulos.

**La conclusión más importante: no hay que inventar ninguna fórmula.** Las cuatro secciones
son, exactamente, las cubetas que `get_reports_overview` (migs 250/251) ya calcula para el
"Cobrado total" del Financiero:

```
SERVICIOS      = period_appointments
ADELANTOS      = other_appointments + other + plans
FARMACIA       = pharmacy
TRATAMIENTOS   = treatments
──────────────────────────────────────────────────────────────
TOTAL FINAL    = Cobrado total + Cobros por tratamientos   (todo marcado)
```

Esa identidad es la regla "un número, una fórmula" de `CLAUDE.md` hecha reporte: la primera
línea del papel coincide con la tarjeta que la doctora ya mira, y la contadora no recibe dos
totales distintos para el mismo periodo. El RPC propuesto copia las CTEs de la mig 251 verbatim
y solo añade agrupaciones encima; el banco de pruebas lo demuestra con datos sintéticos que
cubren parciales, descuentos, canceladas con cobro, anuladas de farmacia, adelantos, planes y
devoluciones.

**Tres decisiones de diseño que marcan la diferencia** (consenso de los cuatro expertos):

1. **"Precio" no es promedio.** Es el precio real de la cita cuando es único en el grupo; si el
   mismo servicio se cobró a precios distintos, "varios (S/ 180 – 200)". Un promedio imprime un
   número que nadie pagó. Consecuencia que se enseña al pie: *Cantidad × Precio puede no ser el
   Total* por cobros parciales y descuentos; **la columna Total es la que manda**.
2. **Planes de tratamiento**, que el founder no listó, van **dentro de Adelantos** como filas
   "Anticipo a plan — título". Si se omiten, el TOTAL FINAL no cuadra con Cobrado total.
3. **Un solo botón: "Imprimir o guardar PDF"**, que genera un PDF A4 con el membrete real de la
   org por el motor Chromium que ya usan receta y orden de examen. Desde el celular es la única
   vía con "compartir por WhatsApp" a un toque.

**Estimación V1: 2,5 a 3 jornadas y 1 migración** (el RPC). Dos migraciones más recomendadas
pero no bloqueantes (§7).

**Cuatro hallazgos colaterales** que salieron al mirar (§8): el menú "Exportar" del Financiero
existe como componente pero **nadie lo monta**; una venta de farmacia **anulada sigue contando**
en Cobrado total; los presets "Hoy/7d/30d" de Reportes usan `new Date()` en vez de la zona
horaria de la org; y no existe ningún `@media print` global, así que Ctrl+P en modo oscuro
imprime texto casi blanco.

---

## 1. El caso, con datos reales

Org de la Dra. Patricia, cobros del 1 al 10 de setiembre de 2026 por fecha de cobro
(consulta directa a producción, solo lectura):

| Contenedor del cobro | Cobros | Monto |
|---|---:|---:|
| Clínico · sobre una cita | 47 | S/ 13 200 |
| Clínico · sin cita, plan ni tratamiento (abono directo) | 2 | S/ 8 900 |
| Clínico · tratamiento | 1 | S/ 1 200 |
| Farmacia (POS) | 22 | S/ 9 592 |
| **Total** | **72** | **S/ 32 892** |

Lo que hoy tiene que hacer la doctora para llegar a esta tabla: abrir Financiero, leer el
desglose flotante de Cobrado total, abrir Tratamientos, abrir Farmacia y sumar a mano. Y aun
así no obtiene la agrupación por servicio ni por producto. Ese es el hueco.

**Cómo quedaría la sección SERVICIOS con esos mismos datos** (agrupada por servicio, cobrado en
el rango sobre citas del rango):

| Descripción | Citas | Precio | Total |
|---|---:|---:|---:|
| Primera consulta de fertilidad | 9 | S/ 200 | S/ 1 800 |
| Consulta continuadora | 6 | S/ 200 | S/ 1 200 |
| Primera teleconsulta de fertilidad | 4 | S/ 150 | S/ 600 |
| Control prenatal | 3 | varios (S/ 0 – 350) | S/ 850 |
| Histerosonografía | 1 | S/ 550 | S/ 750 ¹ |
| Lectura de resultado FIV | 1 | S/ 0 | S/ 4 000 ² |
| Inicio de tratamiento de FIV | 3 | S/ 0 | S/ 1 600 ² |
| Seguimiento ovulatorio (hasta 3 ecografías) | 5 | S/ 0 | S/ 1 000 ² |
| … | | | |

¹ Dos cobros sobre una cita de S/ 550: el segundo fue una consulta de la misma visita (caso del
7-sep). El reporte enseña lo cobrado; no juzga.
² **Dinero de tratamientos registrado sobre citas de precio S/ 0**, la costumbre de antes de que
existiera el módulo Tratamientos (9-sep). Estas filas son correctas como caja, pero el "Precio
S/ 0" delata el problema de datos: ese dinero debería vivir en Tratamientos. El reporte lo hace
visible; no lo arregla (no debe).

**Los dos abonos directos** (S/ 3 500 por Visa, "DESCONGELACION OVOCITOS / FIV"; S/ 5 400 por
Pagolink, "PAGA FIV") se registraron desde la ficha de la paciente con una nota. En la sección
Adelantos la descripción de un abono directo es esa nota; sin nota, "Abono directo (sin cita
asociada)".

---

## 2. Las secciones, definidas de una vez

Regla común: rango por **fecha de cobro** (`payment_date`), montos **brutos con IGV** (así se
cobran; `CLAUDE.md`), cada cobro en **exactamente una** sección. La cabecera de "Cantidad" es
distinta en cada sección porque cuenta cosas distintas.

| Sección (etiqueta propuesta) | Qué incluye (línea llana para la doctora) | Descripción | Cantidad | Precio | Total |
|---|---|---|---|---|---|
| **Servicios** | Lo cobrado en el periodo sobre citas del periodo | nombre del servicio | **citas** con cobro (una cita con dos cobros cuenta 1) | precio real de la cita si único; "varios (min – max)" | Σ cobrado |
| **Adelantos y pagos a cuenta** | Pagos del periodo por citas de otras fechas, anticipos a planes y abonos sin cita | servicio de la cita · "Anticipo a plan — título" · nota del abono | **pagos** | monto si único | Σ |
| **Farmacia** | Ventas de mostrador (productos y servicios vendidos en POS) | nombre del ítem (snapshot) | **unidades** (3 decimales) | precio unitario con IGV | Σ líneas |
| **Cobros por tratamientos** | Pagos de tratamientos por concepto | concepto (Medicación, Aspiración…) | **pagos** ("veces que se cobró") | monto si único | Σ |
| **TOTAL FINAL** | Suma de lo marcado | | | | |

Sub-grupos de Adelantos, con subtítulo en la tabla: *cita futura* (adelanto), *cita anterior*
(pago atrasado), *anticipo a plan*, *abono directo*. Se descarta el nombre "servicios futuros"
porque la cubeta también trae pagos atrasados; "Adelantos y pagos a cuenta" es el vocabulario que
la app ya usa en la ficha del paciente y en el desglose del Financiero.

**Lo que NO entra, y por qué:** pagos directos a terceros de un tratamiento (no son cobro),
"Pendiente por cobrar" (no es caja; tiene su propia fórmula y fue el origen del −4 510 de la
mig 250), y honorarios por doctor (otro reporte).

**Servicios mide caja, no producción.** Es la decisión del 7-sep (mig 251): una consulta
atendida hoy y no pagada no suma; una cancelada con cobro sí; una consulta de ayer pagada hoy
está en Adelantos › *cita anterior*. El RPC devuelve además `attended` y `production_total` por
servicio (= "Ingresos por servicio" de Operacional) por si se quiere una columna secundaria en
pantalla; no se propone una tercera definición.

---

## 3. Reconciliación: la garantía

Cada cobro del rango cae en exactamente una cubeta del `CASE` de `range_payments` (mig 251).
Las secciones cubren cubetas disjuntas y completas, luego con todo marcado:

**TOTAL FINAL = `payments_amount` + `treatment_payments_amount`** de `get_reports_overview`
para el mismo rango. El RPC devuelve `reconciliation.expected_grand_total` en el **mismo
payload** (nunca una segunda llamada) y la UI imprime al pie:

- todo marcado → "✓ Coincide con «Cobrado total» + «Cobros por tratamientos» del Financiero";
- sección desmarcada → "Total de lo marcado" (no "Cobrado total") y lista de secciones
  excluidas **sin montos**;
- si no cuadra → aviso ámbar explícito con la diferencia.

Banco de pruebas: Postgres 16 desechable, mig 251 aplicada verbatim, datos sintéticos con todos
los casos límite, **38 aserciones en verde** (`docs/reporte-personalizado/sql/test-output.txt`).

**Dónde no puede cuadrar por diseño (y qué se dice):**
1. Usuario **multi-org**: `get_reports_overview` suma todas las orgs del usuario; el reporte es
   por org. Para la doctora es idéntico; para el founder con dos orgs, no. Arreglo: `p_org_id`
   en `get_reports_overview` (mig recomendada, §7).
2. **Devoluciones**: Cobrado total es bruto de devoluciones; el reporte también. Línea
   informativa al pie: "Devoluciones registradas en Caja: −S/ …" (si Caja está activa).
3. **El reporte es una foto**: sin Caja, devolver una cita borra el pago; renombrar un servicio
   o un concepto reagrupa la historia. Pie con fecha, hora y usuario de generación.

---

## 4. Experiencia (UX)

- **Dónde:** pestaña nueva en `/reports`, **segunda**, tras Financiero. El rango y el preset
  "Hoy" ya viven en la cabecera de Reportes y se heredan: la doctora alterna Financiero ↔
  Resumen con el mismo periodo, que es justo la comparación que hará con su contadora. No va
  dentro de Financiero (ya tiene siete tarjetas, dos gráficos y una tabla).
- **Estado inicial:** todo marcado, rango heredado. Barra sticky con los checks (chips de 44 px
  con la casilla dentro y un badge con el conteo de filas), el título "Resumen de cobros · Del 1
  al 10 de setiembre de 2026" y el botón. Debajo, la vista previa **es literalmente el papel**.
- **Generación en vivo**: una sola llamada al RPC por rango (cacheada con React Query, como el
  resto de Reportes); los checks solo ocultan secciones y recalculan la suma en cliente. Un
  botón "Generar" crearía estado obsoleto.
- **Secciones que no aplican no se pintan** (ni deshabilitadas). Regla: *módulo activo O
  monto > 0 en el rango* (mismo criterio que `showTreatments` del Financiero), para que
  desactivar un addon no borre dinero histórico del total. Sección aplicable pero vacía → se
  imprime con una fila "Sin cobros · S/ 0.00" (omitirla haría preguntar a la contadora).
- **Estados**: esqueleto por sección; vacío diferenciado ("Todavía no hay cobros hoy" / "Sin
  cobros del 1 al 10"); error con "Intentar de nuevo"; org sin módulos ve dos checks.
- **Presets guardados: no en V1.** Todo marcado por defecto es el seguro.
- **Fuera de V1**: filtro por doctor, comparar periodos, email programado, Excel, medio de
  pago, detalle por paciente, IGV/base imponible.

## 5. Interfaz (UI) e impresión

- **Pantalla React** que replica la receta visual de las tablas del Financiero (tarjeta
  `rounded-xl border bg-card`, cabecera con título + chip + total a la derecha, `thead
  bg-muted/50`, cifras `text-right tabular-nums`, `tfoot` en negrita); `overflow-x-auto` con
  `min-w-[520px]` en móvil. Una única función `priceCell()` produce el texto de Precio para
  pantalla y papel. TOTAL FINAL en bloque destacado con la fila de conciliación.
- **PDF A4 con membrete** por el motor HTML → Chromium (`lib/pdf/html`), reutilizando
  `sheetHead`, `titleRow`, `meta`, `pageFooter` y `table.grid`: cabecera de tabla repetida por
  página, `tfoot { display: table-row-group }` (si no, el total de sección se repite en cada
  hoja), filas con `break-inside: avoid`, datos a ≥ 9 pt. Borrador de `custom-report.hbs` en el
  anexo UI. Ruta `/api/pdf/custom-report?from&to&sections`, abierta en pestaña nueva (patrón de
  receta/orden de examen), gateada por rol.
- **Se descarta como salida principal**: `window.print()` (no hay `@media print` global: en modo
  oscuro sale texto casi blanco) y el exportador raster html2canvas del repo (borroso, no
  pagina). `window.print` queda solo como red de seguridad con `print:hidden` en la cabecera.
- **Moneda**: unificar a `S/ 1,234.50` (formato de Caja, Almacén, Farmacia y del helper `money`
  del PDF) promoviendo `formatPEN` a `lib/format-pen.ts`. Es presentación, no fórmula.
- **Nombre**: pestaña **"Resumen de cobros"**; título del documento **"Resumen de cobros del
  periodo"**, subtítulo "Lo que entró, por concepto · bruto con IGV · por fecha de cobro". Se
  descarta "Reporte personalizado" por genérico; los checks ya dicen que es personalizable.

## 6. Datos: el RPC

`get_custom_report(p_org_id uuid, p_from date, p_to date, p_sections text[])`, SECURITY DEFINER,
gating de rol owner/admin (patrón M12), `p_from/p_to NULL ⇒ hoy de la org`, tope 366 días.
Devuelve JSON: `sections.{services,advances,pharmacy,treatments}` con filas
`{description, kind, qty, price, price_min, price_max, total, voided?}` + `total` por sección +
`sections_available` + `grand_total` + `reconciliation {expected_grand_total, refunds_in_range}`.
Copia verbatim las CTEs `range_payments` y `range_appointments` de la mig 251. Índices
existentes cubren todos los accesos (`idx_patient_payments_org_date`, `idx_appointments_org_date`,
`idx_pharmacy_sale_items_sale`); trabajo lineal en filas del rango, decenas de ms en el peor
caso anual; salida < 20 KB. Cálculo en el RPC, no en el cliente (PostgREST trunca a 1 000 filas
en silencio y la única forma de garantizar "misma fórmula" es compartir la CTE en SQL).
SQL completo y validado: `docs/reporte-personalizado/sql/get_custom_report.sql`.

**Gating por módulos** (lo resuelve el RPC en `sections_available`): core → Servicios +
Adelantos; `almacen` → + Farmacia; `fertility_*` → + Tratamientos; `caja` no añade sección, solo
la línea de devoluciones. **La especialidad no cambia ningún número**: solo los nombres del
catálogo; como mucho la UI titula "Consultas y procedimientos" en vez de "Servicios".

---

## 7. Plan de entrega

| Fase | Contenido | Migraciones | Jornadas |
|---|---|---|---|
| **V1** | RPC `get_custom_report` (del borrador validado) · pestaña "Resumen de cobros" · PDF con membrete · conciliación al pie · gating por addon · `useOrgToday()` en los presets de Reportes · `@media print` global de seguridad | 1 (RPC) | 2,5 – 3 |
| **V1.1** (tras 2-4 semanas de uso) | mig: excluir ventas anuladas de las cubetas **en `get_reports_overview` y en el RPC a la vez** · mig: `p_org_id` en `get_reports_overview` (multi-org) · columna "Atendidas / Producción" opcional en pantalla · Excel reutilizando `exportReportExcel` (hoy huérfano) | 2 | 1 – 1,5 |
| **V2** (solo si el PDF mensual se usa ≥ 2 meses en ≥ 3 orgs) | comparar con periodo anterior · filtro por doctor · medio de pago · plantillas guardadas · email programado | 0-1 | 3 – 4 |

Validar antes de V1.1: que la doctora y la contadora usen el PDF en un cierre de mes real.

## 8. Hallazgos colaterales (verificados por el orquestador)

1. **El export del Financiero no existe en producción.** `ExportMenu`, `exportContentPDF` y
   `exportReportExcel` están definidos pero **ningún archivo los importa** (grep en `app/` y
   `components/`). Solo el escritor Excel merece rescatarse (V1.1).
2. **Venta de farmacia anulada = sigue contando.** `pharmacy_void_sale` (mig 232) revierte stock
   y, si Caja está activa, escribe una devolución en `cash_movements`; **no toca la fila de
   `patient_payments`**, y `get_reports_overview` no lee `cash_movements`. Hoy en la org de la
   doctora hay 37 ventas confirmadas y 0 anuladas: no ha dolido todavía. El reporte V1 la muestra
   como fila "Ventas anuladas" para cuadrar; V1.1 corrige la cubeta en ambos sitios.
3. **Presets de Reportes con `new Date()`**: después de las 19:00 Lima "Hoy" pide mañana (misma
   clase de bug que la mig 240). Se arregla en el mismo PR de V1.
4. **Sin `@media print` global**: Ctrl+P en modo oscuro imprime casi en blanco (afecta hoy a
   Almacén y Caja). Ocho líneas de CSS en V1.
5. **Dinero de tratamientos sobre citas de S/ 0** (Lectura de resultado FIV, Inicio de FIV,
   Seguimiento ovulatorio): visible en el ejemplo real. No es del reporte; es la migración de
   costumbre a Tratamientos ya anotada el 9-sep.

## 9. Decisiones que le tocan al founder (con recomendación)

1. **Nombre**: "Resumen de cobros" en vez de "Reporte personalizado". → Sí.
2. **Precio** en Servicios: precio real si único, "varios (min – max)" si no; nunca promedio;
   nota al pie sobre parciales. → Sí. (Alternativa: quitar la columna en Servicios y dejarla solo
   en Farmacia, como propone UX. Recomiendo mantenerla: el founder la pidió y con "varios" no
   miente.)
3. **Planes** dentro de Adelantos como "Anticipo a plan — título", no quinta sección. → Sí.
4. **TOTAL FINAL bruto** (igual a Cobrado total) con devoluciones como línea informativa; el
   neteo se decide con la contadora en V1.1. → Sí.
5. **Quién imprime**: owner/admin. Si recepción debe imprimir el cierre del día → abrirle solo
   "Hoy" y **sin** la sección Tratamientos (honorarios). → Owner/admin en V1; recepción, si lo
   piden.
6. **Servicios = caja** (decisión del 7-sep). Columna secundaria "Atendidas / Producción" solo en
   pantalla, no en el papel. → Sí.
7. **Corregir las ventas anuladas** en `get_reports_overview` y el RPC a la vez, en V1.1, no en
   V1 (cambiaría un número que la doctora ya mira sin avisar). → Sí.
8. **Rango heredado de la cabecera** de Reportes, no forzar "Hoy". → Sí.

---

### Anexos (`docs/reporte-personalizado/`)
- `anexo-datos.md` — mapa sección → datos, definiciones, reconciliación, RPC, rendimiento, gating.
- `anexo-ux.md` — flujo, nombres, estados, cuadre con Financiero, preguntas.
- `anexo-ui.md` — anatomía de pantalla y tablas, hoja A4, borrador `custom-report.hbs`, componentes.
- `anexo-benchmark.md` — Square, Toast, Lightspeed, QuickBooks, Jane, Cliniko, Open Dental,
  Dentrix, SimplePractice; table stakes; errores clásicos; roadmap.
- `sql/get_custom_report.sql` — borrador del RPC, validado.
- `sql/10_reconcile_test.sql`, `sql/00_stub_schema.sql`, `sql/run.sh`, `sql/test-output.txt` —
  banco de pruebas (Postgres 16 desechable + mig 251 verbatim) y su salida: 38 aserciones en verde.
