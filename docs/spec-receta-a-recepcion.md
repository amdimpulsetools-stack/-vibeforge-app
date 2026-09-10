# Spec: Receta → Recepción (y, en V2, → Farmacia)

**Versión:** 1.0 — borrador de diseño para decisión del founder
**Fecha:** 10 de septiembre, 2026
**Estado:** propuesta. Nada implementado.
**Alcance:** V1 (aviso a recepción) y V2 (puente con Farmacia/Almacén).
**Pedido origen:** founder — *"cuando la doctora ordene una receta, que le aparezca la orden a recepción […] debe ser una opción activable desde el panel […] en una V2 precargar los medicamentos disponibles en farmacia […] todo en perfecto link con almacén."*

---

## 0. Resumen de una página

| | V1 | V2 |
|---|---|---|
| **Qué resuelve** | Recepción se entera, en el momento, de que la paciente sale con receta | Recepción vende esa receta en Farmacia sin re-digitar |
| **Migraciones** | 2 | 1–2 |
| **Jornadas** | 2.5 – 3.5 | 4 – 6 |
| **Depende del addon `almacen`** | No | Sí |
| **Encendido por org** | Sí, apagado por defecto | Sí (hereda el de V1 + addon) |
| **Mecanismo nuevo** | Ninguno: reusa notificaciones en vivo + dashboard de recepción | Ninguno: reusa `?add=` del POS + `pharmacy_confirm_sale` |
| **Hueco real** | La receta no guarda a QUÉ medicamento del catálogo apunta | Ese mismo hueco, pero ahí sí es bloqueante |

Las tres cosas que hay que decidir antes de escribir código están en §5. La más importante: **qué ve exactamente recepción de la receta** (§3.6).

---

## 1. El caso y por qué duele hoy

### 1.1 Lo que pasa realmente

La doctora abre el atajo "Receta" desde la cita (`components/clinical/clinical-shortcuts.tsx:50-58`) o desde el drawer del paciente (`app/(dashboard)/patients/patient-drawer.tsx:933`), compone 1..N medicamentos en el modal (`components/clinical/prescription-composer-modal.tsx`), guarda y —si pulsa "Guardar e imprimir"— abre el PDF del lote (`prescription-composer-modal.tsx:434-440` → `/api/pdf/prescription/batch/[batchId]`).

A partir de ahí, **el sistema no vuelve a saber nada de esa receta**. La paciente camina al mostrador con un papel (o sin él, si la impresora falló o la ventana emergente quedó bloqueada — caso ya contemplado en `prescription-composer-modal.tsx:441-445`).

En el mostrador, recepción:

- No tiene ninguna señal de que esa paciente sale con indicación de medicamentos.
- No sabe si la receta se imprimió o no.
- Si la clínica vende en farmacia, la venta depende de que **la paciente se acuerde de preguntar**, o de que recepción le vea el papel en la mano y lo lea al revés desde el otro lado del mostrador.
- Si vende, tiene que **volver a teclear** cada medicamento en el POS (`app/(dashboard)/farmacia/product-picker.tsx`), buscándolo por nombre en `inventory_products`, adivinando cuál de los tres "Losartán" es el que la doctora quiso.

### 1.2 Por qué esto es dinero, no comodidad

La receta es el único momento del día en que la clínica tiene **demanda cualificada, presencial y con intención de compra**: alguien acaba de recibir la orden de un médico de comprar exactamente estos productos, y está de pie a tres metros del stock. Que esa venta dependa de la memoria de la paciente es el equivalente a tener un carrito lleno y ninguna caja.

El costo secundario es clínico-operativo: si el papel no llegó (impresión fallida, paciente que lo olvida en la camilla), nadie en el mostrador puede detectarlo. Hoy la única forma de saber que hubo receta es entrar a la historia clínica — que recepción no puede ver, por decisión del 8-sep (`app/(dashboard)/scheduler/appointment-sidebar.tsx:2553-2556`).

### 1.3 Lo que NO duele (y por tanto no vamos a resolver)

- **La doctora no necesita nada nuevo.** Su flujo (modal → guardar → imprimir) ya es de dos clics. Cualquier paso extra que le pidamos ("marcar para farmacia") va a morir por desuso. El diseño de V1 debe ser **cero cambios en el gesto del médico**.
- **La receta impresa sigue siendo la fuente legal.** Nada de lo que se propone aquí la sustituye ni la firma.

---

## 2. Qué existe ya (con archivo:línea) y qué no

### 2.1 Recetas — modelo de datos

`prescriptions` **no es cabecera + ítems**. Es una tabla plana: **una fila = un medicamento**.

- Definición: `supabase/migrations/053_clinical_history_extensions.sql:69-104`
  - `organization_id`, `patient_id`, `doctor_id`, `appointment_id` (nullable), `clinical_note_id` (nullable)
  - `medication text NOT NULL` — **texto libre**
  - `dosage` (concentración: "500 mg"), `frequency`, `duration`, `route`, `instructions`
  - `quantity text` (`:82`) — **texto libre**: "1 caja", "20 tabletas", ""
  - `is_active boolean NOT NULL DEFAULT true` (`:83`) — es "suspendida/vigente", lo usa el panel con los botones Ban/RotateCcw (`app/(dashboard)/patients/prescriptions-panel.tsx:12-14`). **No se puede reutilizar como "entregada"**.
  - `start_date`, `end_date`
- Lote de impresión: `supabase/migrations/247_prescriptions_batch_and_form.sql:21-27`
  - `batch_id uuid` (`:22`) — agrupa las filas creadas en un mismo gesto. Índice parcial en `:26-27`.
  - `pharmaceutical_form text` (`:23`), `dose_per_take text` (`:24`)
  - **`batch_id` es la unidad natural de "una receta"** y ya existe. V1 no necesita inventarla.
- RLS: `053:90-99`. Cuatro policies, todas `organization_id IN (SELECT get_user_org_ids())`.
  **⚠️ Hallazgo colateral:** `prescriptions_update` (`053:96-97`) permite a **cualquier miembro activo de la org** — recepción incluida — hacer UPDATE sobre cualquier receta vía PostgREST directo. La UI no lo expone, pero el agujero existe hoy, antes de esta feature. Ver §5.7.
