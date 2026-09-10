# Spec: Receta → Recepción (y, en V2, → Farmacia)

**Versión:** 1.1 — borrador de diseño para decisión del founder
**Fecha:** 10 de septiembre, 2026
**Estado:** propuesta. Nada implementado.
**Alcance:** V1 (recepción SABE que hay receta) y V2 (puente opcional con Farmacia/Almacén).
**Pedido origen:** founder — *"cuando la doctora ordene una receta, que le aparezca la orden a recepción […] debe ser una opción activable desde el panel […] en una V2 precargar los medicamentos disponibles en farmacia."*
**Matiz que fija el alcance (v1.1):** *"La paciente NO necesariamente compra en la misma clínica. El objetivo de recepción no es vender, es SABER. Recepción ve en la cita de la paciente 'Receta asignada', ve los nombres y cantidades del medicamento."*

---

## 0. Resumen de una página

| | V1 | V2 |
|---|---|---|
| **Qué resuelve** | Recepción **sabe**, en la cita, que la doctora recetó y qué | Recepción **vende** esa receta sin re-digitar (atajo opcional) |
| **Naturaleza** | Informativa. No vende, no cobra, no descuenta stock | Transaccional, pero siempre opcional |
| **Migraciones obligatorias** | **0** | 1 |
| **Migraciones recomendadas** | 2 (una es inversión para V2, otra es higiene de seguridad) | 0–1 |
| **Jornadas** | 1.5 – 2.5 | 4 – 6 |
| **Depende del addon `almacen`** | No | Sí |
| **Encendido por org** | Sí, apagado por defecto | Sí (hereda el de V1 + addon) |
| **Mecanismo nuevo** | Ninguno | Ninguno: reusa `?add=` del POS y `pharmacy_confirm_sale` |

Que V1 salga a **cero migraciones obligatorias** no es casualidad: al dejar de ser transaccional, desaparece la necesidad de un estado "entregada/pendiente" —que era la única cosa que obligaba a tocar el esquema— y el campo `appointment_id` de la receta, que existe desde la mig 053, resulta ser exactamente el enganche que hace falta. Ver §3.2.

Las tres decisiones que hay que tomar antes de escribir código están en §5. La primera y más importante: **dónde lo ve recepción** (§3.4), donde mi recomendación **contradice** una de las dos opciones que el founder plantea.

---

## 1. El caso y por qué duele hoy

### 1.1 Lo que pasa realmente

La doctora abre el atajo "Receta" desde la cita (`components/clinical/clinical-shortcuts.tsx:50-58`) o desde el drawer del paciente (`app/(dashboard)/patients/patient-drawer.tsx:933`), compone 1..N medicamentos en el modal (`components/clinical/prescription-composer-modal.tsx`), guarda y —si pulsa "Guardar e imprimir"— abre el PDF del lote (`prescription-composer-modal.tsx:441-447` → `/api/pdf/prescription/batch/[batchId]`).

A partir de ahí, **el sistema no vuelve a saber nada de esa receta**. La paciente camina al mostrador con un papel, o sin él si la impresora falló o el navegador bloqueó la ventana emergente — caso ya contemplado en el código (`prescription-composer-modal.tsx:448-452`).

En el mostrador, recepción no tiene ninguna señal de que esa cita terminó con una indicación de medicamentos. Ni un icono, ni una línea en el sidebar de la cita, ni nada. La única forma de enterarse es entrar a la historia clínica, que recepción no puede ver por decisión del 8-sep (`app/(dashboard)/scheduler/appointment-sidebar.tsx:2553-2556`).

### 1.2 Por qué eso importa aunque la paciente no compre aquí

Este es el matiz que ordena todo el diseño. **El objetivo de V1 no es vender.** La paciente puede comprar en la botica de la esquina y eso está perfectamente bien. Lo que recepción necesita es **saber**, y saber le sirve para cuatro cosas concretas que hoy no puede hacer:

1. **Verificar que el papel salió.** Si el PDF no se imprimió, hoy no lo detecta nadie hasta que la paciente llama al día siguiente.
2. **Cerrar la cita completa.** "Aquí tiene su receta, son tres medicamentos" es un cierre; "hasta luego" a alguien que se va sin el papel que necesita, no.
3. **Responder al teléfono.** La paciente llama a las 6pm: *"perdí la receta, ¿qué me mandó la doctora?"*. Hoy recepción tiene que interrumpir a la doctora o decir "llame mañana".
4. **Ofrecer la farmacia si la clínica la tiene.** Esto es un efecto secundario agradable, no el objetivo — y es exactamente lo que V2 convierte en atajo.

Ninguna de las cuatro requiere cobrar, descontar stock ni marcar nada. **V1 es una ventana, no un flujo.**

### 1.3 Lo que NO vamos a resolver

- **La doctora no necesita nada nuevo.** Su flujo (modal → guardar → imprimir) ya es de dos clics. Cualquier paso extra que le pidamos va a morir por desuso. **V1 = cero cambios en el gesto del médico.**
- **La receta impresa sigue siendo la fuente legal.** Nada aquí la sustituye ni la firma.
- **V1 no crea una cola de trabajo.** No hay bandeja, no hay "pendientes", no hay nada que alguien tenga que vaciar. Ver §3.3.

---

## 2. Qué existe ya (con archivo:línea) y qué no

### 2.1 Recetas — modelo de datos

`prescriptions` **no es cabecera + ítems**. Es una tabla plana: **una fila = un medicamento**.

- Definición: `supabase/migrations/053_clinical_history_extensions.sql:69-104`
  - `organization_id`, `patient_id`, `doctor_id`
  - **`appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL` (`:74`)** ← *el enganche que hace posible toda la V1*
  - `clinical_note_id` (nullable)
  - `medication text NOT NULL` (`:76`) — **texto libre**
  - `dosage` (concentración: "500 mg"), `frequency`, `duration`, `route`, `instructions`
  - **`quantity text` (`:82`)** — **texto libre y opcional**. Ver §3.5.
  - `is_active boolean NOT NULL DEFAULT true` (`:83`) — es "vigente/suspendida", lo usa el panel con Ban/RotateCcw (`app/(dashboard)/patients/prescriptions-panel.tsx:12-14`)
  - `start_date`, `end_date`
  - Índice por cita ya existente: `idx_prescriptions_appointment` (`:103`)
- Lote de impresión: `supabase/migrations/247_prescriptions_batch_and_form.sql:21-27`
  - `batch_id uuid` (`:22`) — agrupa las filas de un mismo gesto; `pharmaceutical_form` (`:23`), `dose_per_take` (`:24`)
- RLS: `053:90-99`. Las cuatro policies son `organization_id IN (SELECT get_user_org_ids())`.
  **⚠️ Hallazgo colateral:** `prescriptions_update` (`053:96-97`) permite a **cualquier miembro activo** —recepción incluida— hacer UPDATE sobre cualquier receta vía PostgREST directo. La UI no lo expone, pero el agujero existe hoy, antes de esta feature. Ver §5.6.
- API: `app/api/prescriptions/route.ts`
  - Roles que recetan: `CLINICAL_WRITE_ROLES = owner|admin|doctor` (`:33`, aplicado en `:147-152`). **Recepción no receta.** No se toca.
  - **`GET` ya filtra por `appointment_id`** (`:44`, `:52`) — el endpoint que necesita el modal de V1 **ya está escrito**.
  - Auditoría ya cableada: `logClinicalAccess` en el GET (`:57-69`) con `resource_type='prescription'`.
  - Org resuelta desde el PACIENTE, no desde una membresía arbitraria (`:117-130`) — patrón a respetar en cualquier añadido.

### 2.2 Catálogo de medicamentos y farmacia

