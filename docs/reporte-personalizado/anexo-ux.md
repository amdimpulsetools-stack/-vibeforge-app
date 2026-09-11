# Reporte personalizado — diseño de experiencia (UX)

> Rol: experto en experiencia de usuario. Solo lectura de código; rutas citadas como `archivo:línea`.
> Usuaria: Dra. Patricia (dueña, ginecóloga de fertilidad, no técnica, con prisa) y su contadora, que lee el papel sin abrir la app.
> Vocabulario obligatorio: el de `docs/mapa-del-dinero.md` (Facturado por citas · Cobrado total · Pendiente por cobrar · Cobros por tratamientos).

## 0. Decisiones en una línea

| Tema | Decisión |
|---|---|
| Dónde vive | Tab nueva **"Personalizado"** en `/reports`, en **segunda posición** (justo después de Financiero). No es una sección dentro de Financiero. |
| Rango | Se hereda del header compartido de Reportes (fechas + presets Hoy/7d/30d/90d/Este mes). No se duplica un selector dentro de la tab. |
| Estado inicial | **Todas las secciones marcadas.** Rango = el que ya tenga el header (por defecto "Este mes"). |
| Secciones | Servicios · Adelantos y pagos a cuenta · Farmacia · Cobros por tratamientos. Las que no aplican **no se pintan** (ni deshabilitadas). |
| Generar | **En vivo** al cambiar el rango (una llamada RPC, cacheada). Los checks nunca refetchean: solo muestran/ocultan. Sin botón "Generar". |
| Imprimir | **Un solo botón primario: "Imprimir o guardar PDF"** → abre en pestaña nueva un PDF con membrete generado por el motor HTML→Chromium (`lib/pdf/html`). La vista en pantalla queda además limpia para Ctrl+P como red de seguridad, sin botón propio. |
| Columnas | Descripción · Cantidad · Total en tres secciones; **"Precio unit." solo en Farmacia**, la única donde Cantidad × Precio − Dscto = Total es verdad. |
| Cuadre | Línea "Cuadre con Financiero" bajo el TOTAL FINAL, calculada con los mismos números: con todo marcado, TOTAL FINAL = Cobrado total + Cobros por tratamientos. |
| Presets guardados | No en V1. Tampoco se persiste la última selección. |

---

## 1. Dónde vive y cómo se llega

**Tab nueva "Personalizado" dentro de Reportes, no una sección dentro de Financiero.** Razones tomadas de la estructura real de la página:

1. **El header de Reportes ya es dueño del rango y de las tabs.** `app/(dashboard)/reports/page.tsx:212-283` renderiza un solo header con título, dos `input type="date"` (líneas 228-240), los presets `DATE_PRESETS` (78-84, 244-252) y la fila de tabs (264-282). Todas las tabs leen el mismo `debounced.dateFrom/dateTo` (300 ms de debounce, 104-108). Una tab nueva hereda el rango gratis y —lo importante para la doctora— **cambiar de "Financiero" a "Personalizado" y volver mantiene el mismo periodo**, que es exactamente la comparación que va a hacer con la contadora (§4).
2. **Financiero ya es dos pantallas en una.** `financial-report.tsx:222-377` es una grilla de 6-7 tarjetas (224-294), dos gráficos recharts (296-330) y la tabla por doctor (332-376). Colgar debajo un bloque con checkboxes y cuatro tablas imprimibles lo convertiría en tres cosas, y al imprimir arrastraría gráficos que la contadora no pidió.
3. **El patrón de tab autocontenida ya existe.** Retención y Fertilidad traen sus propios agregados y no disparan el fetch compartido (`page.tsx:126-127` `needsSharedData`; `fertility-report.tsx:123-144`). "Personalizado" sigue ese molde: su propio `useQuery` con key `["reports","custom",organizationId,debounced]` (cache por rango como en `page.tsx:129-131`), sin recharts, chunk diminuto vía `next/dynamic` como los demás (`page.tsx:43-76`).
4. **Posición: segunda, después de Financiero.** La fila de tabs hace scroll horizontal en móvil (`page.tsx:264` `overflow-x-auto`); la quinta tab ya queda fuera de pantalla a 390 px. Un reporte que la doctora va a usar cada tarde no puede vivir escondido tras un scroll lateral. Icono sugerido: `Printer` de lucide (es la tab "de imprimir"; `FileText` ya connota documento clínico).

**Cómo se llega:** Sidebar → Reportes (solo owner/admin: `components/layout/sidebar.tsx:181` `adminOnly: true`, resuelto por `useOrgRole().isAdmin`, `hooks/use-org-role.ts:41`) → tab "Personalizado". La contadora normalmente **no entra**: recibe el PDF por WhatsApp o el papel impreso. Si el founder decide que la recepcionista imprima el "Hoy" al cierre, la ruta API debe gatear por rol igual que el sidebar (ver §8, pregunta 6).