- Escritura por API: `app/api/prescriptions/route.ts`
  - `POST` acepta array (lote) — `:85-90`
  - Roles que pueden recetar: `CLINICAL_WRITE_ROLES = owner|admin|doctor` (`:33`, verificado en `:147-152`). **Recepción no receta.** Correcto y no se toca.
  - Org resuelta desde el PACIENTE, no desde una membresía arbitraria (`:117-130`) — patrón a respetar.
  - Auditoría ya cableada: `logClinicalBatchAccess` (`:203-212`) y `logClinicalAccess` (`:57-69`) sobre `resource_type='prescription'`.
  - **Este endpoint es el punto natural de emisión del aviso**: es server-side y ya tiene org, paciente, doctor y lote resueltos.

### 2.2 Catálogo de medicamentos y farmacia

- `medication_catalog`: `supabase/migrations/248_medication_catalog.sql:25-47`
  - **`inventory_product_id uuid REFERENCES inventory_products(id) ON DELETE SET NULL` (`:36`)** ← *este es el único puente clínico↔almacén que existe hoy en toda la base*
  - Único por producto: `medication_catalog_product_uniq` (`:51-53`)
  - RLS: lectura cualquier miembro (`:60-62`), escritura owner/admin **o doctor** (`:66-77`)
- Búsqueda en el modal: `components/clinical/use-medication-catalog.ts:48-127` — primero catálogo, y **solo si el catálogo no devuelve nada**, respaldo por `prescriptions.medication` histórico (`:88-113`).
- Alta silenciosa al catálogo: `use-medication-catalog.ts:saveDraftsToCatalog` (`:140-172`) — lo que la doctora escribe a mano entra al catálogo **con `inventory_product_id = NULL`**.
- Importación desde Farmacia: `app/(dashboard)/admin/medication-catalog/page.tsx:254-336` — trae `inventory_products` con `is_sellable=true` y crea filas de catálogo **con** `inventory_product_id` (`:312`).
- El modal ya PINTA el vínculo: chip "Farmacia" cuando la sugerencia tiene `inventory_product_id` (`prescription-composer-modal.tsx:537-543`).
- Almacén: `supabase/migrations/209_inventory_foundation.sql`. Invariante: **no existe columna `stock`**; stock = `SUM(inventory_movements.quantity)` (`app/(dashboard)/almacen/types.ts:computeStock`). Lotes y FEFO: `computeStockByLot`, `nearestLotByProduct` (mismo archivo).
- Farmacia POS: `supabase/migrations/216_pharmacy_module.sql` (`pharmacy_sales:41`, `pharmacy_sale_items:185`), RPCs en `217_pharmacy_rpcs.sql`.
  - `pharmacy_confirm_sale` (`217:84`) es el **único** camino que descuenta stock y cobra (`217:12-16`).
  - Roles que pueden cobrar: `owner|admin|receptionist|assistant|member` (`217:162-165`) — el médico no.
  - Gate de addon: `almacen` (`217:167-176`).
  - **Stock insuficiente NO bloquea**: devuelve `warnings` (`217:245-268`). Regla de producto ya tomada, la heredamos.
  - `pharmacy_sales.patient_id` es nullable a propósito (`216:53-56`) — la venta a público general es de primera clase.
- Puente ya existente Almacén → POS: `?add=<productId>` en `app/(dashboard)/farmacia/page.tsx:478-497`. **Es el patrón exacto a copiar para V2.**

### 2.3 Notificaciones en vivo por rol

- Catálogo de eventos en TS (a propósito, para no migrar por cada evento): `lib/live-notifications/catalog.ts:82-260`
- Audiencias: `["owner_admin","doctor","advisor","reception"]` (`:54`), disjuntas por diseño (`:44-52`)
- Config por org, sparse, en `organizations.settings.live_notifications` (`:10-16`); `resolveAudiences` (`:284-292`), `readLiveNotificationSettings` (`:295-302`)
- Emisión server-only: `lib/live-notifications/notify.ts:76-108` → RPC `notify_org_members`
- Fan-out: `supabase/migrations/220_notifications_foundation.sql:200-227`. La rama `reception` cubre `role IN ('receptionist','assistant','member') AND NOT is_fertility_advisor` (`:220-223`)
- Puente cliente → server: `POST /api/live-notifications/emit`, que **no acepta texto libre** (`app/api/live-notifications/emit/route.ts:15-26`) — el texto se reconstruye leyendo la fila real. Unión discriminada de eventos permitidos en `:28-34`.
- Campanita: `components/layout/topbar.tsx:263-280`, navegación por `action_url` (`:205`)
- **Ya es realtime**: `hooks/use-notifications.ts:115-139` suscribe `postgres_changes` filtrado por usuario. No hay que construir ningún canal.
- UI de configuración: `app/(dashboard)/settings/live-notifications-section.tsx` (Ajustes → **Notificaciones**), que hace merge sobre `organizations.settings` sin pisar el resto (`:83-95`)

### 2.4 Toggles por org — los tres patrones vivos

| Patrón | Dónde vive | Requiere migración | Ejemplo |
|---|---|---|---|
| **Addon** | `addons` / `organization_addons` | Sí (alta del addon) | `almacen`, `caja`, `captacion` — `components/layout/sidebar.tsx:152,161,171` |
| **Columna en `scheduler_settings`** | tabla propia | Sí (1 columna) | `live_status_reception_can_end` (mig `227:26`), `break_time` (mig `254:74-76`) |
| **Clave en `organizations.settings` (JSONB)** | JSONB existente | **No** | `restrict_doctor_patients` (`app/(dashboard)/settings/permissions-settings-tab.tsx:10-12,29-56`), `live_notifications` (mig 192/220) |

Hook de addons: `hooks/use-org-addons.ts:114-117` (`hasAddon`). Roles: `hooks/use-org-role.ts:30-47`.

### 2.5 Dashboard de recepción