- `medication_catalog`: `supabase/migrations/248_medication_catalog.sql:25-47`
  - **`inventory_product_id uuid REFERENCES inventory_products(id) ON DELETE SET NULL` (`:36`)** ← *el único puente clínico↔almacén que existe hoy en toda la base*
  - Único por producto: `medication_catalog_product_uniq` (`:51-53`). RLS: lectura cualquier miembro (`:60-62`), escritura owner/admin o doctor (`:66-77`)
- Búsqueda del modal: `components/clinical/use-medication-catalog.ts:48-127` — catálogo primero; solo si no hay coincidencias, respaldo por histórico de `prescriptions.medication` (`:88-113`)
- Alta silenciosa al catálogo: `saveDraftsToCatalog` (`use-medication-catalog.ts:140-172`) — lo tecleado a mano entra **con `inventory_product_id = NULL`**
- Importación desde Farmacia: `app/(dashboard)/admin/medication-catalog/page.tsx:254-336`, crea filas **con** vínculo (`:312`)
- El modal ya PINTA el vínculo: chip "Farmacia" (`prescription-composer-modal.tsx:551-557`)
- Almacén: mig `209`. Invariante: **no existe columna `stock`**; stock = `SUM(inventory_movements.quantity)` (`app/(dashboard)/almacen/types.ts:computeStock`). FEFO: `nearestLotByProduct` (mismo archivo)
- Farmacia POS: mig `216` (`pharmacy_sales:41`, `pharmacy_sale_items:185`), RPCs en `217`
  - `pharmacy_confirm_sale` (`217:84`) es el **único** camino que descuenta stock y cobra (`217:12-16`)
  - Roles que cobran: `owner|admin|receptionist|assistant|member` (`217:162-165`); gate de addon `almacen` (`217:167-176`)
  - **Stock insuficiente NO bloquea**: devuelve `warnings` (`217:245-268`)
  - `pharmacy_sales.patient_id` nullable a propósito (`216:53-56`)
- Puente ya existente Almacén → POS: `?add=<productId>` (`app/(dashboard)/farmacia/page.tsx:478-497`) — **el patrón a copiar en V2**

### 2.3 Notificaciones en vivo por rol

- Catálogo de eventos en TS, a propósito, para no migrar por cada evento: `lib/live-notifications/catalog.ts:4-8`, eventos en `:82-260`
- Audiencias `["owner_admin","doctor","advisor","reception"]` (`:54`), disjuntas por diseño (`:44-52`)
- Config por org, sparse, en `organizations.settings.live_notifications` (`:10-16`); helpers `resolveAudiences` (`:284-292`) y `readLiveNotificationSettings` (`:295-302`)
- Emisión server-only: `lib/live-notifications/notify.ts:76-108` → RPC `notify_org_members`; fan-out en mig `220:200-227`, con la rama `reception` = `role IN ('receptionist','assistant','member') AND NOT is_fertility_advisor` (`:220-223`)
- Puente cliente→server que **no acepta texto libre** (`app/api/live-notifications/emit/route.ts:15-26`)
- Campanita: `components/layout/topbar.tsx:263-280`, navega por `action_url` (`:205`); **ya es realtime** (`hooks/use-notifications.ts:115-139`)
- UI de configuración: `app/(dashboard)/settings/live-notifications-section.tsx`, con merge que no pisa el resto del JSONB (`:83-95`)

### 2.4 Toggles por org — los tres patrones vivos

| Patrón | Dónde vive | ¿Migración? | Ejemplo |
|---|---|---|---|
| **Addon** | `addons` / `organization_addons` | Sí | `almacen`, `caja` — `components/layout/sidebar.tsx:152,161,171` |
| **Columna en `scheduler_settings`** | tabla propia | Sí (1 col) | `live_status_reception_can_end` (mig `227:26`), `break_time` (mig `254:74-76`) |
| **Clave en `organizations.settings` (JSONB)** | JSONB existente | **No** | `restrict_doctor_patients` (`app/(dashboard)/settings/permissions-settings-tab.tsx:10-12,29-56`), `live_notifications` (mig 192/220) |

Hook de addons: `hooks/use-org-addons.ts:114-117`. Roles: `hooks/use-org-role.ts:30-47`.

### 2.5 La agenda: tarjeta de cita, sidebar y cómo llegan los datos

Esto es el corazón de la decisión de §3.4, así que va con detalle.

**La tarjeta** (`app/(dashboard)/scheduler/appointment-card.tsx`, 312 líneas):

- **La tarjeta entera ES un `<button>`** (`:150`), `draggable` (`:151`), con `onClick={onClick}` que abre el sidebar (`:159`), `overflow-hidden` y `flex flex-col justify-center` (`:161`).
- Modo compacto: **`isCompact = heightPx < 52`** (`:110`). Con intervalo de 30 min y la base de 40px/15min, una cita normal cae ahí. En compacto la tipografía baja a `text-[11px] leading-none` (nombre) y `text-[10px]` (segunda línea), y el padding vertical se anula (`:162`).
- **Fila 1** (`:180`, `flex items-center gap-1`) ya reparte, en este orden:
  1. `RecurringDot` — paciente recurrente (`:181-183`)
  2. Nombre de la paciente — `flex-1 truncate` (`:184-193`) ← **el dato #1 de la tarjeta**
  3. `LiveStatusPill` — píldora de estado en vivo (`:199-218`)
  4. `Video` — indicador de cita virtual, `h-3 w-3` (`:222-224`)
  5. Indicador de pago/deuda (`:226-259`) — que en el caso de deuda **no es un icono sino un chip con texto**: `S/145` con su triángulo (`:243-250`)
- **Fila 2** (`:260-276`): `doctor · servicio`, `truncate`.
- Está envuelta en `React.memo` con **comparador manual explícito** (`:283-311`): cualquier prop nueva que no se añada ahí **no repinta la tarjeta**.

**El sidebar de la cita** (`app/(dashboard)/scheduler/appointment-sidebar.tsx`): es donde recepción abre la cita al hacer clic en la tarjeta. Tiene secciones amplias y ya incluye una de **Cobros** que recepción sí ve (`:2260-2285`), justo antes del bloque clínico que **no** ve (`:2553-2556`). Espacio de sobra.

**Cómo llegan los datos a las tarjetas** (`app/(dashboard)/scheduler/page.tsx`): hay un precedente exacto y limpio de "un dato extra por cita sin consulta extra":

- El select de citas **embebe** los pagos por FK anidada: `…, patient_payments(amount)` (`:231`)
- De ese embed se deriva un `Record<string, number>` en cliente: `paymentTotals` (`:254-265`)
- Que se pasa a las vistas como prop (`:718`, `:743`) y de ahí a cada tarjeta (`day-view.tsx:551`)
- El mismo select ya usa **interpolación condicional** de columnas para tolerar migraciones no aplicadas: `${modality ? ", modality" : ""}` (`:231`, explicado en `:221-227`)

Como `prescriptions.appointment_id` es una FK a `appointments` (`053:74`), **PostgREST puede embeber `prescriptions(...)` en ese mismo select**. Cero consultas nuevas.

### 2.6 Roles y la línea clínica

- `useOrgRole` (`hooks/use-org-role.ts`): `owner|admin|receptionist|doctor`
- Recepción **no ve la pestaña Clínico** del paciente: `canSeeClinical = isAdmin || !!currentDoctorId` (`app/(dashboard)/patients/patient-drawer.tsx:726-733`)
- Recepción **no ve la historia clínica** desde la cita (8-sep): `appointment-sidebar.tsx:2553-2556`
- Auditoría de accesos clínicos: `lib/audit/clinical-access.ts`, con `prescription` ya en el CHECK (mig `254:56-71`)

### 2.7 Lo que NO existe