Dos ajustes obligatorios en `page.tsx` al añadir la tab:
- **Ocultar el botón "Resumen IA" y su panel en esta tab** (`page.tsx:255` `<AiSummaryButton />` y `:294` `<AiSummaryPanel>`). `lib/validations/api.ts:95` valida `reportType` con un enum cerrado (`financial|marketing|operational|retention|general`); con `reportType="custom"` el POST devuelve 400 y la doctora vería "Error al generar el resumen" (`language-provider.tsx:520`). Además el nombre "Resumen IA" (`language-provider.tsx:510`) colisiona con cualquier tab llamada "Resumen": por eso la tab se llama **Personalizado** y no "Resumen".
- **`print:` en el shell de Reportes.** `app/(dashboard)/layout.tsx:110-113` ya deja el shell en `print:h-auto print:overflow-visible` y sidebar/topbar llevan `print:hidden` (`sidebar.tsx:426`, `topbar.tsx:215`), pero `page.tsx:212` (`h-[calc(100dvh-5rem)]`) y `:292` (`overflow-y-auto`) no: un Ctrl+P hoy saldría recortado a una pantalla. Añadir `print:h-auto print:overflow-visible` a esos dos divs y `print:hidden` al header (`:214`).

---

## 2. El flujo completo

### 2.1 Estado inicial (lo que ve al entrar)

```
┌ Reportes ─────────────────────────────────────────────────────────────────┐
│ [01/09/2026] — [11/09/2026]   Hoy  7d  30d  90d  Este mes  │ (sin Resumen IA)│
│ Financiero  ▶Personalizado◀  Marketing  Operacional  Retención  Fertilidad │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌ Secciones del reporte ──────────────────────────────── (sticky) ───────┐ │
│ │ ☑ Servicios  ☑ Adelantos y pagos a cuenta  ☑ Farmacia  ☑ Cobros por    │ │
│ │   tratamientos                                                          │ │
│ │ Reporte de cobros · Del 1 al 11 de septiembre de 2026 · 4 secciones     │ │
│ │                                        [ 🖨 Imprimir o guardar PDF ]    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌ (vista previa del papel, tarjeta blanca, max-w-3xl centrada) ──────────┐ │
│ │ REPORTE DE COBROS                                                       │ │
│ │ Del 1 al 11 de septiembre de 2026                                       │ │
│ │ SERVICIOS ······································· S/ 2,050.00           │ │
│ │  Lo cobrado en estas fechas por las citas de estas fechas…              │ │
│ │  Descripción                 Citas        Total                         │ │
│ │  Consulta de fertilidad          4   S/ 1,000.00                        │ │
│ │  Ecografía transvaginal          5   S/ 1,050.00                        │ │
│ │  Subtotal Servicios                  S/ 2,050.00                        │ │
│ │ ADELANTOS Y PAGOS A CUENTA ······················ S/   550.00           │ │
│ │ FARMACIA ········································ S/ 2,660.00           │ │
│ │ COBROS POR TRATAMIENTOS ························· S/ 1,200.00           │ │
│ │ ═══ TOTAL FINAL ══════════════════════════════════ S/ 6,460.00          │ │
│ │  Todo lo cobrado del 1 al 11 de septiembre, con IGV.                    │ │
│ │ ✓ Cuadre con Financiero: Cobrado total S/ 5,260.00 + Cobros por         │ │
│ │   tratamientos S/ 1,200.00 = S/ 6,460.00                                │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```
(Los montos son los reales del 7-sep en la clínica de Patricia según `supabase/migrations/250_…sql:3-7` y `251_…sql:3-5`: citas S/ 2,050 · adelantos S/ 550 · farmacia S/ 2,660 · FIV S/ 1,200.)

- **Todas las secciones marcadas.** La motivación literal del founder es "que tenga todo sintetizado": el estado completo es el seguro (el TOTAL FINAL cuadra con Financiero, §4) y desmarcar cuesta un clic. Empezar con nada marcado obliga a 4 clics antes de ver un número y deja un total en cero que parece error.
- **Rango heredado, no forzado a "Hoy".** El header arranca en "Este mes" (`page.tsx:97-98`). Forzar "Hoy" al entrar a esta tab rompería la regla "un rango para todas las tabs" y sorprendería al volver a Financiero. "Hoy" está a un clic en el header (`page.tsx:78` preset `today`). La línea "Reporte de cobros · Del 1 al 11 de septiembre de 2026" en la barra sticky es la confirmación visual de **qué** va a imprimir; cuando el rango es un solo día y coincide con el hoy de la org, dice "Hoy, jueves 11 de septiembre de 2026".
- **Vista previa = papel.** Lo que ve en pantalla es literalmente el documento (mismo orden, mismos títulos, mismos subtotales). Nada de "lo verás distinto en el PDF".

### 2.2 Ajustar el rango