- `app/(dashboard)/dashboard/receptionist-dashboard.tsx` — cuatro widgets (hoy de un vistazo, agenda de hoy, mis cobros, seguimientos)
- RPC `get_receptionist_dashboard` (mig `236`, ampliado en `238`), con gating de rol DENTRO de la función (`238:38-46`)
- Disparado en el Server Component con el **hoy civil de la org**: `app/(dashboard)/dashboard/page.tsx:97-105` usa `todayInTz(orgTimezone)`
- Precedente exacto de cómo ampliar: la mig 238 añadió `today_appointments`, y el cliente lo declara **opcional** para que un prod con la 236 no crashee (`receptionist-dashboard.tsx:72-78`). **Ese es el patrón.**

### 2.6 Roles y la línea clínica

- `useOrgRole` (`hooks/use-org-role.ts`): `owner|admin|receptionist|doctor`
- Recepción **no ve la pestaña Clínico** del paciente: `canSeeClinical = isAdmin || !!currentDoctorId` (`app/(dashboard)/patients/patient-drawer.tsx:726-733`)
- Recepción **no ve la historia clínica** desde la cita (decisión 8-sep): `app/(dashboard)/scheduler/appointment-sidebar.tsx:2553-2556`
- Auditoría de accesos clínicos ya existe y contempla `prescription`: `lib/audit/clinical-access.ts` + CHECK en `supabase/migrations/254_schedule_blocks_audit_and_break_time.sql:56-71`

### 2.7 Lo que NO existe

1. **`prescriptions` no guarda a qué fila del catálogo apunta.** El modal lo sabe (`prescription-composer-modal.tsx:214` `catalogId`, guardado en el draft en `:345`) y **lo tira a la basura antes del POST**, con comentario explícito: *"`catalogId` y `saveToCatalog` son solo de UI: `prescriptions` no tiene esas columnas y el POST las rechazaría"* (`:377-380`). Es decir: **la doctora elige un medicamento con chip "Farmacia" y el sistema olvida cuál era.** Este es el hueco central de todo el documento.
2. **No hay estado "entregada/pendiente"** en la receta ni en el lote. `is_active` es otra cosa (suspender un medicamento).
3. **No hay evento de receta** en el catálogo de notificaciones (`catalog.ts:82-260` — hay citas, pagos, pacientes, caja y módulos; nada clínico).
4. **`quantity` es texto libre.** No hay cantidad numérica que pueda convertirse en línea de carrito.
5. **No hay pantalla donde recepción vea recetas.** Su acceso a `/patients` existe (`sidebar.tsx:173`) pero sin pestaña Clínico.
6. **No hay reconciliación catálogo ↔ inventario.** `inventory_product_id` solo se llena por importación manual; todo lo que la doctora tipea a mano entra sin vínculo y nadie lo revisa nunca.

---

## 3. V1 — La orden llega a recepción

**Objetivo:** que cuando la paciente cruce del consultorio al mostrador, recepción ya lo sepa. Nada más.

### 3.1 Principios de alcance

- **Cero cambios en el gesto del médico.** Ni un checkbox nuevo en el modal de receta.
- **Cero mecanismos nuevos.** Notificaciones en vivo + una tarjeta en el dashboard que ya existe.
- **Apagado por defecto en todas las orgs.**
- **Vive un día.** No es una bandeja histórica; es la cola de hoy.

### 3.2 Modelo de datos — ¿hace falta migración?

Sí, **una**, pequeña y aditiva. `supabase/migrations/2XX_prescription_handoff.sql`:

```sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS medication_catalog_id uuid
    REFERENCES medication_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_over_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_handoff_pending
  ON prescriptions (organization_id, start_date)
  WHERE batch_id IS NOT NULL AND handed_over_at IS NULL;
```

Tres decisiones dentro de esas tres columnas:

**(a) `medication_catalog_id` se añade EN V1, aunque V1 no lo lea.**
Es una columna nullable y tres líneas de TypeScript (dejar de borrar `catalogId` en `prescription-composer-modal.tsx:377-393` y añadirlo al schema Zod de `app/api/prescriptions/route.ts:7-25`). Si se pospone a V2, V2 arranca con **cero historia**: el día del lanzamiento ninguna receta anterior sabrá a qué producto apunta y la demo será un cascarón. Añadirlo hoy significa que dentro de dos meses el 100% de las recetas nuevas ya trae el vínculo. **Es la recomendación más barata y de mayor apalancamiento de todo el documento.**

**(b) El estado "entregada" va por columna, no por tabla nueva.**
El lote (`batch_id`) no tiene tabla propia y no merece una: crear `prescription_batches` obliga a migrar los lotes existentes y a mantener dos verdades. Con `handed_over_at` en la fila, el estado del lote es derivable:

> lote **pendiente** = existe alguna fila con ese `batch_id`, `is_active = true` y `handed_over_at IS NULL`.

Marcar el lote como entregado es un solo `UPDATE ... WHERE batch_id = $1`.

**(c) `handed_over_*` NO se escribe desde el navegador.**
Va por `PATCH /api/prescriptions/batch/[batchId]/handover`, que solo toca esas dos columnas y verifica rol. Motivo: la RLS de UPDATE de `prescriptions` (`053:96-97`) es org-wide y sin `WITH CHECK` — un PATCH directo por PostgREST podría cambiar `medication`. Ver §5.7.

**Lo que NO se toca:** `is_active`, `quantity`, ni ninguna fórmula. Esto no es dinero: **V1 no crea, ni lee, ni modifica un solo `patient_payment`.** No entra en "pagado/pendiente" clínico, no entra en Caja, no entra en Ingresos.

### 3.3 Evento de notificación

Un evento nuevo en `lib/live-notifications/catalog.ts` (recordar: el catálogo vive en TS justamente para no migrar por esto — `catalog.ts:4-8`):