1. **`prescriptions` no guarda a qué fila del catálogo apunta.** El modal lo sabe (`prescription-composer-modal.tsx:209` `catalogId`, guardado en el draft en `:350`) y **lo descarta antes del POST**, con comentario explícito: *"`catalogId` y `saveToCatalog` son solo de UI: `prescriptions` no tiene esas columnas y el POST las rechazaría"* (`:383-386`). La doctora elige un medicamento con chip "Farmacia" y **el sistema olvida cuál era.** Hueco central de la V2.
2. **No hay evento de receta** en el catálogo de notificaciones (`catalog.ts:82-260`: citas, pagos, pacientes, caja y módulos; nada clínico).
3. **No hay ninguna señal de receta en la agenda** — ni en la tarjeta, ni en el sidebar de la cita.
4. **`quantity` es texto libre y opcional.** Ver §3.5.
5. **No hay reconciliación catálogo ↔ inventario.** `inventory_product_id` solo se llena por importación manual; lo tecleado a mano entra sin vínculo y nadie lo revisa jamás.
6. **No hay estado "entregada/pendiente".** `is_active` es otra cosa. — *Y con el alcance informativo de v1.1, tampoco hace falta. Ver §3.3.*

---

## 3. V1 — Recepción SABE

**Objetivo:** que al abrir la cita de la paciente, recepción vea que hay receta y qué medicamentos, con sus cantidades. Nada más.

### 3.1 Principios de alcance

- **Informativa, no transaccional.** No vende, no cobra, no descuenta stock, no crea ni lee un solo `patient_payment`. No entra en "pagado/pendiente" clínico, ni en Caja, ni en Ingresos.
- **Cero cambios en el gesto del médico.**
- **Cero mecanismos nuevos.** Notificaciones en vivo + la agenda, que ya existen.
- **Cero cola de trabajo.** Ver §3.3.
- **Apagado por defecto en todas las orgs.**

### 3.2 Modelo de datos — ¿hace falta migración?

**Para V1, no.** El alcance informativo elimina las dos cosas que obligaban a tocar el esquema en la versión 1.0 de esta spec:

- El **estado "entregada/pendiente"** desaparece (§3.3).
- El **gadget de cola en el dashboard** desaparece, y con él la ampliación de `get_receptionist_dashboard` (§3.4).

Lo que queda ya está en la base desde 2024: `prescriptions.appointment_id` (`053:74`) con su índice (`053:103`) engancha la receta a la cita, y `GET /api/prescriptions?appointment_id=` (`route.ts:44,52`) ya la devuelve.

**Dos migraciones RECOMENDADAS, ninguna bloqueante:**

**(A) `medication_catalog_id` — inversión para la V2.**

```sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS medication_catalog_id uuid
    REFERENCES medication_catalog(id) ON DELETE SET NULL;
```

Una columna nullable y tres líneas de TypeScript: dejar de descartar `catalogId` (`prescription-composer-modal.tsx:383-399`) y añadirlo al schema Zod (`app/api/prescriptions/route.ts:7-25`). V1 no la lee. Se propone hacerla **ahora** porque si se pospone a V2, V2 arranca con **cero historia**: el día del lanzamiento ninguna receta anterior sabrá a qué producto apunta y la demo será un cascarón. Hacerla hoy significa que dentro de dos meses el 100% de las recetas nuevas trae el vínculo. **Es el mejor retorno por línea de código de todo el documento.**

**(B) Endurecer la RLS de UPDATE de `prescriptions`** — higiene de seguridad preexistente, ver §5.6.

**Lo que NO se toca:** `is_active`, `quantity`, `batch_id`, ni ninguna fórmula de dinero.

### 3.3 Por qué V1 ya no necesita "entregada/pendiente"

En la versión 1.0 de esta spec, el estado servía para una sola cosa: **vaciar una bandeja**. Con el alcance informativo no hay bandeja que vaciar, y el estado se queda sin trabajo:

- **La receta cuelga de la cita, y la cita ya tiene ciclo de vida propio** (`status`, y la píldora de estado en vivo `arrived → in_consultation → ended`). Cuando la cita se cierra y el día pasa, la receta sale de la vista sin que nadie pulse nada.
- **Todo estado que dependa de un clic manual acaba mintiendo.** Si nadie pulsa "entregada", la bandeja acumula recetas viejas y en dos semanas es ruido que el equipo aprende a ignorar. Habríamos construido una lista de tareas que nadie completa: peor que nada, porque enseña a la gente a desconfiar de los avisos.
- **La marca de entrega tampoco añade información fiable.** "Entregada" significaría, según quién pulse, *le di el papel*, *le vendí en farmacia* o *lo pulsé para que se fuera de la lista*. Un dato con tres significados no es un dato.

**Conclusión: fuera de V1.** Si la V2 lo necesita —y sí lo necesita, para no ofrecer dos veces el mismo carrito— se añade entonces y **se marca solo**, al confirmar la venta que nació de esa receta. Un estado que el sistema escribe a partir de un hecho real vale; uno que una persona escribe por obligación, no.

### 3.4 Dónde lo ve recepción — decisión y argumentos

El founder plantea dos opciones para la tarjeta de la cita: **un iconito** o **un botón "Receta asignada"**. Las he evaluado contra `appointment-card.tsx` real, y añado las otras dos superficies posibles.

#### Recomendación: **el sidebar de la cita como sitio principal + un icono `Pill` de 12px en la tarjeta como señal**

| Opción | Veredicto |
|---|---|
| **A. Botón "Receta asignada" dentro de la tarjeta** | ❌ **Descartada.** Ver abajo: no es viable técnicamente ni cabe. |
| **B. Icono `Pill` de 12px en la tarjeta** | ✅ **Sí, como SEÑAL** — no como destino. Es lo máximo que la tarjeta aguanta. |
| **C. Bloque "Receta asignada" en el sidebar de la cita** | ✅ **Sí, PRINCIPAL.** Es donde recepción ya abre la cita y hay sitio de sobra. |
| **D. Gadget en el dashboard "Mi día" de recepción** | ❌ **Descartada para V1.** Ver abajo. |

#### Por qué se descarta el botón en la tarjeta (opción A)

No es una cuestión de gusto, son tres obstáculos duros y uno de producto:

1. **La tarjeta entera ya ES un `<button>`** (`appointment-card.tsx:150`). Un `<button>` dentro de un `<button>` es HTML inválido: los navegadores lo resuelven de forma inconsistente, los lectores de pantalla lo anuncian mal y el foco de teclado se rompe. Meter uno obliga a convertir la tarjeta en `<div role="button">` y reimplementar a mano el teclado, el foco y el rol — tocando el componente que pinta 50–200 elementos por pantalla.
2. **La tarjeta es `draggable`** (`:151`) y su `onClick` abre el sidebar (`:159`). Un control interactivo anidado necesita `stopPropagation` y compite con el `onDragStart` del padre: el usuario intenta pulsarlo, arrastra 3px y en vez de abrir el modal ha movido la cita de hora. Es el peor fallo posible en una agenda.
3. **No cabe.** Con intervalo de 30 minutos, `isCompact = heightPx < 52` (`:110`) y el nombre de la paciente se pinta a 11px con `leading-none`. La fila 1 ya reparte hasta cinco elementos con `gap-1`: punto de recurrente, nombre (`flex-1 truncate`), píldora de estado, camarita de virtual y el chip de deuda — que **no es un icono, es texto**: `S/145` (`:243-250`). El texto "Receta asignada" son 14 caracteres; el `flex-1 truncate` del nombre significa que **lo que se comería es el nombre de la paciente**, que es el dato #1 de la tarjeta. Cambiar el nombre de la paciente por una etiqueta es un mal negocio en cualquier agenda.
4. **De producto: la tarjeta es para escanear, no para operar.** Su trabajo es que recepción barra la columna del día y sepa quién es quién. Todo lo que se hace *con* una cita ya vive en el sidebar. Poner ahí el único botón de una función nueva rompe ese contrato y empuja hacia una tarjeta que en seis meses tendrá cinco botones.

> **Al founder, sin rodeos: la tarjeta no aguanta un elemento más que texto.** Aguanta un icono de 12px, y con esfuerzo. Un botón con etiqueta, no — y el intento saldría caro (reescribir el componente más caliente de la agenda) para acabar en algo peor de lo que hay.