- Reutiliza los dos inputs y los presets del header (`page.tsx:226-253`). No se añade un segundo selector dentro de la tab: dos selectores del mismo dato en la misma pantalla es la receta para imprimir el periodo equivocado.
- **"Hoy" civil de la org.** `applyPreset` (`page.tsx:170-183`) y los valores iniciales (`:97-98`) usan `new Date()` + `format` de date-fns, es decir, la hora local del navegador. CLAUDE.md exige `useOrgToday()` (`hooks/use-org-today.ts:18-25`, `lib/org-time.ts:64-73`). Para la doctora en Lima con su laptop no cambia nada; para un admin que viaja o para una org fuera de Perú, "Hoy" imprimiría el día equivocado. Corregirlo es parte de esta feature (afecta a todas las tabs, es una mejora, no una regresión): `today()` para el preset Hoy y `zonedNow(timezone)` para `startOfMonth`.
- Los inputs nativos `type="date"` muestran el formato del navegador, no dd/mm/aaaa (`components/ui/date-picker.tsx:3-8` explica el problema y ya existe `<DatePicker>`; Almacén lo usa en `almacen/profit-tab.tsx:220-224`). No es bloqueante para V1, pero es el siguiente cambio natural del header.
- Validación mínima: `dateFrom > dateTo` → el reporte muestra el estado vacío "El rango no es válido" en lugar de un total en cero (Farmacia ya cruza `min`/`max` entre los dos inputs: `farmacia/day-sales-tab.tsx:309-323`).

### 2.3 Los checks de secciones

- **Un `Checkbox` por sección** (`components/ui/checkbox.tsx`, input nativo con área táctil de 44 px en móvil, `:30-38`) con su etiqueta, en una fila que envuelve (`flex flex-wrap gap-x-5 gap-y-2`). Cuatro como máximo, así que no hace falta agruparlos en columnas; el orden de los checks es el orden de impresión.
- **Lo que no aplica no se pinta.** Un checkbox "Farmacia" deshabilitado en una clínica sin farmacia genera la pregunta "¿por qué no puedo marcarlo?", parece un bug o un upsell, y en el papel sería ruido. Regla de visibilidad por sección: **módulo activo O hay dinero en esa cubeta dentro del rango.** La segunda condición es la que protege el cuadre: una org que desactiva Almacén en octubre pero tuvo ventas en septiembre seguiría viendo (y sumando) su farmacia de septiembre. Es el mismo criterio que Financiero ya usa para la tarjeta de tratamientos: `showTreatments = fertilityActive || treatmentPaid > 0` (`financial-report.tsx:184-185`) y para las líneas del desglose, que solo se muestran con monto > 0 (`:179` `.filter((r) => r.value > 0)`).
  - Servicios y Adelantos: siempre (core).
  - Farmacia: `hasAddon("almacen")` — Farmacia viaja con el addon `almacen` (`sidebar.tsx:155-161`) — o `pharmacy > 0`.
  - Cobros por tratamientos: `useFertilityAddon().active` (`hooks/use-fertility-addon.ts`) o `treatments > 0`.
- Mientras `useOrgAddons()` carga (`hooks/use-org-addons.ts:50`, cache de 5 min compartida), los checks core se pintan de inmediato y los gateados aparecen al resolver; el flicker es de una fracción de segundo y solo la primera vez.
- Desmarcar todo está permitido: el documento muestra "Marca al menos una sección para armar el reporte" y el botón de PDF se deshabilita. Sin magia de "el último no se puede desmarcar".
- Los checks **no viajan al servidor al cambiar**: la RPC devuelve las cuatro secciones siempre y la pantalla oculta/suma en cliente. Cambiar un check es instantáneo, sin spinner.

### 2.4 Generar: en vivo, sin botón

En vivo, igual que las otras cinco tabs, por coste y por claridad:

- **Coste:** una llamada a la RPC `get_custom_report(p_date_from, p_date_to)` (nombre de trabajo del experto de datos) por cambio de rango, ya debounced a 300 ms por el header (`page.tsx:104-108`) y cacheada por React Query por rango (`page.tsx:125` comenta que volver a un rango visto es instantáneo). Es el mismo coste que Financiero paga hoy con `get_reports_overview` (`page.tsx:136-139`); las mismas tablas, sin joins nuevos. Los checkboxes no cuestan nada.
- **Claridad:** un botón "Generar" introduce estado obsoleto: cambia el rango, olvida pulsar, imprime los números de ayer. Con generación en vivo la barra sticky siempre dice el periodo del documento que tiene delante. El único botón con "coste" real es el de PDF (§2.5), y por eso ese sí es un botón.

### 2.5 Imprimir / guardar PDF: un botón, el motor de Chromium

Hay tres formas de imprimir hoy en la app:

| Patrón | Dónde | Qué da |
|---|---|---|
| `window.print()` + `print:hidden` en el chrome | Almacén `movement-list.tsx:380-400` (con cabecera `hidden print:block`), Caja `history-tab.tsx:126-128`, `close-tab.tsx:292-296` | Papel de la vista actual, sin membrete, nombre de archivo = título de la pestaña, 1 clic + diálogo. |
| `window.print()` + portal + técnica `visibility` | Farmacia `day-sales-tab.tsx:645-660, 709-730`, ticket `sale-ticket.tsx:57-76` | Un documento aparte diseñado para papel; la página entera lleva `print:hidden` (`farmacia/page.tsx:607`). |
| **HTML → Chromium → PDF A4 con membrete** | `lib/pdf/html/chromium.ts:23-55`, `render.ts:110-122`, partials `sheetHead.hbs` (logo, razón social, RUC, dirección), `styles.hbs:216-226` (`table.grid`, `td.amt`, `tfoot`), `:260-269` (`.total`); rutas `/api/pdf/*` abiertas con `window.open(url, "_blank", "noopener")` (`scheduler/prescription-print.tsx:22-27`, `treatment-plans-panel.tsx:636-642`) | Un PDF real, con la identidad de la clínica (`lib/pdf/html/org.ts:63-104`, color de `print_color_primary`), en pestaña nueva con vista previa + botón de imprimir + botón de descargar. |