```ts
{
  key: "prescription_issued",
  type: "prescription",
  label: { es: "Receta emitida", en: "Prescription issued" },
  description: {
    es: "El médico recetó medicamentos a una paciente. Recepción lo ve al salir de consulta. Apagado por defecto: solo tiene sentido en clínicas que entregan o venden medicamentos.",
    en: "A doctor prescribed medication. Reception sees it as the patient leaves. Off by default.",
  },
  // El doctor que la firmó no necesita que le anuncien lo que acaba de hacer,
  // y otro doctor no tiene por qué enterarse: la audiencia "doctor" ni siquiera
  // es elegible. La asesora tampoco: no es una tarea suya.
  eligibleAudiences: ["owner_admin", "reception"],
  // Vacío = apagado. Se enciende en Ajustes → Notificaciones. Ver §3.5.
  defaultAudiences: [],
  doctorScope: "all",
}
```

**Emisión:** server-side, dentro de `POST /api/prescriptions` (`route.ts:196-232`), después del insert y del log de auditoría, con `notifyOrgMembers` (`lib/live-notifications/notify.ts:76`) y `excludeUserId: user.id`. Fire-and-forget: una notificación que falla **jamás** puede tumbar el guardado de la receta (contrato explícito en `notify.ts:20-24`).

**No se usa `/api/live-notifications/emit`.** Ese puente existe para call-sites de cliente (`emit/route.ts:10-13`); aquí ya estamos en el servidor con todo resuelto. Un round-trip extra solo añadiría una forma de fallar.

**Texto del aviso** (ver §3.6 para la justificación):

- title: `Receta para Karla Ríos`
- body: `3 medicamentos · Dra. Meza`
- action_url: `/dashboard?receta=<batch_id>`

**Sin nombres de medicamentos en la campanita.** La notificación es un empujón, no el documento.

### 3.4 Dónde lo ve recepción

Dos superficies, ambas existentes:

**(1) La campanita** (`components/layout/topbar.tsx:263-280`). Ya es realtime (`hooks/use-notifications.ts:115-139`). Cero trabajo más allá de un icono/color para `type: "prescription"`.

**(2) El gadget "Recetas por entregar"** en el dashboard de recepción — una quinta tarjeta en la grilla de `receptionist-dashboard.tsx`, con el mismo lenguaje visual que las otras (icono en cuadrado de color, número grande, lista de 3 previews). Muestra: nombre de paciente, hora de la cita, nº de medicamentos, y un chip "En farmacia: 2 de 3" cuando la org tiene el addon `almacen` (V2).

Se alimenta ampliando `get_receptionist_dashboard` a **v3** (segunda migración) con un bloque nuevo:

```
'pending_prescriptions', [ { batch_id, patient_id, patient_name, doctor_name,
                             appointment_time, items_count, issued_at } ]
```

filtrado por `organization_id = p_org_id`, `start_date = p_today`, `is_active`, `handed_over_at IS NULL`, `batch_id IS NOT NULL`, agrupado por `batch_id`, orden por `issued_at DESC`, `LIMIT 20`.

Por qué el RPC y no un fetch de cliente:

- El RPC **ya tiene** el gating de rol dentro (`238:38-46`) y ya recibe el **hoy civil de la org** (`dashboard/page.tsx:97-105`, `todayInTz(orgTimezone)`) — CLAUDE.md prohíbe `new Date()` para fechas de negocio, y aquí eso importa: una receta de las 19:30 en Lima no puede aparecer como "de mañana".
- El precedente de la mig 238 es literalmente esto (añadir un bloque al mismo RPC) y el cliente ya sabe declarar el campo opcional para tolerar un prod desactualizado (`receptionist-dashboard.tsx:72-78`).
- Ahorra un round-trip en el first paint del rol que más veces al día abre el dashboard.

**El modal.** Un clic en la tarjeta (o en la notificación, vía `?receta=<batch_id>`) abre un modal ligero: lista de medicamentos, botón **"Marcar como entregada"** y, si hay addon `almacen`, botón **"Cargar en Farmacia"** (V2). Vive en `app/(dashboard)/dashboard/` (no en `components/clinical/`: no es una superficie clínica y no debe heredar esos permisos). Lee por `GET /api/prescriptions?batch_id=<id>` — hay que **añadir el filtro por `batch_id`** al GET existente (`route.ts:43-52` hoy solo filtra por `patient_id`/`appointment_id`), lo cual además hace que el acceso quede registrado por el `logClinicalAccess` que ya está ahí (`:57-69`).

### 3.5 El toggle por org: nombre exacto y dónde vive

**Recomendación: el toggle ES la celda de la matriz de notificaciones. No se crea un flag nuevo.**

- **Ubicación del dato:** `organizations.settings.live_notifications.prescription_issued.audiences`
- **Apagado por defecto:** `defaultAudiences: []` en el catálogo (`catalog.ts`). Ausencia de clave = defaults = vacío = nadie recibe nada. Una clínica que no vende medicamentos **no nota que esto existe**.
- **Encendido:** Ajustes → Notificaciones → fila "Receta emitida" → columna "Recepción". La UI ya está escrita (`app/(dashboard)/settings/live-notifications-section.tsx`) y ya hace merge sin pisar el resto del JSONB (`:83-95`).
- **Lectura en cliente para mostrar/ocultar el gadget:** `resolveAudiences(event, settings).includes("reception")` — helper existente (`catalog.ts:284-292`).
- **Migraciones que cuesta el toggle: cero.**

**Por qué no un flag propio** (p. ej. `settings.prescription_handoff.enabled`, estilo `restrict_doctor_patients`): porque habría que **AND-earlo** con la matriz, y eso produce el bug clásico e insufrible de *"lo activé y no pasa nada"* — el dueño enciende el flag, la matriz sigue en `[]`, y nadie recibe nada. Dos interruptores para una función es una promesa de ticket de soporte.

**Por qué no depende del addon `almacen`:** el founder lo dice explícitamente ("no todas las orgs ofrecerán medicamentos"), pero el corte no es ese. El valor de V1 —*que recepción sepa que la paciente sale con receta*— existe **sin** farmacia: sirve para verificar que el papel salió impreso, para recordarle a la paciente que lo lleve, y para indicarle dónde comprarlo. Atar V1 al addon dejaría fuera exactamente a las clínicas pequeñas donde recepción es la única persona en el mostrador. **V2 sí exige `almacen`**, porque sin kardex no hay nada que precargar.