#### Lo que sí se hace en la tarjeta (opción B)

Un icono `Pill` de `lucide-react`, `h-3 w-3 shrink-0`, con `title="Receta asignada"`, insertado en la fila 1 **entre la camarita y el indicador de pago** (`appointment-card.tsx:220-226`). Es exactamente el mismo coste visual que el `Video` que ya está ahí (`:222-224`), que ya sobrevive al modo compacto.

- **No es interactivo.** Un clic en la tarjeta abre el sidebar, como siempre. Un solo destino, cero ambigüedad, cero conflicto con el drag.
- Solo se pinta si el flag de la org está encendido y el rol lo puede ver.
- **Gotcha real:** hay que añadir la prop nueva al comparador de `React.memo` (`:283-311`). Si no, una receta creada a media mañana **no repinta la tarjeta** hasta que cambie otra cosa. Es el fallo silencioso más probable de toda la V1.

**De dónde salen los datos, sin una sola consulta nueva:** se añade `prescriptions(id)` al embed del select de la agenda (`app/(dashboard)/scheduler/page.tsx:231`) y se deriva un `Record<string, number>` en cliente, copiando literalmente el patrón de `paymentTotals` (`:254-265`). El select ya usa interpolación condicional para tolerar esquemas viejos (`${modality ? ", modality" : ""}`, `:231`), así que el embed se añade **solo cuando el flag está encendido** — una org sin la función no paga ni un byte.

**Y solo se embebe el `id`, nunca `medication`.** El conteo es lo único que la tarjeta necesita. Mandar los nombres de los medicamentos de 200 citas al navegador de todo el que abra la agenda —incluidos roles que jamás abrirán el modal— es ancho de banda tirado y una divulgación gratuitamente ancha. Los nombres se piden **solo al abrir**, y así además el acceso queda registrado (§3.6).

#### Lo que se hace en el sidebar (opción C, la principal)

Un bloque nuevo entre **Cobros** (`appointment-sidebar.tsx:2260-2285`) y el bloque clínico que recepción no ve (`:2553-2556`), con el mismo lenguaje visual del resto: icono `Pill` + título **"Receta asignada"** + badge con el conteo.

Desplegado —o en un modal si se prefiere, es indiferente— una lista simple:

```
Receta asignada · 3 medicamentos
Dra. Meza · hoy 10:42

  Amoxicilina 500 mg · Cápsula          1 caja de 21 cápsulas
  Paracetamol 500 mg · Tableta          20 tabletas
  Loratadina 10 mg · Tableta            Cantidad no indicada

  [ Imprimir receta ]   ← solo si el rol puede (§3.6)
```

Por qué el sidebar es el sitio principal:

- **Es donde recepción ya está.** Toca la tarjeta y el sidebar se abre; es su gesto de cada cita, no uno nuevo que enseñar.
- **Hay espacio real**: es un panel completo, no 36 píxeles de alto.
- **Ya es el sitio de "lo que pasa con esta cita"**: cobros, estado, reprogramar, notas.
- **Coste de implementación mínimo**: `GET /api/prescriptions?appointment_id=` ya existe (`route.ts:44,52`) y ya audita (`:57-69`). No hay endpoint nuevo.
- **Escala a V2 sin rediseño**: el botón "Cargar en Farmacia" cabe ahí de forma natural.

#### Por qué se descarta el gadget del dashboard (opción D) — en V1

En la versión 1.0 de esta spec era la superficie principal. Con el alcance informativo ya no se sostiene:

- Un gadget en el dashboard **es una bandeja**, y una bandeja necesita vaciarse, y vaciarse necesita el estado "entregada" que acabamos de eliminar por buenas razones (§3.3).
- **Recepción no vive en el dashboard, vive en `/scheduler`.** El dashboard es la pantalla de entrada de la mañana; a las 11am nadie ha vuelto ahí.
- Tres superficies para una función informativa (campanita + tarjeta + sidebar + dashboard) es exactamente cómo se construye ruido.
- Y cuesta una migración entera (`get_receptionist_dashboard` v3) que de otro modo no hace falta.

Si tras el piloto recepción pide *"quiero ver de un vistazo todas las recetas de hoy"*, se añade entonces, con datos de uso reales en la mano.

#### Y la campanita

Sí, pero como **empujón, no como destino**: el aviso en vivo (§3.5) existe porque el momento importa —la paciente está caminando hacia el mostrador ahora— y porque la campanita ya es realtime sin escribir una línea (`hooks/use-notifications.ts:115-139`). Su `action_url` lleva a la cita: `/scheduler?date=<fecha>&appointment=<id>`. **Sin nombres de medicamentos en el aviso** (§3.6).

### 3.5 Cantidades: qué campo es, y qué se muestra cuando falta

**El campo es `prescriptions.quantity`, y es `text` y opcional.**

- Columna: `quantity text` (`supabase/migrations/053_clinical_history_extensions.sql:82`) — sin CHECK, sin default, nullable.
- En el modal de receta la etiqueta dice, literalmente, **"Cantidad total (opcional)"** (`prescription-composer-modal.tsx:711`), con placeholder `"1 caja de 20 tabletas"` (`:717`).
- **El único campo obligatorio para añadir un medicamento es el nombre**: `canAdd = medication.trim().length > 0` (`:327`).
- Si viene vacío se guarda `null`: `quantity: i.quantity || null` (`:398`).
- El propio modal ya lo trata como opcional al listar el borrador: `{i.quantity && …}` (`:802-806`).

**Traducción honesta: la cantidad va a faltar, y va a faltar a menudo.** Es un campo opcional, de texto libre, al final del formulario. Y no es un formato: "1 caja", "20", "20 tabletas", "1 frasco de 120 ml" son todos válidos y todos conviven.

**Qué se muestra cuando falta:** el texto literal **"Cantidad no indicada"** en gris, en la línea del medicamento.

**Qué NO se hace:** calcularla. Sería técnicamente posible multiplicar `dose_per_take × frequency × duration`, y sería un error grave por dos motivos. Primero, viola la regla de CLAUDE.md de que un número que aparece en pantalla se importa de su fórmula y no se inventa: aquí no hay fórmula que importar, la habríamos inventado nosotros. Segundo, y más serio: **una cantidad de dispensación calculada por software y presentada como si la hubiera escrito la médica es un error clínico esperando a ocurrir.** "Cantidad no indicada" es información verdadera; "21 cápsulas" deducido de tres campos de texto libre es una mentira con aspecto de dato.

**Mitigación recomendada, sin tocar el gesto del médico:** cuando la org tiene la función encendida, cambiar la etiqueta del campo en el modal de receta de *"Cantidad total (opcional)"* a *"Cantidad total (opcional · recepción la verá)"*. Cero campos nuevos, cero clics nuevos, cero validaciones nuevas — solo una razón visible para rellenarlo. Si tras un mes el campo sigue vacío en la mayoría de recetas, esa es la señal para plantear hacerlo obligatorio, con datos y no con intuición (§5.3).

### 3.6 Privacidad: qué ve recepción con este alcance, y qué no

El alcance se estrechó —de "ver y vender" a "ver"— pero **el dato sigue siendo clínico y el rol sigue sin ver la historia clínica**. El análisis se mantiene, aplicado a lo que de verdad se enseña.

**El hecho incómodo:** el nombre del medicamento **es** dato clínico, y a menudo el más revelador que existe. *Levotiroxina* dice hipotiroidismo. *Metformina* dice diabetes o SOP. Un antirretroviral dice VIH. En una clínica de fertilidad, el esquema de estimulación dice el tratamiento y su fase. La decisión del 8-sep de cerrarle la historia clínica a recepción (`appointment-sidebar.tsx:2553-2556`) fue por esto, y **esta feature la roza de frente**. No sería honesto decir "son solo los medicamentos".