**Recomendación: un solo botón primario "Imprimir o guardar PDF" que abre `/api/pdf/custom-report?from=…&to=…&sections=services,advances,pharmacy,treatments` en pestaña nueva**, exactamente como la receta y la orden de examen que la doctora ya imprime. Por qué, desde su experiencia:

1. **Es el gesto que ya conoce.** Receta, orden de examen, consentimiento y plan de tratamiento se imprimen así (`prescription-print.tsx:23-26`: "el navegador lo abre en una pestaña nueva con preview + opción de descargar/imprimir"). Un reporte que se imprime distinto a la receta es un patrón más que aprender.
2. **Sale con membrete.** La contadora recibe un papel con logo, razón social y RUC (`sheetHead.hbs:20-32`), no una captura de pantalla de una web. Esto es lo que diferencia "un papel para la reunión" de "un pantallazo".
3. **Desde el celular es la única vía razonable.** En iOS Safari, `window.print()` obliga a: compartir → Imprimir → pellizcar la vista previa → compartir de nuevo para obtener un PDF; casi nadie conoce el truco. Un PDF abierto en pestaña nueva tiene el botón de compartir a un toque: WhatsApp a la contadora. En Android Chrome pasa lo mismo (Guardar como PDF está a tres toques desde el diálogo de impresión; el PDF abierto se comparte en uno).
4. **Un botón, un comportamiento.** El desplegable "Exportar ▾ PDF / Excel" (`reports/export-menu.tsx`) existe pero **está huérfano**: nadie lo importa (`page.tsx` no lo monta y ningún otro archivo lo referencia), y su PDF es una captura `html2canvas` (`lib/report-export.ts:19-39`) sin membrete. No reutilizar. El "Imprimir / Guardar PDF" del panel de IA (`ai-summary-panel.tsx:185-197`, ventana nueva + `document.write` + `window.print()` automático) tampoco: el print automático en móvil es un susto.

Detalles del botón:
- Texto: **"Imprimir o guardar PDF"** con icono `Printer`. No "Exportar" (la doctora no exporta, imprime) ni "Descargar" (en el celular no descarga, comparte).
- Al pulsar: `window.open` síncrono dentro del handler del clic (si se hace `fetch` → blob → `open`, iOS lo bloquea como pop-up). Toast Sonner informativo: "Abriendo el PDF en una pestaña nueva…" (`toast` de `sonner` como en `ai-summary-panel.tsx:6`). Si el navegador bloquea la pestaña, toast de error con enlace "Abrir el PDF" (`toast.error("No se pudo abrir el PDF", { action })`).
- Chromium en Vercel arranca en frío en varios segundos (`chromium.ts:11-13, 28-31`). La pestaña nueva muestra el spinner del navegador; es aceptable porque la doctora ya lo vive con la receta. La ruta responde `Content-Disposition: inline; filename="reporte-cobros_2026-09-01_2026-09-11.pdf"` para que "guardar" produzca un nombre legible (el export viejo ya usaba ese esquema: `financial-report.tsx:215`).
- Deshabilitado (`disabled:opacity-60`, como `export-menu.tsx:49`) mientras carga, con error, con rango vacío o sin secciones marcadas.
- La ruta API valida `from/to` (regex `YYYY-MM-DD` como `lib/validations/api.ts:96-97`), la lista de secciones contra un enum, **y el rol owner/admin de la org** (`is_org_admin`), porque el `adminOnly` del sidebar solo oculta el enlace.
- **Mismos datos, misma fórmula:** la ruta PDF llama a la misma RPC con el mismo rango y recibe la misma lista de secciones; los subtotales y el TOTAL FINAL se calculan en un único helper TS compartido por pantalla y PDF (patrón `lib/patient-debt.ts` = espejo de `get_patient_summary`, `lib/patient-debt.ts:1-9`). Así el papel nunca contradice a la pantalla.
- **Red de seguridad sin botón:** la vista previa en pantalla se deja limpia para Ctrl+P (barra sticky `print:hidden`, header de Reportes `print:hidden`, `print:h-auto` en los scrollers). Si Chromium falla, la doctora igual tiene papel.

### 2.6 El papel (PDF)

Estructura con los partials existentes, en este orden:

1. `{{> head}}` + `{{> sheetHead}}`: membrete de la org.
2. `{{> titleRow}}`: eyebrow "REPORTE" · h1 **"Reporte de cobros"** · a la derecha "Del 01/09/2026 al 11/09/2026" y "Generado el 11/09/2026 18:32 · Patricia Q." (fecha/hora en la zona de la org: `lib/org-time.ts:80-101` `zonedNow`; nunca `new Date().toISOString()`).
3. Una `.section` por sección marcada: `h2` con el título a la izquierda y el **subtotal a la derecha**; debajo, en 8 pt, la línea "qué incluye" (§3); luego `table.grid` con `thead`, filas y `tfoot` "Subtotal …". `break-inside: avoid` por sección (`styles.hbs:317`).
4. Bloque `.total` (`styles.hbs:260-269`, fondo color de marca): "TOTAL FINAL" + subtítulo + cifra grande.
5. Notas al pie en 7.5 pt: la línea de cuadre (§4) y, si hay secciones desmarcadas, "Este reporte no incluye: Farmacia." **sin montos** (la doctora puede haber excluido Farmacia justamente porque esa contadora no la lleva).
6. `{{> pageFooter}}` con dirección/teléfonos de la org y "Yenda · Reporte de cobros · pág. n".