**Concesión de descubribilidad** (opcional, barata): un interruptor espejo en Ajustes → **Permisos** (`permissions-settings-tab.tsx`) rotulado *"Avisar a recepción de las recetas"* que escribe **la misma clave** `live_notifications.prescription_issued.audiences` (`["reception"]` / `[]`). Dos puertas, un solo dato. Si esto se hace, el interruptor debe leer el mismo sitio, no una copia.

### 3.6 Permisos: qué ve recepción, qué no, y por qué es defendible

Este es el punto que hay que decidir con la cabeza fría, no despacharlo.

**El hecho incómodo:** el nombre del medicamento **es** dato clínico, y con frecuencia es el dato clínico más revelador que existe. *Levotiroxina* dice hipotiroidismo. *Metformina* dice diabetes o SOP. Un antirretroviral dice VIH. En una clínica de fertilidad como Vitra, el esquema de estimulación dice el tratamiento y su fase. La decisión del 8-sep de cerrarle la historia clínica a recepción (`appointment-sidebar.tsx:2553-2556`) fue por esto, y **esta feature la roza de frente**. No es honesto decir "solo son los medicamentos, no es la historia".

**La contrapartida:** la paciente sale del consultorio **con esa misma información impresa en la mano** y se la va a entregar a recepción para comprarla. La receta es, por diseño, un documento que el paciente porta y muestra en el mostrador. Lo que proponemos no crea una divulgación nueva; **adelanta en 40 segundos una divulgación que la paciente misma va a hacer**, y la hace auditable. Ese es el argumento que sostiene la feature, y solo sostiene un alcance muy concreto.

**Diseño propuesto — recepción VE:**

| Campo | ¿Lo ve? | Por qué |
|---|---|---|
| Nombre del paciente | Sí | Ya lo ve en la agenda |
| Médico firmante | Sí | Ya lo ve en la agenda |
| Nº de medicamentos | Sí | Es el contador de la tarjeta |
| `medication` (nombre) | **Sí, tras clic** | Sin esto no hay venta ni V2 posible |
| `dosage` (concentración) | **Sí, tras clic** | "Losartán" sin "50 mg" es un error de dispensación |
| `pharmaceutical_form` | **Sí, tras clic** | Determina qué caja se entrega |
| `quantity` (total) | **Sí, tras clic** | Es cuántas cajas |
| Disponibilidad en farmacia | Sí (si addon) | Dato de inventario, no clínico |

**Recepción NO VE:**

| Campo | Por qué |
|---|---|
| `instructions` | Posología dirigida al paciente. Recepción no administra ni instruye; leerla es todo riesgo y ningún valor operativo |
| `frequency`, `duration`, `route` | Mismo motivo. Además, el esquema posológico es el que convierte un nombre en un **diagnóstico inferible** ("cada 6 h por 3 días" vs. "una vez al día, tratamiento continuo") |
| Diagnóstico, nota clínica, adjuntos | Fuera de alcance, y ya cerrados desde el 8-sep |
| **Recetas de otros días** | Ver abajo — es la contención principal |

**Las cuatro contenciones que hacen esto defendible:**

1. **Apagado por defecto, encendido por la dueña de la clínica** (§3.5). La divulgación la autoriza quien responde legalmente por ella, no nosotros.
2. **Solo HOY.** El gadget y el modal se limitan al `p_today` civil de la org. **No hay búsqueda, no hay histórico, no hay "recetas de Karla".** Una recepcionista no puede navegar la farmacopea histórica de una paciente; solo puede ver lo que hoy tiene que entregar. Esto es lo que separa "una cola operativa" de "una historia clínica por la puerta de atrás", y **es innegociable en el diseño**.
3. **Todo acceso queda escrito.** El `GET /api/prescriptions` ya llama a `logClinicalAccess` con `resource_type='prescription'` (`route.ts:57-69`), y `clinical_access_log` ya acepta ese tipo (mig `254:56-71`). Añadir `batch_id` al metadata es una línea. Si mañana hay una queja, hay registro de quién abrió qué y cuándo.
4. **Nada de esto se imprime ni se exporta desde recepción.** El PDF de la receta sigue siendo del médico (`/api/pdf/prescription/batch/[batchId]`). Recepción marca entregado; no reimprime documentos clínicos firmados.

**Alternativa "modo ciego"** (recepción ve *"Karla Ríos sale con receta · 3 medicamentos"* y **ningún nombre**): captura buena parte del valor operativo de V1 — recepción no la deja irse sin ofrecerle la farmacia — con **cero divulgación clínica nueva**. La paciente enseña el papel y recepción teclea, como hoy.
**Recomendación: no construirlo en V1.** Añade un tercer estado de configuración para ahorrar un riesgo que ya está cubierto por (1) y (2), y deja a V2 sin nada sobre lo que construirse. Si una clínica concreta lo pide, la respuesta correcta es **apagar el evento entero** para esa org: ya se puede, hoy, sin código.

### 3.7 Qué pasa en orgs sin farmacia

- El evento y el gadget funcionan igual (no dependen del addon).
- El modal no muestra columna de disponibilidad ni el botón "Cargar en Farmacia".
- El único botón es "Marcar como entregada", que aquí significa *"le di el papel / confirmé que lo lleva"*.
- Si además el evento está apagado (el caso por defecto), **la org no ve absolutamente nada**: sin tarjeta, sin campanita, sin cambio de comportamiento.

### 3.8 Resumen de archivos que toca V1

| Archivo | Cambio |
|---|---|
| `supabase/migrations/2XX_prescription_handoff.sql` | **nuevo** — 3 columnas + índice parcial |
| `supabase/migrations/2XX_receptionist_dashboard_v3.sql` | **nuevo** — `pending_prescriptions` en el RPC |
| `supabase/migrations/rollbacks/…` (×2) | **nuevos** — convención del repo |
| `lib/live-notifications/catalog.ts` | +1 evento |
| `app/api/prescriptions/route.ts` | `medication_catalog_id` en el schema; filtro `batch_id` en GET; emisión del aviso |
| `app/api/prescriptions/batch/[batchId]/handover/route.ts` | **nuevo** — PATCH acotado a `handed_over_*` |
| `components/clinical/prescription-composer-modal.tsx` | dejar de descartar `catalogId` (~3 líneas) ⚠️ *otro agente está en este árbol* |
| `app/(dashboard)/dashboard/receptionist-dashboard.tsx` | +1 tarjeta, +1 tipo opcional |
| `app/(dashboard)/dashboard/prescription-handoff-modal.tsx` | **nuevo** |
| `components/layout/topbar.tsx` | icono/color para `type: "prescription"` |