**La contrapartida:** la paciente sale del consultorio **con esa misma información impresa en la mano**, y en muchos casos se la va a enseñar a recepción para preguntar dónde comprarla. La receta es, por diseño, un documento que el paciente porta. Lo que proponemos no crea una divulgación nueva: **adelanta unos segundos una divulgación que la propia paciente va a hacer**, y la hace auditable. Ese argumento sostiene la feature, y sostiene exactamente este alcance y no uno mayor.

**Recepción VE:**

| Campo | ¿Lo ve? | Por qué |
|---|---|---|
| Paciente, médico firmante, hora | Sí | Ya los ve en la agenda |
| Que hay receta y cuántos medicamentos | Sí (icono + badge) | Es la señal; no revela nada clínico |
| `medication` (nombre) | **Sí, al abrir el bloque** | Es literalmente lo que el founder pide y sin ello la función no existe |
| `dosage` (concentración) | **Sí, al abrir** | "Losartán" sin "50 mg" no identifica nada; y en V2 sería un error de dispensación |
| `pharmaceutical_form` | **Sí, al abrir** | Distingue jarabe de tableta al hablar con la paciente |
| `quantity` | **Sí, al abrir** | Pedido explícito del founder (§3.5) |

**Recepción NO VE:**

| Campo | Por qué |
|---|---|
| **`instructions` ("Indicaciones")** | **No. Decisión explícita.** Ver abajo |
| `frequency`, `duration`, `route` | Posología. Recepción no administra ni instruye, y el esquema es justo lo que convierte un nombre en **diagnóstico inferible** ("cada 6 h por 3 días" vs "una vez al día, continuo") |
| Diagnóstico, nota clínica, adjuntos | Fuera de alcance y ya cerrados desde el 8-sep |
| **Recetas de otros días o de otras citas** | Ver contención 2, abajo |

**Sobre "Indicaciones" (`instructions`), en concreto: no se muestran. Es un no rotundo, no un "de momento no".** Cuatro razones:

1. **Es el campo con más probabilidad de contener el diagnóstico en castellano llano.** Es texto libre que la médica escribe para la paciente: *"tomar hasta que ceda el sangrado"*, *"suspender si hay náuseas"*, *"para el mareo del tratamiento"*, *"no tomar si hay retraso menstrual"*. Cada uno de esos ejemplos revela más que el nombre del fármaco.
2. **Recepción no tiene ningún uso operativo para él.** No cambia qué caja se entrega, ni qué se le dice a la paciente, ni qué se cobra en V2. Es puro riesgo sin contrapartida.
3. **Ya está donde tiene que estar**: impreso en la receta que la paciente lleva, y en la historia clínica que la médica ve.
4. **Recepción no debe instruir sobre medicación.** Que tenga la posología en pantalla la invita a responder *"¿y cada cuánto lo tomo?"* desde el mostrador. Esa pregunta se responde leyendo el papel o llamando a la doctora, no de memoria por alguien sin formación clínica. **Ocultar el campo es también protegerla a ella.**

**Las cuatro contenciones que hacen defendible el conjunto:**

1. **Apagado por defecto, encendido por la dueña de la clínica** (§3.7). La divulgación la autoriza quien responde legalmente por ella.
2. **Anclado a la cita, no al paciente.** El bloque vive dentro del sidebar de **una** cita y muestra **las recetas de esa cita**. **No hay búsqueda, no hay histórico, no hay "todas las recetas de Karla".** Una recepcionista no puede navegar la farmacopea histórica de nadie: solo puede ver lo que se recetó en la cita que tiene abierta. Esto es lo que separa una ventana operativa de una historia clínica por la puerta de atrás, y **es innegociable en el diseño**.
3. **Todo acceso queda escrito.** El `GET /api/prescriptions` ya llama a `logClinicalAccess` con `resource_type='prescription'` (`route.ts:57-69`) y `clinical_access_log` ya acepta ese tipo (mig `254:56-71`). Si mañana hay una queja, hay registro de quién abrió qué y cuándo. Por eso los nombres se piden al abrir y **no viajan en el payload de la agenda** (§3.4): un embed masivo sería una lectura invisible para la auditoría.
4. **Recepción no reimprime documentos clínicos por defecto.** El PDF (`/api/pdf/prescription/batch/[batchId]`) es del médico. *Excepción a decidir en §5.2*: reimprimir cuando la impresión falló es uno de los cuatro motivos de §1.2, y hoy no hay nadie más en el mostrador que pueda hacerlo.

**Alternativa "modo ciego"** (recepción ve *"Receta asignada · 3 medicamentos"* y **ningún nombre**): captura los motivos 1, 2 y 4 de §1.2 con **cero divulgación clínica nueva**.
**Recomendación: no construirlo como tercer modo.** Añade un estado de configuración para ahorrar un riesgo que las cuatro contenciones ya cubren, y contradice el pedido explícito del founder ("ve los nombres y cantidades"). Si una clínica concreta no quiere que su recepción vea nombres, la respuesta correcta es **apagar la función entera** para esa org: ya se puede, hoy, sin escribir código.

### 3.7 El toggle por org: nombre exacto y dónde vive

**Recomendación: el toggle ES la celda de la matriz de notificaciones. No se crea un flag nuevo.**

- **Dato:** `organizations.settings.live_notifications.prescription_issued.audiences`
- **Apagado por defecto:** `defaultAudiences: []` en el catálogo TS. Ausencia de clave = defaults = vacío = nadie ve nada. Una clínica que no receta en Yenda **no nota que esto existe**.
- **Encendido:** Ajustes → Notificaciones → fila "Receta emitida" → columna "Recepción". La UI ya está escrita (`app/(dashboard)/settings/live-notifications-section.tsx`) y ya hace merge sin pisar el resto del JSONB (`:83-95`).
- **Lectura en cliente** para decidir si se pinta el icono en la tarjeta y el bloque en el sidebar: `resolveAudiences(event, settings).includes("reception")` — helper existente (`catalog.ts:284-292`).
- **Migraciones que cuesta el toggle: cero.**

**Por qué no un flag propio** (estilo `restrict_doctor_patients`): habría que **AND-earlo** con la matriz, y eso produce el bug clásico e insufrible de *"lo activé y no pasa nada"* — el dueño enciende el flag, la matriz sigue en `[]`, nadie recibe nada. Dos interruptores para una función es una promesa de ticket de soporte.

**Matiz honesto:** aquí la celda gobierna **más que un aviso** — gobierna también el icono y el bloque del sidebar. Es un uso ligeramente ampliado de esa matriz. Lo asumo a conciencia porque la alternativa (dos interruptores) es peor, y porque la etiqueta y la descripción del evento lo dejarán explícito: *"Recepción ve la receta en la cita y recibe aviso al emitirse."*

**Concesión de descubribilidad** (opcional, barata): un interruptor espejo en Ajustes → **Permisos** (`permissions-settings-tab.tsx`) rotulado *"Recepción ve las recetas de la cita"* que escribe **la misma clave**. Dos puertas, un solo dato — nunca una copia.

**Por qué no depende del addon `almacen`:** el matiz del founder lo zanja. Si el objetivo es **saber** y no vender, y la paciente puede comprar en cualquier botica, entonces la función vale exactamente igual en una clínica sin farmacia. Atarla al addon dejaría fuera justo a las clínicas pequeñas donde recepción es la única persona en el mostrador. **V2 sí exige `almacen`**, porque sin kardex no hay nada que precargar.

### 3.8 El evento de notificación

Un evento nuevo en `lib/live-notifications/catalog.ts` (el catálogo vive en TS justamente para no migrar por esto — `catalog.ts:4-8`):