Formato de dinero: helper `money` del motor (`render.ts:29-36`, "S/ 1,234.56"), tabular-nums en `td.amt`. Todo **bruto, con IGV**, como se cobra (regla de oro de CLAUDE.md); la palabra "ganancia" no aparece en ningún sitio del documento.

---

## 3. Nombres que entiende una doctora

| # | Etiqueta en pantalla y papel | Qué incluye (línea bajo el título, tal cual) | Cubeta del RPC (mig 250/251) | Columnas | Se muestra si |
|---|---|---|---|---|---|
| 1 | **Servicios** | "Lo cobrado en estas fechas por las citas de estas fechas, agrupado por servicio. Es el mismo número que **Facturado por citas** en Financiero." | `collected_breakdown.period_appointments` (= Σ `doctors[].collected`, `types/reports.ts:17-23`) | Descripción (servicio de la cita, `COALESCE(s.name,'Sin servicio')`, `251_…sql:40`) · **Citas** · Total | siempre |
| 2 | **Adelantos y pagos a cuenta** | "Dinero recibido en estas fechas que no corresponde a una cita de estas fechas: adelantos de citas futuras, pagos de citas anteriores, pagos a planes de tratamiento y abonos registrados desde la ficha del paciente sin cita." | `other_appointments` + `plans` + `other` | Descripción (4 filas fijas: "Adelantos de citas futuras" · "Pagos de citas anteriores" · "Planes de tratamiento" · "Sin cita asociada"; solo las que tengan monto) · **Pagos** · Total | siempre |
| 3 | **Farmacia** | "Ventas de mostrador cobradas en estas fechas, agrupadas por producto, con IGV incluido. Es la línea **Farmacia** del desglose de Cobrado total." | `pharmacy` (`source='pos'`) | Descripción (`pharmacy_sale_items.description`, snapshot del nombre, mig 216:198-200) · **Unid.** · **Precio unit.** · Total | addon `almacen` activo o monto > 0 |
| 4 | **Cobros por tratamientos** | "Cobros de tratamientos de fertilidad (FIV, IIU…) recibidos en estas fechas, agrupados por concepto. Van aparte de las citas: en Financiero tienen su propia tarjeta." | `treatment_payments_amount` (`types/reports.ts:64`) | Descripción (`treatment_payment_concepts.label`: "Medicación", "Honorarios — aspiración", "Laboratorio / embriología"…, seed `242_…sql:167-178`; "Sin concepto" si nulo) · **Pagos** · Total | Pack Fertilidad activo o monto > 0 |
| Σ | **TOTAL FINAL** | Subtítulo dinámico: "Todo lo cobrado del 1 al 11 de septiembre, con IGV." / con secciones fuera: "Solo las secciones incluidas (sin Farmacia)." | suma de las secciones marcadas | — | siempre |

Notas de nomenclatura:

- **"Abonos y servicios futuros" → "Adelantos y pagos a cuenta".** Alternativas consideradas: (a) "Abonos y adelantos" — "abono" en Perú también es lo que se deposita en el banco; ambiguo para la contadora. (b) "Pagos sin cita en estas fechas" — exacto pero en negativo: describe lo que no es. (c) **"Adelantos y pagos a cuenta"** — es el lenguaje que la clínica ya usa en la app: el placeholder del formulario de pago dice "Adelanto, pago a cuenta, nro. de operación…" (`patients/patient-drawer.tsx:1780`), el concepto sembrado "A cuenta (sin detalle)" (`242_…sql:177`) y el desglose de Financiero "Adelantos y otras fechas" (`language-provider.tsx:493`). Elegida (c). "Servicios futuros" se cae porque la cubeta también contiene pagos **atrasados** de citas anteriores (`250_…sql:23` "adelantos y pagos atrasados"): decir "futuros" en el título y sumar pasados sería mentir en el papel.
- **"Pagos por tratamientos" → "Cobros por tratamientos"**: es literalmente la tarjeta de Financiero (`financial-report.tsx:278`) y el término del mapa del dinero (§4 y §7). La doctora ve la misma palabra en las dos tabs.
- **"Cantidad" no significa lo mismo en cada sección**: citas en Servicios, pagos en Adelantos y Tratamientos, unidades en Farmacia. La cabecera de columna lo dice ("Citas", "Pagos", "Unid.") en vez de un "Cantidad" genérico que la contadora tendría que interpretar cuatro veces. Cantidad en Servicios = **citas con cobro en el rango**, no número de pagos: una consulta pagada en dos partes el mismo día cuenta 1 (a validar con el experto de datos).
- **"Precio" solo en Farmacia.** El founder pidió Descripción · Cantidad · Precio · Total en todas. Recomiendo no hacerlo: en Servicios, "4 consultas × S/ 250 = S/ 1,000" es falso en cuanto hay un descuento, un precio pactado o un pago parcial (la regla 2 del mapa del dinero: precio real = pactado − descuento); en Adelantos y Tratamientos no existe un precio unitario. Una columna que cuadra una de cada cuatro veces enseña a la contadora a desconfiar de toda la hoja. En Farmacia sí es cierta (`unit_price`, `line_discount`, `line_total` en mig 216), con nota "Total = unidades × precio unit. − descuentos". Si el founder insiste (pregunta 1), la columna en Servicios debe llamarse **"Precio de lista"** y llevar nota al pie explicando por qué no multiplica.
- **TOTAL FINAL** se mantiene (es el término del founder y de la doctora) y el subtítulo carga el significado. "Total cobrado" a secas sería mentira cuando hay secciones desmarcadas.
- Título del documento: **"Reporte de cobros"** (no "Reporte personalizado": en el papel no hay nada personalizado, hay cobros). "Personalizado" es el nombre de la tab; "Reporte de cobros" es el nombre del papel.