---

## 4. V2 — El puente con Farmacia y Almacén

### 4.1 El hueco, sin adornos

**Hoy no hay forma fiable de casar un medicamento recetado con un producto de almacén.** Concretamente:

1. **La receta guarda texto libre.** `prescriptions.medication text NOT NULL` (`053:76`). Sin FK, sin código, sin nada.
2. **El vínculo se calcula y se tira.** La doctora busca "Losart", el modal le ofrece la fila del catálogo **con chip "Farmacia"** porque tiene `inventory_product_id` (`prescription-composer-modal.tsx:537-543`), ella la elige, el modal guarda `catalogId` en el draft (`:345`)… y el POST lo borra a propósito (`:377-380`). **El sistema tuvo el vínculo en la mano y lo soltó.**
3. **El catálogo se ensucia solo.** Todo lo que la doctora teclea a mano se auto-inserta en `medication_catalog` con `inventory_product_id = NULL` (`use-medication-catalog.ts:140-172`). Nadie revisa esas filas jamás. En seis meses el catálogo de una clínica activa serán mayoritariamente entradas huérfanas.
4. **La cantidad no es un número.** `quantity text` (`053:82`). "1 caja" no es una línea de carrito.

Consecuencia: **si V2 se implementara hoy sobre los datos actuales, no podría precargar prácticamente nada.**

### 4.2 El camino: dos saltos, no una FK nueva

```
prescriptions.medication_catalog_id  →  medication_catalog.inventory_product_id  →  inventory_products.id
        (columna nueva, §3.2)                   (mig 248:36 — YA EXISTE)
```

**No se añade `prescriptions.inventory_product_id`.** Motivos:

- Duplicaría la verdad. El catálogo es el vocabulario clínico de la clínica y ya carga el vínculo; dos rutas al mismo producto divergen el día que alguien re-enlaza una y no la otra.
- El vínculo del catálogo tiene mantenimiento previsto (`ON DELETE SET NULL`, índice único por producto, mig `248:36,51-53`). Una FK directa desde la receta obligaría a duplicar esas reglas.
- La receta debe sobrevivir a que el producto desaparezca del almacén: es un documento clínico, no una línea de pedido. Con dos saltos, si el producto se borra, la receta sigue intacta y solo pierde disponibilidad.

**Fiabilidad esperada:** las recetas emitidas a partir de V1, compuestas eligiendo del catálogo, tendrán vínculo **exacto y sin ambigüedad**. Las de texto libre y todo el histórico, ninguno. Por eso hace falta lo siguiente.

### 4.3 Reconciliación: mapeo manual una vez, nunca automático

Pantalla nueva en Ajustes → **Catálogo de medicamentos** (`app/(dashboard)/admin/medication-catalog/page.tsx`, que ya tiene el modal de importación — `:254-336`): pestaña **"Sin enlazar"**.

- Lista `medication_catalog` con `inventory_product_id IS NULL`, ordenado por **frecuencia de uso real** (`COUNT(*)` sobre `prescriptions` de los últimos 90 días) — para que la clínica enlace primero los 20 que usa a diario y no los 400 que tecleó una vez.
- Para cada uno, propone candidatos de `inventory_products` (`is_sellable = true`, `is_discontinued = false`) por **nombre normalizado**: `normalizeSearchText` (`lib/utils.ts:87-92`) o `normalize` (`medication-catalog/page.tsx:56-62`), reforzado con `pg_trgm` (ya instalado — `supabase/migrations/103_perf_indexes_2026_04_22.sql:21`) para similitud.
- **Un humano confirma cada uno. Siempre. Sin excepción y sin "enlazar todos los que coincidan al 100%".**

**Por qué la confirmación humana no es negociable:** "Losartán 50 mg" y "Losartán 100 mg" tienen 0.94 de similitud trigrámica y son **el doble de la dosis**. "Enalapril" y "Enalaprilato" son fármacos distintos por vía distinta. Un matcheo automático que acierte el 97% de las veces produce, en una clínica de 40 recetas al día, **más de un error de dispensación por día**. Eso no es un bug de UX; es un evento adverso con nombre y apellido. La normalización sirve para **ordenar sugerencias**, jamás para decidir.

Coste para la clínica: una sesión de 20–40 minutos en el onboarding del módulo. Después, el catálogo **es** el mapeo y no vuelve a tocarse salvo altas nuevas.

**Mejora complementaria (barata, alto retorno):** en el modal de receta, cuando la doctora escribe algo que no está en el catálogo y marca "guardar en catálogo" (`prescription-composer-modal.tsx:326`), ofrecerle en ese mismo momento *"¿es este producto de tu farmacia?"* con las 3 mejores sugerencias. Enlazar en el instante en que alguien que sabe de medicamentos está mirando la pantalla es infinitamente mejor que enlazar después en una pantalla de administración.

### 4.4 La precarga del carrito

**No se construye un flujo nuevo de farmacia.** Se extiende el puente que ya existe.

Hoy: Almacén manda a `/farmacia?add=<productId>` y el POS lo consume una vez y limpia la URL (`app/(dashboard)/farmacia/page.tsx:478-497`).

V2: el modal de recepción manda a `/farmacia?rx=<batch_id>`. El POS, con el mismo patrón (`useRef` de un solo uso + `history.replaceState`):