```ts
{
  key: "prescription_issued",
  type: "prescription",
  label: { es: "Receta emitida", en: "Prescription issued" },
  description: {
    es: "El médico recetó medicamentos. Recepción ve 'Receta asignada' en la cita y recibe el aviso al emitirse. Apagado por defecto.",
    en: "A doctor prescribed medication. Reception sees it on the appointment and is notified. Off by default.",
  },
  // El doctor que la firmó no necesita que le anuncien lo que acaba de hacer,
  // y otro doctor no tiene por qué enterarse: "doctor" ni siquiera es elegible.
  // La asesora tampoco: no es una tarea suya.
  eligibleAudiences: ["owner_admin", "reception"],
  defaultAudiences: [],   // vacío = apagado. Se enciende en Ajustes → Notificaciones.
  doctorScope: "all",
}
```

**Emisión:** server-side, dentro de `POST /api/prescriptions` (`route.ts:196-232`), tras el insert y el log de auditoría, vía `notifyOrgMembers` (`lib/live-notifications/notify.ts:76`) con `excludeUserId: user.id`. Fire-and-forget: una notificación que falla **jamás** puede tumbar el guardado de la receta (contrato explícito en `notify.ts:20-24`).

**No se usa `/api/live-notifications/emit`.** Ese puente existe para call-sites de cliente (`emit/route.ts:10-13`); aquí ya estamos en el servidor con org, paciente, doctor y cita resueltos. Un round-trip extra solo añadiría una forma de fallar.

**Texto** (sin nombres de medicamentos, §3.6):

- title: `Receta para Karla Ríos`
- body: `3 medicamentos · Dra. Meza`
- action_url: `/scheduler?date=2026-09-10&appointment=<appointment_id>` — y si la receta se hizo sin cita (drawer del paciente), `/patients?patient=<patient_id>`

### 3.9 Qué pasa en orgs sin farmacia

Nada distinto: la función es idéntica. No hay disponibilidad, no hay botón de farmacia, y el bloque del sidebar es una lista de lectura. Recepción sabe qué le recetaron a la paciente y puede decirle dónde comprarlo. **Ese es el caso principal de V1, no el degradado.**

Y si el evento está apagado —el estado por defecto—, la org **no ve absolutamente nada**: sin icono, sin bloque, sin campanita, sin cambio de comportamiento y sin un solo byte extra en el payload de la agenda.

### 3.10 Resumen de archivos que toca V1

| Archivo | Cambio |
|---|---|
| `lib/live-notifications/catalog.ts` | +1 evento |
| `app/api/prescriptions/route.ts` | emisión del aviso (+ `medication_catalog_id` en el schema, si se aprueba la mig A) |
| `app/(dashboard)/scheduler/page.tsx` | embed condicional `prescriptions(id)` + `Record` derivado, calcado de `paymentTotals` (`:254-265`) |
| `app/(dashboard)/scheduler/day-view.tsx`, `week-view.tsx` | pasar la prop nueva a las tarjetas |
| `app/(dashboard)/scheduler/appointment-card.tsx` | icono `Pill` de 12px **+ la prop en el comparador de `memo` (`:283-311`)** ⚠️ |
| `app/(dashboard)/scheduler/appointment-sidebar.tsx` | bloque "Receta asignada" entre Cobros (`:2260`) y el bloque clínico (`:2559`) |
| `components/layout/topbar.tsx` | icono/color para `type: "prescription"` |
| `components/clinical/prescription-composer-modal.tsx` | dejar de descartar `catalogId` (~3 líneas) + etiqueta de cantidad (§3.5) ⚠️ *otro agente está en este árbol* |
| `supabase/migrations/2XX_prescription_catalog_link.sql` | **recomendada** — 1 columna (mig A, §3.2) |
| `supabase/migrations/2XX_prescriptions_rls_update.sql` | **recomendada** — higiene (mig B, §5.6) |
| `supabase/migrations/rollbacks/…` | los correspondientes — convención del repo |

---

## 4. V2 — El puente con Farmacia y Almacén

**Lo primero, y define todo el resto: en V2 la venta sigue siendo el flujo actual del POS. Lo que se añade es un ATAJO opcional que precarga el carrito.** Nadie está obligado a pasar por él, ninguna venta lo requiere, y si falla o no encuentra los productos, recepción teclea como hoy y la función simplemente no aparece. Un atajo que se convierte en paso obligado es un flujo nuevo disfrazado, y eso es exactamente lo que el matiz del founder descarta.

### 4.1 El hueco, sin adornos

**Hoy no hay forma fiable de casar un medicamento recetado con un producto de almacén.**

1. **La receta guarda texto libre.** `prescriptions.medication text NOT NULL` (`053:76`). Sin FK, sin código, sin nada.
2. **El vínculo se calcula y se tira.** La doctora busca "Losart", el modal le ofrece la fila del catálogo **con chip "Farmacia"** porque tiene `inventory_product_id` (`prescription-composer-modal.tsx:551-557`), ella la elige, el modal guarda `catalogId` en el draft (`:350`)… y el POST lo borra a propósito (`:383-386`). **El sistema tuvo el vínculo en la mano y lo soltó.**
3. **El catálogo se ensucia solo.** Lo tecleado a mano se auto-inserta en `medication_catalog` con `inventory_product_id = NULL` (`use-medication-catalog.ts:140-172`). Nadie revisa esas filas jamás.
4. **La cantidad no es un número** (§3.5). "1 caja" no es una línea de carrito.

Consecuencia: **si V2 se implementara hoy sobre los datos actuales, no podría precargar prácticamente nada.** Por eso la mig A se propone en V1 (§3.2).

### 4.2 El camino: dos saltos, no una FK nueva

```
prescriptions.medication_catalog_id  →  medication_catalog.inventory_product_id  →  inventory_products.id
        (mig A, §3.2)                          (mig 248:36 — YA EXISTE)
```

**No se añade `prescriptions.inventory_product_id`.** Motivos:

- Duplicaría la verdad. El catálogo es el vocabulario clínico de la clínica y ya carga el vínculo; dos rutas al mismo producto divergen el día que alguien re-enlaza una y no la otra.
- El vínculo del catálogo ya tiene mantenimiento previsto: `ON DELETE SET NULL` e índice único por producto (`248:36,51-53`). Una FK directa obligaría a duplicar esas reglas.
- **La receta debe sobrevivir a que el producto desaparezca del almacén**: es un documento clínico, no una línea de pedido. Con dos saltos, si el producto se borra la receta queda intacta y solo pierde disponibilidad.

**Fiabilidad esperada:** las recetas emitidas tras la mig A, compuestas eligiendo del catálogo, tendrán vínculo **exacto**. Las de texto libre y todo el histórico, ninguno. De ahí lo siguiente.

### 4.3 Reconciliación: mapeo manual una vez, nunca automático

Pestaña **"Sin enlazar"** en Ajustes → Catálogo de medicamentos (`app/(dashboard)/admin/medication-catalog/page.tsx`, que ya tiene el modal de importación — `:254-336`):

- Lista `medication_catalog` con `inventory_product_id IS NULL`, ordenado por **frecuencia de uso real** (`COUNT(*)` sobre `prescriptions` de los últimos 90 días) — para enlazar primero los 20 que se usan a diario y no los 400 tecleados una vez.
- Sugiere candidatos de `inventory_products` (`is_sellable = true`, `is_discontinued = false`) por **nombre normalizado**: `normalizeSearchText` (`lib/utils.ts:87-92`) o `normalize` (`medication-catalog/page.tsx:56-62`), reforzado con `pg_trgm`, ya instalado (`supabase/migrations/103_perf_indexes_2026_04_22.sql:21`).
- **Un humano confirma cada uno. Siempre. Sin "enlazar todos los que coincidan al 100%".**

**Por qué la confirmación humana no es negociable:** "Losartán 50 mg" y "Losartán 100 mg" tienen ~0.94 de similitud trigrámica y son **el doble de la dosis**. "Enalapril" y "Enalaprilato" son fármacos distintos por vía distinta. Un matcheo automático que acierte el 97% produce, en una clínica de 40 recetas al día, **más de un error de dispensación por día**. Eso no es un bug de UX; es un evento adverso con nombre y apellido. La normalización **ordena sugerencias**; jamás decide.