---

## 4. Cómo evitar que contradiga a Financiero

La doctora va a poner las dos tabs lado a lado y comparar el TOTAL FINAL con **Cobrado total** del mismo rango. Lo que Financiero muestra hoy (`financial-report.tsx:153-185`, `docs/mapa-del-dinero.md:50-64`):

- **Cobrado total** = `payments_amount` = citas de estas fechas + adelantos y otras fechas + planes + farmacia + sin cita. **Excluye tratamientos.**
- **Cobros por tratamientos** = tarjeta aparte.

Por tanto la identidad que el experto de datos garantiza y que la UI debe **decir**:

> Con las cuatro secciones marcadas: **TOTAL FINAL = Cobrado total + Cobros por tratamientos.**
> Con Tratamientos desmarcado: **TOTAL FINAL = Cobrado total.**

Diseño de la línea "Cuadre con Financiero", justo debajo del bloque TOTAL FINAL, en pantalla siempre y en el papel como nota al pie:

| Estado de los checks | Texto (pantalla) | Papel |
|---|---|---|
| Todo marcado | ✓ **Coincide con Financiero:** Cobrado total S/ 5,260.00 + Cobros por tratamientos S/ 1,200.00 = S/ 6,460.00 | "Este total coincide con *Cobrado total* + *Cobros por tratamientos* del reporte Financiero para el mismo periodo." |
| Solo Tratamientos desmarcado | ✓ **Coincide con Cobrado total de Financiero:** S/ 5,260.00 | "Este total coincide con *Cobrado total* del reporte Financiero para el mismo periodo. No incluye tratamientos." |
| Otra sección desmarcada | ℹ No incluye: Farmacia (S/ 2,660.00). Con todas las secciones marcadas coincidiría con Financiero. | "Este reporte no incluye: Farmacia." (sin monto) |
| Los números NO cuadran (bug) | ⚠ **No cuadra con Financiero por S/ 12.00.** Avísanos desde Soporte. | Sin nota de cuadre. |

Reglas:
- Los montos de la línea de cuadre salen **del mismo payload** de la RPC (que devuelve también `payments_amount` y `treatment_payments_amount`, o los mismos buckets), no de una segunda llamada a `get_reports_overview`. Si vinieran de dos RPC distintas podrían discrepar por milisegundos de caché y la UI acusaría un bug que no existe.
- La comparación con tolerancia cero (son sumas de `numeric(10,2)`): si difieren, se muestra el aviso. Es el principio del mapa del dinero (`docs/mapa-del-dinero.md:149-151`): que dos pantallas midan cosas distintas es diseño; que se contradigan es un error, y el error se dice.
- Vocabulario congelado: en esta tab se escriben "Cobrado total", "Facturado por citas" y "Cobros por tratamientos" exactamente como las claves `reports.total_collected`, `reports.total_billed` (`language-provider.tsx:448-449`) y la tarjeta de `financial-report.tsx:278`. Ningún sinónimo.
- **No se imprime "Pendiente por cobrar"** en este papel. Es deuda devengada, no caja; mezclarlas en la misma hoja es exactamente lo que produjo el "Pendiente cobro S/ −4 510" del 7-sep (`250_…sql:3-7`). Si la contadora lo pide, lo lee en Financiero.
- Subtotal de Servicios = Facturado por citas; se dice en la línea "qué incluye" para que la doctora tenga **dos** puntos de cuadre (el subtotal y el total), no uno.

---

## 5. Estados