1. Resuelve el lote → `medication_catalog_id` → `inventory_product_id` de cada fila.
2. Crea **un** borrador (`ensureDraft`, `farmacia/page.tsx:329-341`) con `patient_id` preseleccionado desde la receta — la venta a paciente identificado ya es de primera clase (`216:53-56`).
3. Inserta las líneas resueltas en `pharmacy_sale_items`, con `unit_price` = `inventory_products.sale_price` y lote FEFO.
4. Muestra un aviso claro con lo que **no** pudo cargar: *"2 de 3 cargados. Metformina 850 mg no está en tu farmacia."*

**El invariante del POS se respeta íntegro:** la pantalla solo edita su borrador; descontar stock y cobrar sigue siendo exclusivo de `pharmacy_confirm_sale` (`217:12-16`). La precarga **no cobra, no descuenta, no toca caja**. Si recepción abandona el carrito, `clearCart` (`farmacia/page.tsx:456-464`) borra el borrador por CASCADE y no queda rastro.

### 4.5 Stock insuficiente, lotes FEFO y precios

Ninguno de los tres necesita reglas nuevas. Las tres decisiones ya están tomadas en el repo y se heredan tal cual:

**Stock insuficiente — no bloquea.** `pharmacy_confirm_sale` devuelve `warnings` en vez de fallar (`217:245-268`), con el razonamiento explícito de que el producto ya está físicamente en la mano de quien vende (`217:248-251`). La precarga hace lo mismo un paso antes: carga la línea, la marca en ámbar. Recepción decide si vende, vende parcial o dice "no tenemos". **Es la persona con el producto delante quien decide, no el software.**

**FEFO.** `nearestLotByProduct` (`app/(dashboard)/almacen/types.ts`) ya selecciona el lote más próximo a vencer, y es exactamente lo que el POS hace hoy al añadir un producto. La precarga llama a la misma función. **No se escribe una segunda lógica de lotes**: si mañana la clínica cambia de criterio, se cambia en un sitio. Si el producto tiene `track_lots` y el lote más cercano no cubre la cantidad, es una advertencia (`217:261-270`), no un bloqueo.

**Precios e IGV — regla de oro de CLAUDE.md, intacta.** El precio sale **siempre** de `inventory_products.sale_price`, que se digita **con IGV** porque es el precio de mostrador (`almacen/types.ts`, sección IGV). **Jamás de la receta**: la receta no tiene precio y no debe tenerlo nunca. El desglose lo calcula `computeLineTax` según `igv_affectation` (1 gravado / 8 exonerado / 9 inafecto), y lo recalcula el servidor en `pharmacy_confirm_sale` — la vista previa del carrito es previa, no verdad (`farmacia/types.ts`, `cartTotals`).

**Separación de plata clínica y de farmacia — intacta.** La venta resultante es `source='pos'`. **No cancela deuda de citas, no aparece en "pagado/pendiente" clínico, no entra en `get_patient_summary`** (migs 213/219/233). Que la venta nazca de una receta **no la convierte en plata clínica**: es una venta de mostrador que casualmente sabemos a qué receta corresponde. Este punto hay que blindarlo en la revisión de código de V2, porque es exactamente el tipo de vínculo que invita a alguien a "sumarlo al total del paciente".

### 4.6 Qué necesita V2 en migraciones

```sql
-- 2XX_prescription_quantity_units.sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS quantity_units numeric(12,3);
```

Convive con `quantity text`, que **no se toca ni se reinterpreta** (regla "un número, una fórmula": el texto libre es lo que se imprime en la receta y sigue siéndolo). En el modal, junto al campo "Cantidad total", un input numérico opcional; si viene vacío, la línea se precarga con cantidad 1 y recepción la ajusta.

Opcionalmente una segunda migración con un índice para la pantalla de reconciliación (`medication_catalog (organization_id) WHERE inventory_product_id IS NULL` + trigram sobre `inventory_products.name`), decidible al medir.

---

## 5. Riesgos y decisiones abiertas — preguntas para el founder

Cada una con recomendación. Ninguna necesita respuesta antes de leer la spec entera, todas antes de escribir código.

**5.1 — ¿Recepción ve los nombres de los medicamentos, o solo "sale con receta"?**
Es *la* decisión. Ver §3.6.
→ **Recomendación: sí ve los nombres, tras un clic, solo del día de hoy, sin histórico, sin búsqueda, sin posología, y con el evento apagado por defecto.** Sin nombres, V2 no tiene sobre qué construirse y V1 se queda en un recordatorio. Con nombres y sin las cuatro contenciones de §3.6, es una historia clínica por la puerta de atrás. Las contenciones son la feature tanto como el gadget.

**5.2 — ¿El toggle es la celda de la matriz de notificaciones, o un interruptor propio?**
→ **Recomendación: la celda de la matriz** (`live_notifications.prescription_issued.audiences`). Cero migraciones, UI ya construida, un solo dato. Si preocupa que quede escondido en Ajustes → Notificaciones, poner un interruptor espejo en Ajustes → Permisos que escriba **la misma clave** — nunca una copia. Dos flags AND-eados garantizan un ticket de *"lo activé y no funciona"*.

**5.3 — ¿V1 depende del addon `almacen`?**
→ **Recomendación: no.** V1 vale sin farmacia (verificar que el papel salió, recordarle a la paciente que lo lleve). V2 sí lo exige. Atar V1 al addon dejaría fuera justo a las clínicas de una sola recepcionista, que es donde más duele.

**5.4 — ¿"Marcar como entregada" es un botón que alguien va a pulsar de verdad?**
Todo estado que dependa de un clic manual acaba mintiendo. Si nadie lo pulsa, la tarjeta acumula recetas viejas y en dos semanas es ruido que la gente ignora.
→ **Recomendación: el clic existe, pero no es lo que limpia la cola. La cola se limpia sola al cambiar el día civil de la org** (el RPC filtra por `p_today`). `handed_over_at` sirve para quitar la tarjeta *durante* el día y para medir adopción, no para gobernar la vista. En V2 se marca **automáticamente** cuando se confirma una venta que nació de ese lote. Así el botón manual pasa a ser el caso raro y no el sostén del diseño.