Coste para la clínica: 20–40 minutos en el onboarding del módulo. Después el catálogo **es** el mapeo.

**Mejora complementaria, barata y de alto retorno:** en el modal de receta, cuando la doctora escribe algo fuera del catálogo y marca "guardar en catálogo" (`prescription-composer-modal.tsx:331`), ofrecerle ahí mismo *"¿es este producto de tu farmacia?"* con las 3 mejores sugerencias. Enlazar mientras alguien que sabe de medicamentos mira la pantalla es infinitamente mejor que enlazar después en una pantalla de administración.

### 4.4 La precarga del carrito

**No se construye un flujo nuevo de farmacia.** Se extiende el puente que ya existe: hoy Almacén manda a `/farmacia?add=<productId>` y el POS lo consume una vez y limpia la URL (`app/(dashboard)/farmacia/page.tsx:478-497`).

V2: el bloque del sidebar de la cita gana un botón **"Cargar en Farmacia"** (visible solo con addon `almacen` y rol que pueda cobrar — `217:162-165`) que abre `/farmacia?rx=<batch_id>`. El POS, con el mismo patrón (`useRef` de un solo uso + `history.replaceState`):

1. Resuelve el lote → `medication_catalog_id` → `inventory_product_id`.
2. Crea **un** borrador (`ensureDraft`, `farmacia/page.tsx:329-341`) con `patient_id` preseleccionado desde la receta — la venta a paciente identificado ya es de primera clase (`216:53-56`).
3. Inserta las líneas resueltas en `pharmacy_sale_items`, con `unit_price` = `inventory_products.sale_price` y lote FEFO.
4. Dice con claridad lo que **no** pudo cargar: *"2 de 3 cargados. Metformina 850 mg no está en tu farmacia."*

**El invariante del POS se respeta íntegro:** la pantalla solo edita su borrador; descontar stock y cobrar sigue siendo exclusivo de `pharmacy_confirm_sale` (`217:12-16`). La precarga **no cobra, no descuenta, no toca caja**. Si recepción abandona el carrito, `clearCart` (`farmacia/page.tsx:456-464`) borra el borrador por CASCADE y no queda rastro.

### 4.5 Stock insuficiente, lotes FEFO y precios

Ninguno necesita reglas nuevas. Las tres decisiones ya están tomadas en el repo y se heredan tal cual.

**Stock insuficiente — no bloquea.** `pharmacy_confirm_sale` devuelve `warnings` en vez de fallar (`217:245-268`), con el razonamiento explícito de que el producto ya está físicamente en la mano de quien vende (`217:248-251`). La precarga hace lo mismo un paso antes: carga la línea y la marca en ámbar. Recepción decide si vende, vende parcial o dice "no tenemos". **Decide la persona con el producto delante, no el software.**

**FEFO.** `nearestLotByProduct` (`app/(dashboard)/almacen/types.ts`) ya elige el lote más próximo a vencer, y es lo que el POS hace hoy al añadir un producto. La precarga llama a **la misma función**: si mañana la clínica cambia de criterio, se cambia en un sitio. Si el producto tiene `track_lots` y el lote más cercano no cubre la cantidad, es advertencia (`217:261-270`), no bloqueo.

**Precios e IGV — regla de oro de CLAUDE.md, intacta.** El precio sale **siempre** de `inventory_products.sale_price`, digitado **con IGV** porque es el precio de mostrador (`almacen/types.ts`, sección IGV). **Jamás de la receta**: la receta no tiene precio y no debe tenerlo nunca. El desglose lo calcula `computeLineTax` según `igv_affectation` (1 gravado / 8 exonerado / 9 inafecto) y lo **recalcula el servidor** en `pharmacy_confirm_sale`; la vista previa del carrito es previa, no verdad (`farmacia/types.ts`, `cartTotals`).

**Separación de plata clínica y de farmacia — intacta.** La venta resultante es `source='pos'`. **No cancela deuda de citas, no aparece en "pagado/pendiente" clínico, no entra en `get_patient_summary`** (migs 213/219/233). Que la venta nazca de una receta **no la convierte en plata clínica**: es una venta de mostrador de la que casualmente sabemos el origen. Blindar esto en la revisión de código de V2, porque es exactamente el tipo de vínculo que invita a alguien a "sumarlo al total del paciente".

### 4.6 Migraciones de V2

```sql
-- 2XX_prescription_quantity_units.sql
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS quantity_units numeric(12,3);
```

Convive con `quantity text`, que **no se toca ni se reinterpreta** (regla "un número, una fórmula": el texto libre es lo que se imprime en la receta y sigue siéndolo). En el modal, un input numérico opcional junto a "Cantidad total"; si viene vacío, la línea se precarga con cantidad 1 y recepción la ajusta.

Aquí sí entra el estado de entrega que V1 descartó — pero **escrito por el sistema, no por una persona**: al confirmar una venta nacida de un lote, se marca ese lote para no volver a ofrecer el mismo carrito. Cabe en la misma migración (`handed_over_at`, `handed_over_by`) o directamente como `pharmacy_sales.prescription_batch_id`, que además deja trazabilidad real y es probablemente mejor. **Decisión de diseño para cuando se especifique la V2**, no ahora.

Opcionalmente, una segunda migración con índices para la pantalla de reconciliación (`medication_catalog (organization_id) WHERE inventory_product_id IS NULL` + trigram sobre `inventory_products.name`), decidible al medir.

---

## 5. Riesgos y decisiones abiertas — preguntas para el founder

Cada una con recomendación.

**5.1 — Botón o icono en la tarjeta de la cita.**
→ **Recomendación: icono de 12px en la tarjeta (señal) + bloque en el sidebar (destino). El botón se descarta.** La tarjeta ya es un `<button>` arrastrable (`appointment-card.tsx:150-151`): meter otro botón dentro es HTML inválido, rompe el drag y obliga a reescribir el componente más caliente de la agenda; y en modo compacto (30 min, `heightPx < 52`) el texto "Receta asignada" se comería el nombre de la paciente vía el `flex-1 truncate` de `:184`. Argumentos completos en §3.4. **Esto contradice una de las dos opciones planteadas: la tarjeta no aguanta un botón con etiqueta.**

**5.2 — ¿Recepción puede reimprimir la receta?**
No estaba en el pedido, pero *"la impresión falló y la paciente ya se fue del consultorio"* es uno de los cuatro motivos de §1.2, y hoy no hay nadie más en el mostrador que pueda resolverlo.
→ **Recomendación: sí, un botón "Imprimir receta" en el bloque del sidebar.** Es el mismo documento que la paciente iba a llevarse, con la misma firma del médico; recepción no puede editarlo, y `/api/pdf/prescription/batch/[batchId]` ya registra el acceso (`route.tsx:150`). La alternativa real no es "no se imprime", es "recepción interrumpe a la doctora entre pacientes". Si preocupa, se deja fuera de V1 y se mide cuántas veces lo piden.

**5.3 — La cantidad va a venir vacía a menudo. ¿Se hace obligatoria?**
El campo se llama literalmente *"Cantidad total (opcional)"* (`prescription-composer-modal.tsx:711`) y lo único obligatorio para añadir un medicamento es el nombre (`:327`).
→ **Recomendación: no hacerla obligatoria en V1.** Hacerla obligatoria cambia el gesto del médico (§1.3) y el primer efecto sería que la doctora escriba "1" para pasar de pantalla. Empezar por la etiqueta con contexto (*"recepción la verá"*, §3.5), mostrar **"Cantidad no indicada"** cuando falte, y **medir**. Si al mes sigue vacía en la mayoría de recetas, se replantea con datos. **Y en ningún caso calcularla** (§3.5).