| Estado | Pantalla | Botón PDF |
|---|---|---|
| **Cargando** (primer fetch del rango) | Barra sticky visible de inmediato con los checks core; en la vista previa, por cada sección marcada el título y 3 filas `animate-pulse bg-muted` (mismo esqueleto que `reports/loading.tsx:8-16`). Sin spinner centrado: el esqueleto ya dice "aquí van cuatro tablas". Si se prefiere consistencia estricta con las otras tabs, el spinner de `page.tsx:296-299` es aceptable, pero el esqueleto enseña la forma del documento antes de que llegue. | deshabilitado |
| **Vacío** (rango sin ningún cobro) | Una sola tarjeta con borde discontinuo (patrón `farmacia/day-sales-tab.tsx:392-401`): si el rango es el hoy de la org → "Todavía no hay cobros hoy."; si no → "Sin cobros del 1 al 11 de septiembre." + "Prueba con *Este mes* o amplía el rango." Sin tablas vacías, sin TOTAL FINAL S/ 0.00 (un total en cero impreso parece un cierre, no un vacío). | deshabilitado |
| **Parcial** (una sección sin cobros, otras con) | La sección marcada se pinta con su título, la línea "qué incluye" y **una sola fila atenuada "Sin cobros en estas fechas · S/ 0.00"**. No se omite: si la contadora ve "Farmacia" en los checks pero no en el papel, pregunta si se olvidó. La línea de cuadre sigue funcionando (0 suma 0). | activo |
| **Error** (RPC falla) | Caja rosa como `fertility-report.tsx:153-158` con el mensaje "No se pudo cargar el reporte" y un botón **"Intentar de nuevo"** (texto de `language-provider.tsx:518`) que refetchea. La barra sticky sigue visible para cambiar de rango. | deshabilitado |
| **Error al abrir el PDF** (pop-up bloqueado o 5xx de Chromium) | `toast.error("No se pudo generar el PDF", { description: "Intenta de nuevo. Si sigue fallando, usa Imprimir del navegador (Ctrl+P)." })`. | activo |
| **Org sin módulos** (solo core) | Dos checks: Servicios y Adelantos y pagos a cuenta. Nada menciona farmacia ni tratamientos. Cuadre: "Coincide con Cobrado total de Financiero". Con Pack Fertilidad pero sin Almacén: tres checks. | según arriba |
| **Sin secciones marcadas** | Vista previa sustituida por "Marca al menos una sección para armar el reporte." | deshabilitado |
| **Rango inválido** (`from > to`) | "El rango no es válido: la fecha inicial es posterior a la final." | deshabilitado |
| **Móvil (≤ 767 px, `hooks/use-is-mobile.ts:26`)** | La barra sticky queda arriba (sticky dentro del scroller de `page.tsx:292`) con los checks envueltos en dos líneas y el botón a ancho completo debajo (`w-full`), para que después de leer el total al final de la página no tenga que buscar el botón. Tablas de 3-4 columnas entran a 390 px con Descripción `min-w-0 break-words` (patrón `financial-report.tsx:224`); Farmacia con 4 columnas va en `overflow-x-auto` (`financial-report.tsx:336`). **Imprimir desde el celular = el PDF en pestaña nueva** (§2.5.3): es el único camino con un botón de compartir a un toque. No se ofrece `window.print()` en móvil. | activo |

Accesibilidad mínima: cada check con `<label>` real (ya lo da `Checkbox`), `aria-live="polite"` en el TOTAL FINAL para que un lector de pantalla anuncie el cambio al marcar/desmarcar, y `aria-pressed` no aplica (son checks, no toggles).

---

## 6. Presets guardados ("mi reporte")

**No en V1, y tampoco persistir la última selección.**

- Con cuatro checks y el estado completo por defecto, "mi reporte" está a uno o dos clics. Persistir una selección introduce el riesgo contrario: la doctora imprime en octubre con Farmacia desmarcada desde septiembre y comparte un total incompleto. El estado seguro (todo marcado, cuadra con Financiero) debe ser el estado inicial **siempre**.
- Un preset guardado obliga a decidir dónde vive (localStorage por navegador vs. tabla por org), de quién es (owner vs. admin), cómo se nombra y cómo se borra: cuatro decisiones y una pantalla de gestión para ahorrar un clic.
- Si tras un mes de uso la doctora reporta que **siempre** desmarca lo mismo, la solución barata no es un preset sino una preferencia por org en Ajustes ("Secciones por defecto del reporte de cobros"), sin nombres ni listas.

---

## 7. Lo que NO haría en V1 (y por qué)

| Idea | Por qué no ahora |
|---|---|
| Filtro por doctor | Cambia el significado del TOTAL FINAL y rompe el cuadre con Cobrado total; Farmacia y Adelantos no tienen doctor. Financiero ya trae la tabla por doctor (`financial-report.tsx:332-376`). |
| Comparar con el periodo anterior | Es análisis, no síntesis. El Dashboard ya muestra "vs mes anterior" (`admin-dashboard.tsx:177-181`). En un papel para la contadora, una segunda columna de variación duplica el ancho y no le sirve para cuadrar. |
| Envío por email programado | Cron + destinatarios + PDF generado sin sesión + gestión de bajas. La doctora reenvía el PDF por WhatsApp en dos toques. Revisar tras un mes si pide "que le llegue solo". |
| Excel / CSV | La contadora puede pedirlo. El motor xlsx existe pero está huérfano (`lib/report-export.ts`). V1.5: botón secundario "Excel" con las mismas filas, solo si lo pide. |
| Desglose por medio de pago | Responde "cómo entró", no "por qué entró". Caja ya lo tiene (`docs/mapa-del-dinero.md:113-120`). Mezclar los dos ejes en una hoja la vuelve una matriz. |
| Detalle por paciente | La hoja pasaría de una página a diez. La ficha del paciente y Caja tienen el detalle. |
| Pendiente por cobrar como línea memo | No es caja (§4). |
| Base imponible / IGV por sección | Útil para la contadora en Farmacia (mig 216 ya guarda `line_subtotal`/`line_igv`), pero los servicios tienen `igv_affectation` por servicio y los adelantos no tienen afectación clara hasta que se aplican. Riesgo alto de imprimir un IGV incorrecto; V2 con el experto de datos. |
| Selector de rango propio en la tab | Duplicaría el del header (§2.2). |
| Moneda | Solo PEN, como todo Reportes hoy. |