**5.5 — ¿Y si la clínica ya usa otra historia clínica (caso Vitra, que usa Omnia)?**
Si la doctora no receta en Yenda, no hay evento y la feature es invisible. No es un problema del diseño, pero **sí condiciona a quién se le vende**.
→ **Recomendación: validar V1 con una clínica que sí recete en Yenda antes de construir V2.** Si la mayoría del pipeline receta fuera, V2 (4–6 jornadas) tiene un mercado mucho más pequeño de lo que parece.

**5.6 — ¿`medication_catalog_id` se añade ya, o se pospone a V2?**
→ **Recomendación: ya, en V1.** Una columna nullable y tres líneas de TS. Es la diferencia entre que V2 arranque con dos meses de recetas ya vinculadas o con una base vacía. Es el mejor retorno por línea de código de toda la propuesta.

**5.7 — Hallazgo colateral: la RLS de `prescriptions` deja a cualquier miembro editar cualquier receta.**
`prescriptions_update` (`053:96-97`) es org-wide y sin `WITH CHECK`. Hoy la UI no lo expone, pero PostgREST sí: una recepcionista con la clave pública y su sesión puede cambiar `medication` de una receta firmada. **Esto existe desde la mig 053 y es independiente de esta feature** — pero esta feature le pone a recepción una pantalla que muestra `batch_id`, lo que reduce la distancia entre "posible" y "trivial".
→ **Recomendación: arreglarlo en la misma migración de V1** — restringir UPDATE a `owner|admin|doctor` (mismo criterio que `CLINICAL_WRITE_ROLES`, `api/prescriptions/route.ts:33`) y dejar el `handover` por endpoint SECURITY DEFINER o por una policy acotada a las dos columnas. Coste: media jornada. No hacerlo es dejar un agujero conocido junto a una puerta nueva.

**5.8 — ¿Reconciliación automática del catálogo por nombre?**
→ **Recomendación: no, nunca automática.** Sugerir sí, decidir no. Ver §4.3: "Losartán 50" vs "Losartán 100" es el doble de la dosis, no un typo. La normalización ordena la lista; el humano elige.

**5.9 — ¿Qué pasa si la doctora edita o suspende la receta después de avisar?**
→ **Recomendación: no perseguirlo en V1.** La notificación es un empujón puntual; el modal lee `prescriptions` **en vivo** (no una copia congelada), así que al abrirlo recepción ve el estado actual y las filas con `is_active = false` salen filtradas. La campanita puede quedar desfasada 30 segundos; eso es aceptable y el coste de arreglarlo (retractar notificaciones) es desproporcionado.

**5.10 — ¿Y el paciente sin cita (receta desde el drawer)?**
El atajo funciona sin `appointment_id` (`clinical-shortcuts.tsx:26-28`), así que puede haber recetas de pacientes que no están en la agenda de hoy.
→ **Recomendación: incluirlas igual.** El filtro del RPC es por `start_date = p_today` (que el modal estampa con `useOrgToday()` — `prescription-composer-modal.tsx:202-203,372`), no por cita. La tarjeta muestra "—" en la hora. Un caso menos que explicar.

---

## 6. Estimación

Jornadas de una persona con contexto del repo. Incluye pruebas manuales; **no** incluye QA formal ni despliegue.

### V1 — 2.5 a 3.5 jornadas · 2 migraciones (+2 rollbacks)

| Bloque | Jornadas |
|---|---|
| Mig A: 3 columnas + índice + endurecer RLS de UPDATE (§5.7) + rollback | 0.5 |
| Mig B: `get_receptionist_dashboard` v3 con `pending_prescriptions` + rollback | 0.5 |
| Evento en el catálogo TS + emisión en `POST /api/prescriptions` + icono en topbar | 0.4 |
| Dejar de descartar `catalogId`; filtro `batch_id` en el GET; endpoint `handover` | 0.4 |
| Tarjeta "Recetas por entregar" + modal + estados vacíos | 0.8 |
| Interruptor espejo en Ajustes → Permisos (si se aprueba §5.2) | 0.2 |
| Pruebas de RLS/roles (recepción, doctor, asesora, org sin flag, org sin addon) | 0.5 |

### V2 — 4 a 6 jornadas · 1 a 2 migraciones (+rollbacks)

| Bloque | Jornadas |
|---|---|
| Mig: `quantity_units` (+ índices de reconciliación) + rollback | 0.3 |
| Campo cantidad numérica en el modal de receta | 0.3 |
| Pestaña "Sin enlazar" en Catálogo de medicamentos: lista por frecuencia real, sugerencias trigram, confirmación 1 a 1 | 1.5 |
| Sugerencia de enlace en caliente dentro del modal de receta (§4.3) | 0.5 |
| `?rx=<batchId>` en el POS: resolver lote → productos, crear borrador multi-línea, FEFO, paciente preseleccionado | 1.2 |
| Disponibilidad y avisos en el modal de recepción ("2 de 3 en farmacia") | 0.6 |
| Auto-marcado de entregada al confirmar la venta (§5.4) | 0.3 |
| Pruebas: stock 0, stock parcial, producto descatalogado, lote vencido, org sin `almacen`, venta abandonada, **no contaminación de plata clínica** | 1.0 |

**Riesgo de plazo principal en V2:** la reconciliación del catálogo. No es código difícil; es **trabajo del cliente** que hay que conseguir que haga. Si una clínica no dedica esos 30 minutos, V2 le precarga la mitad de las líneas y la percepción será "no funciona". Vale la pena tratar la sesión de enlace como parte del onboarding del módulo, no como una pantalla que existe por si acaso.

---

## 7. Lo que este documento propone NO construir

- Una bandeja histórica de recetas para recepción (§3.6, contención 2).
- Una tabla `prescription_batches` (§3.2b).
- Una FK `prescriptions.inventory_product_id` (§4.2).
- Un mecanismo de avisos propio para recetas (`lib/live-notifications/` ya hace esto y es realtime).
- Un flujo de farmacia paralelo (`?add=` + `pharmacy_confirm_sale` ya existen y son el único camino que descuenta stock).
- Matcheo automático de medicamentos por nombre (§4.3, §5.8).
- Cualquier cambio en el gesto del médico (§3.1).
- Cualquier vínculo entre la receta y el dinero clínico (§4.5).