**5.4 — ¿Se muestran las "Indicaciones"?**
→ **Recomendación: no, y no como "de momento".** Es el campo con más probabilidad de contener el diagnóstico en castellano llano, recepción no tiene ningún uso operativo para él, ya viaja impreso con la paciente, y tenerlo en pantalla la invita a instruir sobre medicación desde el mostrador. Ocultarlo también la protege a ella. Análisis completo en §3.6.

**5.5 — ¿El toggle es la celda de la matriz de notificaciones?**
→ **Recomendación: sí.** Cero migraciones, UI ya construida, un solo dato. Asumo a conciencia que esa celda gobierna algo más que un aviso (también el icono y el bloque) y lo hago explícito en la descripción del evento. Dos flags AND-eados garantizan el ticket *"lo activé y no funciona"*. Si preocupa la descubribilidad, interruptor espejo en Ajustes → Permisos escribiendo **la misma clave**.

**5.6 — Hallazgo colateral: la RLS de `prescriptions` deja a cualquier miembro editar cualquier receta.**
`prescriptions_update` (`053:96-97`) es org-wide y sin `WITH CHECK`. Hoy la UI no lo expone, pero PostgREST sí: una recepcionista con la clave pública y su sesión puede cambiar `medication` de una receta firmada. **Existe desde la mig 053 y es independiente de esta feature** — pero esta feature le pone delante una pantalla que muestra recetas, lo que acorta la distancia entre "posible" y "trivial".
→ **Recomendación: arreglarlo junto con V1** — restringir UPDATE a `owner|admin|doctor`, mismo criterio que `CLINICAL_WRITE_ROLES` (`api/prescriptions/route.ts:33`). Coste: media jornada. No hacerlo es dejar un agujero conocido junto a una puerta nueva.

**5.7 — ¿Y si la clínica ya usa otra historia clínica (caso Vitra, que usa Omnia)?**
Si la doctora no receta en Yenda, no hay evento y la función es invisible.
→ **Recomendación: validar V1 con una clínica que sí recete en Yenda antes de comprometer V2.** Si la mayoría del pipeline receta fuera, V2 (4–6 jornadas) tiene un mercado bastante más pequeño de lo que parece. V1 cuesta poco y sirve de sonda.

**5.8 — ¿Reconciliación automática del catálogo por nombre?**
→ **Recomendación: no, nunca automática.** Sugerir sí, decidir no (§4.3). "Losartán 50" vs "Losartán 100" es el doble de la dosis, no un typo.

**5.9 — ¿Qué pasa si la doctora edita o suspende la receta después de avisar?**
→ **No perseguirlo.** La notificación es un empujón puntual; el bloque del sidebar lee `prescriptions` **en vivo**, así que al abrirlo recepción ve el estado actual y las filas con `is_active = false` salen filtradas. La campanita puede quedar desfasada unos segundos: aceptable, y retractar notificaciones cuesta mucho más de lo que vale.

**5.10 — ¿Y las recetas hechas sin cita (desde el drawer del paciente)?**
El atajo funciona sin `appointment_id` (`clinical-shortcuts.tsx:26-28`), así que hay recetas que no cuelgan de ninguna cita — y esas **no tienen tarjeta en la agenda donde pintar el icono**.
→ **Recomendación: en V1 esas viven solo en la campanita**, con `action_url` a `/patients?patient=<id>`. Es un caso minoritario (el atajo principal es desde la cita) y darle superficie propia obliga a inventar una bandeja, que es justo lo que §3.3 descarta. Si resulta ser frecuente, se replantea con datos.

**5.11 — El fallo silencioso más probable de la implementación.**
`AppointmentCard` está envuelta en `React.memo` con comparador manual (`appointment-card.tsx:283-311`). Si la prop nueva no se añade ahí, **una receta creada a media mañana no repinta la tarjeta** hasta que cambie otra cosa de esa cita: el icono "a veces no sale" y nadie sabe por qué.
→ **Recomendación: que esté explícito en la revisión de código, y probarlo así** — abrir la agenda, recetar desde otra pestaña, refrescar la consulta de la agenda y verificar que el icono aparece sin recargar la página.

---

## 6. Estimación

Jornadas de una persona con contexto del repo. Incluye pruebas manuales; **no** incluye QA formal ni despliegue.

### V1 — 1.5 a 2.5 jornadas · 0 migraciones obligatorias, 2 recomendadas

| Bloque | Jornadas |
|---|---|
| Evento en el catálogo TS + emisión en `POST /api/prescriptions` + icono en topbar | 0.4 |
| Embed condicional + `Record` derivado en `scheduler/page.tsx` + prop hasta las tarjetas | 0.3 |
| Icono `Pill` en la tarjeta **+ comparador de `memo`** | 0.2 |
| Bloque "Receta asignada" en el sidebar de la cita (lista + estados vacíos + "Cantidad no indicada") | 0.5 |
| Etiqueta de cantidad con contexto en el modal de receta (§3.5) | 0.1 |
| Interruptor espejo en Ajustes → Permisos (si se aprueba §5.5) | 0.2 |
| Pruebas de roles y flag (recepción, doctor, asesora, org con flag off, receta sin cita, receta suspendida) | 0.4 |
| **Mig A recomendada**: `medication_catalog_id` + dejar de descartar `catalogId` + rollback | 0.3 |
| **Mig B recomendada**: endurecer RLS de UPDATE + rollback (§5.6) | 0.4 |

Sin las dos migraciones recomendadas, V1 sale en ~2 jornadas. **Ambas se recomiendan igualmente**: la A porque sin ella la V2 nace sin historia, la B porque es un agujero conocido.

### V2 — 4 a 6 jornadas · 1 a 2 migraciones

| Bloque | Jornadas |
|---|---|
| Mig: `quantity_units` (+ vínculo venta↔receta, §4.6) + rollback | 0.4 |
| Campo cantidad numérica en el modal de receta | 0.3 |
| Pestaña "Sin enlazar": lista por frecuencia real, sugerencias trigram, confirmación 1 a 1 | 1.5 |
| Sugerencia de enlace en caliente dentro del modal de receta (§4.3) | 0.5 |
| `?rx=<batchId>` en el POS: resolver lote → productos, borrador multi-línea, FEFO, paciente preseleccionado | 1.2 |
| Botón + disponibilidad en el bloque del sidebar ("2 de 3 en tu farmacia") | 0.5 |
| Pruebas: stock 0, stock parcial, producto descatalogado, lote vencido, org sin `almacen`, venta abandonada, **no contaminación de plata clínica** | 1.0 |

**Riesgo de plazo principal de V2:** la reconciliación del catálogo. No es código difícil; es **trabajo del cliente** que hay que conseguir que haga. Si una clínica no dedica esos 30 minutos, V2 le precarga la mitad de las líneas y la percepción será "no funciona". Tratar la sesión de enlace como parte del onboarding del módulo, no como una pantalla que existe por si acaso.

---

## 7. Lo que este documento propone NO construir

- Un botón dentro de la tarjeta de la cita (§3.4, §5.1).
- Un estado "entregada/pendiente" en V1 (§3.3).
- Un gadget de cola en el dashboard de recepción en V1 (§3.4, opción D).
- Un histórico o buscador de recetas para recepción (§3.6, contención 2).
- Mostrar indicaciones, posología, vía o duración a recepción (§3.6, §5.4).
- Calcular la cantidad cuando la médica no la escribió (§3.5).
- Una tabla `prescription_batches` (`batch_id` ya cumple).
- Una FK `prescriptions.inventory_product_id` (§4.2).
- Un mecanismo de avisos propio (`lib/live-notifications/` ya lo hace y ya es realtime).
- Un flujo de farmacia paralelo: `?add=` y `pharmacy_confirm_sale` ya existen y son el único camino que descuenta stock (§4.4).
- Matcheo automático de medicamentos por nombre (§4.3, §5.8).
- Cualquier cambio en el gesto del médico (§1.3).
- Cualquier vínculo entre la receta y el dinero clínico (§4.5).