---

## 8. Preguntas para el founder (con recomendación)

1. **¿Columna "Precio" en Servicios, Adelantos y Tratamientos?** Pediste Descripción · Cantidad · Precio · Total en todas. Recomiendo **solo en Farmacia**, donde unidades × precio − descuento = total es verdad. En Servicios rompe con descuentos, precios pactados y pagos parciales; en las otras dos no existe. Si la quieres igual, se llama "Precio de lista" y lleva nota al pie.
2. **¿Al entrar a la tab, forzar "Hoy" o heredar el rango del header?** Recomiendo **heredar** (el header arranca en "Este mes"; "Hoy" está a un clic) y mostrar el periodo en grande en la barra sticky y en el título del papel. Forzar "Hoy" en una sola tab rompe la regla "un rango para todas las tabs".
3. **Las ventas de farmacia pueden incluir servicios vendidos en mostrador** (mig 216: cada línea es producto **o** servicio). ¿Van dentro de Farmacia? Recomiendo **sí**, con su nombre y el sufijo "(mostrador)", porque son `source='pos'` y así Farmacia = la línea Farmacia de Financiero exactamente. Sacarlos a Servicios rompería el cuadre y mezclaría plata de farmacia con clínica (regla dura de CLAUDE.md).
4. **Planes de tratamiento (cubeta `plans`) no aparecen en tu lista de secciones.** Recomiendo incluirlos como fila "Planes de tratamiento" dentro de **Adelantos y pagos a cuenta** (son pagos por sesiones futuras: encajan con tu idea de "servicios futuros"). La alternativa —omitirlos— deja dinero fuera del TOTAL FINAL y el cuadre falla.
5. **¿"Pagos directos a terceros" de tratamientos (lab, banco de óvulos) como línea informativa?** Recomiendo **no**: no son cobro de la clínica (`lib/treatments/money.ts:8-10`, `docs/mapa-del-dinero.md:94-95`) y en un papel de cobros confunden a la contadora. Si lo quiere, es otro papel ("Estado del tratamiento"), no este.
6. **¿Quién imprime?** Hoy Reportes es solo owner/admin (`sidebar.tsx:181`). Recomiendo **mantenerlo así en V1** y que la API lo verifique. Si la recepcionista debe imprimir el "Hoy" al cierre, eso lo cubre mejor el cierre de Caja (`caja/close-tab.tsx:292-296`) que ya imprime; abrirle Reportes entero para un papel es demasiado permiso.

---

## Apéndice — hallazgos de código que condicionan la implementación

- `reports/export-menu.tsx` y `lib/report-export.ts` (PDF por captura + Excel) no se usan en ninguna página: `ExportMenu` solo aparece en su propio archivo. No reutilizar; el `getExportConfig` de cada reporte (`financial-report.tsx:188-217`) es código muerto desde el punto de vista del usuario.
- `lib/validations/api.ts:95` — enum cerrado de `reportType`; ocultar el botón/panel IA en la tab nueva (`page.tsx:255, 294`).
- `page.tsx:97-98, 170-183` — presets con `new Date()`; migrar a `useOrgToday()` / `zonedNow` (`lib/org-time.ts`).
- `page.tsx:212, 214, 292` — falta `print:*`; sin ello Ctrl+P recorta a una pantalla (el layout lo explica en `layout.tsx:110-112`).
- `farmacia/day-sales-tab.tsx:645-660` — si en algún momento se quisiera imprimir desde la vista (no recomendado), el patrón correcto es el portal + `visibility`, no `display:none` (`sale-ticket.tsx:18-21` explica por qué).
- Motor PDF listo para tablas de dinero: `styles.hbs:216-226` (`table.grid`, `td.amt`, `tfoot`), `:260-269` (`.total`), helper `money` (`render.ts:29-36`), membrete real de la org (`org.ts:63-104`). No hace falta CSS nuevo salvo el `h2` con subtotal a la derecha.
- Conceptos de tratamiento son editables por org en `/admin/treatment-concepts` (`sidebar.tsx:209-214`): la sección "Cobros por tratamientos" debe agrupar por `label` vivo del concepto, y "Sin concepto" para pagos antiguos sin `treatment_concept_id`.
- `pharmacy_sale_items.description` es snapshot del nombre (mig 216:198-200): la fila de Farmacia agrupa por `description` (o por `product_id` mostrando la `description` más reciente), nunca por el nombre actual del producto, para que el papel de septiembre no cambie en octubre.
