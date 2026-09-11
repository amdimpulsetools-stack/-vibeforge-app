# Reporte personalizado — Diseño de UI (pantalla + hoja A4)

Rol: experto en UI. Solo lectura del repo. Todas las citas son `archivo:línea` del
estado actual de `/home/user/-vibeforge-app`. Coordinado con el borrador del RPC
`get_custom_report` (`scratchpad/reporte-personalizado/get_custom_report.sql`) del
experto en datos: las props y la plantilla consumen ESE payload tal cual.

---

## 0. Lo que condiciona el diseño (hallazgos con cita)

### 0.1 La familia visual de Reportes
| Pieza | Clases / patrón | Cita |
|---|---|---|
| Contenedor de la página | full-bleed `-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)]` | `app/(dashboard)/reports/page.tsx:212` |
| Header (título + rango + presets + IA) | `border-b border-border bg-background px-4 py-3 md:px-6 md:py-4`; h1 `text-xl font-bold`; subtítulo `text-sm text-muted-foreground` | `page.tsx:214-219` |
| Inputs de fecha | `<input type="date">` nativos, `rounded-lg border border-input bg-background px-2.5 py-2 text-xs … md:py-1.5`; en móvil `min-w-0 flex-1` | `page.tsx:228-240` |
| Presets Hoy/7d/30d/90d/Este mes | `rounded-md bg-muted px-2.5 py-2 text-[11px] font-medium … md:px-2 md:py-1 md:text-[10px]` | `page.tsx:244-252` |
| Fila de tabs (scroll-x sangrado) | `mt-4 flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 md:-mx-6 md:px-6`; tab `rounded-lg px-4 py-2 text-sm font-medium`, activo `bg-primary text-primary-foreground` | `page.tsx:264-282` |
| Cuerpo scrolleable | `flex-1 overflow-y-auto p-4 max-md:overflow-x-hidden md:p-6` | `page.tsx:292` |
| Carga por pestaña | `next/dynamic` + `REPORT_LOADERS` precarga en hover/focus; fallback = spinner `Loader2 h-6 w-6 animate-spin` | `page.tsx:43-76, 269-270` |
| Rango debounced 300 ms que reciben los reportes | `debounced.dateFrom/dateTo` | `page.tsx:104-108, 300-305` |
| Tarjeta KPI | `rounded-xl border border-border bg-card p-4`; valor `mt-2 text-2xl font-bold`; verde de "cobrado" = `text-success-600` (escala fija, no temizable) | `financial-report.tsx:225-231`, `globals.css:160-191` |
| Eyebrow / etiqueta pequeña | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | `financial-report.tsx:256` |
| Popover del desglose "De dónde viene" | `absolute … z-50 rounded-lg border border-border bg-popover p-3 shadow-lg`; `dl` `text-[11px]`, `dd` `shrink-0 tabular-nums font-medium` | `financial-report.tsx:255-267` |
| Tarjeta-tabla | `rounded-xl border border-border bg-card` + cabecera `border-b border-border px-5 py-3` + `h3 text-sm font-semibold` + `overflow-x-auto` | `financial-report.tsx:332-336` |
| Tabla | `table w-full text-sm`; `thead tr border-b border-border bg-muted/50`; `th px-4 py-2.5 text-xs font-semibold text-muted-foreground` (+`text-right` en dinero); `tbody tr border-b border-border/50 hover:bg-muted/30`; `td px-4 py-2.5`; fila TOTAL `bg-muted/50 font-bold` | `financial-report.tsx:337-371` |
| Vacío | `py-10 text-center text-sm text-muted-foreground` con `t("common.no_results")` | `financial-report.tsx:374` |
| Tabla ancha en móvil | `-mx-4 overflow-x-auto … sm:mx-0 sm:rounded-2xl sm:border` + `table … min-w-[560px]` | `almacen/profit-tab.tsx:334-335` |
| Cifras | `text-right tabular-nums`; segunda línea `block text-[10px] text-muted-foreground` ("con IGV: …") | `profit-tab.tsx:360-369` |
| Empty state rico | `rounded-2xl border border-border/60 bg-card p-10 text-center` + icono + título `text-sm font-semibold` + `text-xs text-muted-foreground` | `profit-tab.tsx:323-332` |
| Botón toolbar secundario | `inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:text-foreground` + `<Printer className="h-3.5 w-3.5"/>` | `farmacia/day-sales-tab.tsx:345-351` |
| Cifra protagonista animada | `NumberPopIn` — "NUNCA en tablas", solo KPIs/totales | `components/ui/number-pop-in.tsx:11-27` |
| Top servicios (ya existe una tabla por servicio) | Servicio · Citas (center) · Facturado (right) | `operational-report.tsx:281-293` |
| Tabla de secciones que "no aplican" | `showTreatments = fertilityActive \|\| treatmentPaid > 0` — mismo criterio que `sections_available` del RPC | `financial-report.tsx:184-185`, `get_custom_report.sql:329-334` |

Primitivos disponibles en `components/ui/` (listado real): `badge`, `button`, `checkbox`, `date-picker`, `dialog`, `dropdown-menu`, `input`, `popover`, `separator`, `sheet`, `switch`, `tabs`, `number-pop-in`, `scroll-area`, `calendar`, `accordion`, `alert-dialog`. **No existen** `table.tsx`, `card.tsx`, `select.tsx`, `label.tsx`, `tooltip.tsx`, `skeleton.tsx`: las tablas y tarjetas de la app son `<table>`/`<div>` con las clases de arriba. No se inventa un primitivo `Table`: se replica exactamente la receta de `financial-report.tsx:337-371`.

- `Checkbox` (`components/ui/checkbox.tsx:40-55`): input nativo transparente con área táctil ampliada en móvil (`-inset-y-3.5 -inset-x-2.5` → 44 × 36 px) y foco `peer-focus-visible:ring-2 ring-ring ring-offset-2`.
- `Button` (`components/ui/button.tsx:7-27`): `size="icon"` = `h-11 w-11 md:h-9 md:w-9`; `default` = `h-9`; foco `focus-visible:ring-1 ring-ring`.
- `Badge` (`badge.tsx:6-23`): `rounded-md px-2.5 py-0.5 text-xs font-semibold`; variantes `secondary`/`outline`.
- `DatePicker` (`date-picker.tsx`): dd/mm/aaaa fijo; Reportes todavía usa `<input type="date">` (`page.tsx:228`). Fuera del alcance de esta feature (el rango vive en el header de la página y se hereda).

### 0.2 Cómo se imprime hoy — evaluación de las dos vías

**(a) Motor HTML → Chromium con Handlebars + membrete**
- `lib/pdf/html/chromium.ts:23-55` `htmlToPdfBuffer(html)` → A4, `printBackground: true`, `preferCSSPageSize: true`, margen 0 (el margen lo pone `@page` de cada plantilla). Comentario `:28-31`: arranque en frío de `@sparticuz/chromium` en Vercel (segundos).
- `lib/pdf/html/render.ts:68-98`: entorno Handlebars aislado, helpers `eq`, `inc`, `money` ("S/ 1,234.50" es-PE), `longDate`, `shortDate`, `nl2br`, `join`; partials auto-registrados desde `lib/pdf/html/partials/`.
- Partials: `head.hbs:14` fija `--brand` inline con `org.brand_color`; `styles.hbs` es la hoja base: tokens `:20-33` (`--ink #20262b`, `--muted`, `--line`, `--paper #fff`, `--fs-base 10.5pt`), IBM Plex Sans `:18`, tabular-nums en `.num, .price, td.amt` `:47`, `.sheet` 210 mm × min 297 mm con `padding: 15mm 15mm 0` `:59-69`, membrete `.head` `:98-120`, `.title-row` `:123-138` (eyebrow 8pt tracking .22em + h1 19pt), rejilla `.meta` `:141-165`, `.section > h2` con chip `.count` `:169-181`, **`table.grid`** `:216-226` (thead tinte de marca 7.6pt uppercase, `td.amt` derecha nowrap tabular, filas pares `--wash`, `tfoot` tinte de marca), `.callout` `:248-257`, **`.total`** `:260-269` (fondo `--brand-deep`, cifra 18pt), reglas print `:320-329` (`html, body { background:#fff }`, `.sheet { box-shadow:none }`, `.no-print`).
- `sheetHead.hbs:20-32`: logo (o `org-mark` con el nombre) + razón social, tagline, RUC, dirección, contacto, web; bandera `doc.hide_org_name`. `titleRow.hbs:5-14`: eyebrow + h1 + `doc.code` en negrita y `doc.issued_label`. `meta.hbs`: celdas `{label, value, hint?, wide?, num?}` y `metaCols`. `pageFooter.hbs:7-10`: `org.footer_html` + `doc.footer_note`. `signature.hbs`, `runHead.hbs`, `docEnd.hbs`.
- `lib/pdf/html/org.ts:63-104` `buildOrgDocBlock(orgRow)`; `brand_color` = `print_color_primary` validado hex con fallback esmeralda `:96-98`. Columnas necesarias: `ORG_DOC_COLUMNS` (`lib/pdf/prescription-data.ts:22-24`).
- Paginación en `prescription.hbs:25-28`: `@page { size: A4; margin: 14mm 0 12mm; }` + `@media print { .sheet { padding-top: 0; min-height: calc(297mm - 26mm - 1px); } }`; ítems con `break-inside: avoid` (`styles.hbs:189`); pie que viaja con el último bloque `.page-footer { break-inside: avoid; break-before: avoid; }` (`prescription.hbs:61`).
- Ruta modelo: `app/api/pdf/prescription/[appointmentId]/route.tsx` — `runtime = "nodejs"` `:19`, auth `:33-36`, `generalLimiter` `:38-40`, org con `ORG_DOC_COLUMNS` `:104-108`, `renderDocumentHtml` + `htmlToPdfBuffer` `:129-130`, respuesta `Content-Disposition: inline; filename=…` + `Cache-Control: no-store` `:143-150`.
- Pie "generado el…": `generatedFooterNote(timezone)` (`prescription-data.ts:98-111`) en zona de la org.
- Vista previa local sin app: `scripts/pdf-preview.ts` + fixtures en `scripts/pdf-fixtures/*.json` → `.html/.pdf/.png`.

**(b) Impresión del navegador (`window.print` + `print:`)**
- El shell ya está preparado: `app/(dashboard)/layout.tsx:110-115, 132` (`print:h-auto print:overflow-visible`), sidebar `print:hidden` (`components/layout/sidebar.tsx:426`), topbar `print:hidden` (`topbar.tsx:215`). Lo documenta el CHANGELOG (`CHANGELOG.md:4395`: "layout global preparado para futuros reportes imprimibles").
- Almacén: filtros `print:hidden` (`almacen/movement-list.tsx:295`), botón `window.print()` `:382`, cabecera solo-print `hidden print:block` `:391-400`. Caja: `history-tab.tsx:126`, `close-tab.tsx:292-296`. Farmacia: la página entera es `print:hidden` (`farmacia/page.tsx:607`) y el cierre se portalea a `<body>` con la técnica `visibility` (`day-sales-tab.tsx:645-660, 709-730`). Brief ejecutivo: escribe un HTML en una ventana nueva y auto-imprime (`dashboard/executive-brief-widget.tsx:404-465`).
- **No hay ningún `@media print` global en `app/globals.css`** (grep sin resultados). Consecuencia: en modo oscuro, `window.print()` imprime el texto con `--foreground: oklch(0.92 …)` (`globals.css:55`) sobre papel blanco (los navegadores no pintan fondos por defecto) → texto casi invisible. Afecta hoy a Almacén y Caja. Ver §5.
- La página de Reportes tiene alto fijo y scroll interno (`page.tsx:212, 292`): imprimirla con Ctrl+P recorta a una pantalla salvo que se añadan `print:h-auto` / `print:overflow-visible`.

**(c) Lo que hay que evitar**
- `lib/report-export.ts:19-126` `exportContentPDF`: captura `html2canvas` → jsPDF (raster, sin membrete, cabecera esmeralda cableada `setFillColor(16,185,129)` `:64`, `new Date()` `:74`). Además `ExportMenu` (`reports/export-menu.tsx`) y los `getExportConfig` de los reportes **no están cableados** en `page.tsx` (ningún import): código huérfano. No construir encima.
- `lib/pdf/clinic-header.ts` (`renderClinicHeader`): membrete legacy de los prints de react-pdf. El moderno es `sheetHead.hbs` + `org.ts`.

### 0.3 Recomendación: pantalla React + PDF con membrete por Chromium (vía a)
Una sola salida de papel: el botón "Imprimir / PDF" abre `/api/pdf/custom-report?from&to&sections=` en pestaña nueva (`Content-Disposition: inline`, como la receta). Desde el visor el usuario **imprime o guarda** — exactamente lo que pidió el founder ("se imprime o se guarda como PDF (A4)"). Razones:
1. Membrete real de la org (logo, razón social, RUC, dirección, contacto, color `print_color_primary`) con los mismos partials que receta, orden y presupuesto: el reporte "parece de la misma familia" también en papel.
2. Independiente del tema (claro/oscuro/Océano/Arena): `accent-themes.ts:36-38` declara que los PDFs no se temizan; `styles.hbs` trae su propia paleta de tinta.
3. Pagina bien: `thead` repetido, `tr { break-inside: avoid }`, `.total` que no se parte, pie con "Generado el… por…", números de página.
4. Un número, una fórmula: la ruta llama al **mismo RPC** `get_custom_report` que la pantalla; pantalla y PDF muestran el mismo JSON formateado por helpers equivalentes (`money` en hbs; `formatPEN` en React, ver §0.4).

Seguro barato (no es un botón): añadir `print:hidden` a la toolbar y `print:h-auto print:overflow-visible` al contenedor de Reportes para que un Ctrl+P accidental no salga recortado. No se promociona como "imprimir": evita dos hojas distintas para el mismo reporte.

Extra opcional de bajo costo: "Exportar Excel" con `exportReportExcel` (`lib/report-export.ts:130-172`) alimentado con `ReportExportConfig` (`lib/report-export-types.ts`), una hoja por sección — encaja con "se guarda" y no requiere Chromium.

### 0.4 Formato de moneda: cuatro variantes conviven
| Función | Salida | Cita |
|---|---|---|
| `formatCurrency` | `S/. 1,234.50` (es-PE, con punto tras S/) | `lib/utils.ts:33-38` |
| `formatPEN` (Caja) | `S/ 1234.50` (sin miles, `Math.abs`) | `lib/caja-emails.ts:64-67` |
| `formatPEN` (Almacén/Farmacia) | `S/ 1,234.50` | `app/(dashboard)/almacen/types.ts:167-172` |
| helper `money` (PDF) | `S/ 1,234.50` | `lib/pdf/html/render.ts:29-36` |
| Financiero inline | `` `S/. ${x.toFixed(2)}` `` (sin miles) | `financial-report.tsx:227, 357-358` |

Decisión propuesta: en este reporte, pantalla y papel usan **`S/ 1,234.50`** (es-PE con miles, símbolo "S/" sin punto — el oficial desde 2015 y el que ya usan Caja, Almacén, Farmacia y todo PDF). Es formato de presentación, no fórmula de dinero, así que no toca las reglas de CLAUDE.md. Para no crear una quinta copia: promover `almacen/types.ts:167` a `lib/format-pen.ts` y reexportarla desde `types.ts` (cambio de 10 líneas, comportamiento idéntico). Si el equipo prefiere no tocar Almacén en este PR, importar `formatPEN` desde `@/app/(dashboard)/almacen/types` como v1 y anotar la deuda.

Alineación de cifras en tablas existentes: `text-right tabular-nums` (`profit-tab.tsx:360-373`, `financial-report.tsx:263`). La tabla del Financiero olvida `tabular-nums` en sus celdas de dinero (`:357-358`); el componente nuevo lo lleva siempre. Cantidades: enteros para servicios; farmacia puede traer decimales (`SUM(i.quantity)` numeric) → mismo criterio que `fmtQty` (`almacen/types.ts:208-211`: hasta 3 decimales, sin ceros).

Fechas de negocio: el header de Reportes usa `new Date()` para el rango por defecto y para "Hoy" (`page.tsx:97-98, 170-182`) — contradice la regla de zona horaria de la org. El RPC ya resuelve `p_from NULL ⇒ hoy civil de la org` (`get_custom_report.sql:58-63`). Recomiendo que "Hoy" en el header pase a `useOrgToday()` (`hooks/use-org-today.ts:18-25`) en el mismo PR: a partir de las 19:00 Lima "Hoy" sería mañana y el reporte saldría vacío.

---

## 1. Anatomía de la pantalla

### 1.1 Dónde vive
Nueva pestaña **"Personalizado"** en la fila de tabs (`page.tsx:185-194`), icono `ListChecks` (lucide), clave `"custom"` en `ReportTab` (`page.tsx:29`), loader en `REPORT_LOADERS` (`:43-49`) y `dynamic()` propio (`:57-76`). Rama de render junto a `fertility`/`retention` (`:319-328`): es un reporte **autónomo** (trae sus datos con su propio `useQuery`), así que `needsSharedData` (`:126-127`) no cambia y el fetch compartido no se dispara en esta pestaña.

El **rango de fechas y el preset "Hoy" ya existen en el header** (`page.tsx:221-256`) y llegan por props debounced. No se duplican dentro de la pestaña: la toolbar del reporte solo lleva checks + acciones. Es lo que pidió el founder ("rango o Hoy + checks"), sin dos selectores de fecha en la misma pantalla.

### 1.2 ¿Botón "Generar" o auto-refresco?
Las otras pestañas se refrescan solas al cambiar el rango (300 ms de debounce, `page.tsx:104-108`) y React Query cachea por rango. Propongo lo mismo: **un fetch por rango con TODAS las secciones disponibles** (`p_sections = NULL`), y los checks filtran en cliente (mostrar/ocultar sección y recomputar TOTAL FINAL como Σ de las visibles — la misma suma que hace el RPC en `grand_total`, `get_custom_report.sql:384-388`). Marcar/desmarcar es instantáneo y sin spinner. Si datos decide que el RPC es caro para un año completo, el mismo componente admite un `Button` "Generar" (`variant="default" size="sm"`) que congela el rango en estado local; el resto no cambia.

### 1.3 Toolbar (sticky dentro del scroll de la página)
`page.tsx:292` es el contenedor `overflow-y-auto`, así que `position: sticky` funciona dentro de él. Clases:

```
<div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:-mt-6 md:px-6 print:hidden">
```

Contenido, dos filas en móvil / una en desktop (`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`):

1. **Checks de sección** — `<fieldset className="min-w-0"><legend className="sr-only">Secciones del reporte</legend><div className="flex flex-wrap gap-2">…`. Cada sección es un **chip-etiqueta** con el `Checkbox` dentro:
   ```
   <label htmlFor="chk-services"
     className="inline-flex min-h-11 md:min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors
                hover:bg-accent has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10 has-[:checked]:text-foreground
                has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background">
     <Checkbox id="chk-services" checked={enabled.services} onCheckedChange={…} />
     Servicios
     <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px] tabular-nums">12</Badge>
   </label>
   ```
   El conteo del badge = filas de la sección (`rows.length`); con 0 filas el badge queda `text-muted-foreground`. Las secciones con `sections_available[key] === false` **no se renderizan** (ni deshabilitadas ni tachadas: la regla del founder es "no aparecen").
2. **Resumen vivo + acciones** — `<p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">3 secciones · 56 filas · <b className="font-semibold text-foreground">S/ 12,450.00</b></p>` y a la derecha:
   - Opcional `DropdownMenu` "Exportar ▾" (`components/ui/dropdown-menu.tsx`) con "Excel (.xlsx)".
   - **Primario**: `<a href={pdfUrl} target="_blank" rel="noopener" className={cn(buttonVariants({ size: "sm" }), "h-11 md:h-9 px-4")}> <Printer className="h-4 w-4"/> Imprimir / PDF</a>`. Es un `<a>`, no `window.open` en un `onClick` asíncrono: los bloqueadores de pop-ups no lo detienen y el navegador muestra su propia carga mientras Chromium arranca en frío. Se deshabilita (`aria-disabled` + `pointer-events-none opacity-50`) cuando no hay ninguna sección marcada o el rango es inválido.

Persistencia de checks: `localStorage["yenda.reports.custom.sections"]` (conveniencia por dispositivo, `try/catch`), default = todas las disponibles marcadas.

### 1.4 Cuerpo del reporte
`<div className="space-y-6">` (igual que `financial-report.tsx:223`) con, en orden fijo: **Servicios → Abonos y servicios futuros → Farmacia → Pagos por tratamientos → TOTAL FINAL**. El orden no depende de los checks (un reporte se lee siempre igual). Ancho: completo, como el resto de Reportes — el founder rechazó explícitamente el aire lateral en pantallas grandes (`almacen/page.tsx:660-662`). Para que 4 columnas no queden desperdigadas en 1 500 px, las tres columnas numéricas tienen ancho fijo y **Descripción absorbe el resto** (§2.2).

Encabezado del cuerpo (una línea, no tarjeta): `<h2 className="text-base font-semibold">Reporte de cobros <span className="text-muted-foreground">· 01–07 set. 2026</span></h2>` + `<p className="text-xs text-muted-foreground">Cobros por fecha de pago, en bruto (con IGV), plata clínica y de farmacia por separado.</p>`. La etiqueta de rango sale de un helper único (`formatRangeLabel`, §7) que también usa el PDF.

Estados:
- **Cargando**: por sección marcada, tarjeta con 5 barras `h-4 rounded bg-muted animate-pulse` (mismo lenguaje que `reports/loading.tsx:8-16`).
- **Error**: `rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400` (`caja/close-tab.tsx:169`) + botón `variant="outline" size="sm"` "Reintentar".
- **Ninguna sección marcada**: empty state `profit-tab.tsx:323-332` con `ListChecks`, "Marca al menos una sección".
- **Rango sin cobros en todas las secciones**: cada sección muestra su vacío (§2.4) y TOTAL FINAL `S/ 0.00`; se imprime igual (el papel debe poder decir "hoy no entró nada").

### 1.5 Wireframe desktop (≥ lg)
```
┌ Reportes ───────────────────────────────────────────────────────────────────────┐
│ Reportes                                    📅 [01/09/2026] — [07/09/2026]      │  page.tsx:214-256
│ Inteligencia de negocio y KPIs              [Hoy][7d][30d][90d][Este mes] │ ✦ IA │
│ [Financiero][Marketing][Operacional][Retención][Fertilidad][☑ Personalizado]     │  page.tsx:264-282
├─────────────────────────────────────────────────────────────────────────────────┤
│ ▤ toolbar sticky ───────────────────────────────────────────────────────────── │
│  SECCIONES  [✓ Servicios 12] [✓ Abonos y futuros 3] [✓ Farmacia 41] [☐ Tratam. 5]│
│  3 secciones · 56 filas · S/ 12,450.00              [Exportar ▾] [🖨 Imprimir / PDF]│
│ ─────────────────────────────────────────────────────────────────────────────── │
│  Reporte de cobros · 01–07 set. 2026                                            │
│  Cobros por fecha de pago, en bruto (con IGV)…                                  │
│                                                                                 │
│ ┌ SERVICIOS  (12 servicios)                          TOTAL SECCIÓN  S/ 4,530.00 ┐│
│ │ DESCRIPCIÓN                                   CANTIDAD      PRECIO      TOTAL ││
│ │ Consulta ginecológica                                8      150.00   1,200.00 ││
│ │ Ecografía transvaginal                               5  180.00–220.00 1,030.00││
│ │   3 precios distintos                                                         ││
│ │ …                                                                             ││
│ │                                     TOTAL SERVICIOS                  4,530.00 ││
│ └───────────────────────────────────────────────────────────────────────────────┘│
│ ┌ ABONOS Y SERVICIOS FUTUROS (3 abonos)                TOTAL SECCIÓN  S/ 900.00 ┐│
│ │ …                                                                             ││
│ ┌ FARMACIA (41 productos)                            TOTAL SECCIÓN  S/ 7,020.00 ┐│
│ │ …                                                                             ││
│ ┌ TOTAL FINAL ──────────────────────────────────────────────────────────────────┐│
│ │ TOTAL FINAL                                                    S/ 12,450.00   ││
│ │ Suma de Servicios · Abonos y futuros · Farmacia (Tratamientos no incluido)    ││
│ │ Servicios 4,530.00 · Abonos 900.00 · Farmacia 7,020.00                        ││
│ │ ✓ Coincide con «Cobrado total» del reporte Financiero                         ││
│ │ No incluye pendientes por cobrar ni pagos directos a terceros.                ││
│ └───────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.6 Wireframe móvil (~390 px)
```
┌──────────────────────────────┐
│ Reportes                     │
│ [01/09/2026]  [07/09/2026]   │  inputs flex-1 (page.tsx:223-240)
│ [Hoy][7d][30d][90d][Este mes]│
│ [✦ Resumen IA]               │
│ ‹ Financ · Market · … · Pers ›│  tabs scroll-x
├──────────────────────────────┤
│ SECCIONES        (sticky)    │
│ [✓ Servicios            12 ] │  chips a ancho completo, min-h-11
│ [✓ Abonos y futuros      3 ] │
│ [✓ Farmacia             41 ] │
│ 3 secciones · S/ 12,450.00   │
│ [🖨 Imprimir / PDF (A4)    ] │  w-full h-11
├──────────────────────────────┤
│ Reporte de cobros            │
│ 01–07 set. 2026              │
│ SERVICIOS · 12   S/ 4,530.00 │  cabecera de sección apilada
│ ┌────────────────────────┐▸  │
│ │ DESCRIPCIÓN  CANT PREC…│   │  scroll-x propio, min-w-[520px]
│ └────────────────────────┘   │
│ …                            │
│ TOTAL FINAL                  │
│ S/ 12,450.00                 │  text-2xl en <sm
│ ✓ Coincide con Financiero    │
└──────────────────────────────┘
```
En móvil los chips pasan a `w-full justify-between` (`max-sm:w-full`) y el botón primario a `w-full`. El contenedor de la página ya clava `max-md:overflow-x-hidden` (`page.tsx:292`): cada tabla scrollea en su propio wrapper, la página nunca.

### 1.7 Jerarquía tipográfica y espaciado (pantalla)
| Nivel | Clases |
|---|---|
| Título del reporte | `text-base font-semibold` (+ rango en `text-muted-foreground`) |
| Título de sección | `text-sm font-semibold` (igual que `financial-report.tsx:334`) |
| Etiqueta pequeña / eyebrow | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Cabecera de tabla | `text-xs font-semibold text-muted-foreground` |
| Celdas | `text-sm`; descripción `font-medium`; dinero `tabular-nums`; total de fila `font-semibold` |
| Segunda línea de celda (hint) | `block text-[10px] text-muted-foreground` |
| Total de sección (cabecera) | `text-sm font-bold tabular-nums` + eyebrow "Total sección" |
| TOTAL FINAL | `text-3xl max-sm:text-2xl font-extrabold tracking-tight tabular-nums` |
| Separación entre tarjetas | `space-y-6`; dentro de tarjeta `px-4 md:px-5`, filas `py-2.5` |

---

## 2. Anatomía de cada tabla de sección (`ReportSectionTable`)

### 2.1 Contenedor y cabecera
```
<section id="sec-services" aria-labelledby="sec-services-title"
  className="rounded-xl border border-border bg-card [content-visibility:auto]">
  <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 md:px-5">
    <div className="flex min-w-0 items-center gap-2">
      <h3 id="sec-services-title" className="text-sm font-semibold">Servicios</h3>
      <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px] font-medium tabular-nums">12 servicios</Badge>
    </div>
    <p className="ml-auto flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total sección</span>
      <span className="text-sm font-bold tabular-nums" aria-label="Total de la sección Servicios: 4 530 soles">S/ 4,530.00</span>
    </p>
  </header>
```
Etiqueta del chip por sección: `12 servicios` · `3 abonos` · `41 productos` · `5 conceptos` (singular/plural en el helper).

### 2.2 Tabla
```
  <div className="overflow-x-auto">
    <table className="w-full min-w-[520px] text-sm">
      <caption className="sr-only">Servicios cobrados del 1 al 7 de septiembre de 2026</caption>
      <colgroup>
        <col />                       {/* Descripción: absorbe el ancho */}
        <col className="w-24" />      {/* Cantidad */}
        <col className="w-40" />      {/* Precio (cabe "1,200.00 – 1,500.00") */}
        <col className="w-36" />      {/* Total (cabe "1,234,567.50") */}
      </colgroup>
      <thead>
        <tr className="border-b border-border bg-muted/50">
          <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Descripción</th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Cantidad</th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Precio</th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
          <td className="px-4 py-2.5 min-w-0">
            <p className="font-medium break-words">Ecografía transvaginal</p>
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums">5</td>
          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
            180.00 – 220.00
            <span className="block text-[10px] font-normal text-muted-foreground">3 precios distintos</span>
          </td>
          <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">1,030.00</td>
        </tr>
      </tbody>
      <tfoot>
        <tr className="bg-muted/50 font-bold">
          <td colSpan={3} className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Total servicios</td>
          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">4,530.00</td>
        </tr>
      </tfoot>
    </table>
  </div>
</section>
```
Decisiones:
- Cifras siempre a la derecha con `tabular-nums` (Cantidad incluida; el Financiero centra los conteos, pero en una tabla de dinero la columna de cantidades alineada a la derecha se lee como una columna de suma, y así sale también en el PDF).
- El símbolo `S/` va **solo** en cabecera de sección, fila total y TOTAL FINAL; dentro de las celdas la cifra va sin símbolo (menos ruido, columnas más estrechas). Si UX prefiere símbolo en cada celda, el helper `formatPEN` ya lo trae; es un flag del componente (`showSymbolInCells`).
- Descripción nunca se trunca ni se clampa: un reporte se imprime entero. `break-words` para nombres largos.
- Orden de filas: el que entrega el RPC (`total DESC`, `get_custom_report.sql:345`); el componente no reordena.
- Filas especiales de datos: farmacia `voided: true` (venta anulada con cobro aún registrado, `get_custom_report.sql:254-268`) → fila con `text-muted-foreground` y `<Badge variant="outline" className="ml-2 text-[10px]">anulada</Badge>`; abonos `kind` (`appointment_future | appointment_past | direct | plan`) → hint bajo la descripción: "cita posterior al rango" / "cita anterior al rango" / "sin cita asociada" / "anticipo a plan".

### 2.3 Columna "Precio" cuando el mismo servicio se cobró a precios distintos
El RPC entrega `price` (solo si `price_min = price_max`) y `price_min`/`price_max` (`get_custom_report.sql:340-341`). Tratamiento visual, por caso:

| Caso | Celda Precio | Segunda línea |
|---|---|---|
| Un solo precio | `150.00` | — |
| Precios distintos | **rango** `180.00 – 220.00` (guion en-dash U+2013 con espacios finos; ambos números `tabular-nums`) | `3 precios distintos` si el RPC expone `distinct_prices`; si no, `precios distintos` |
| Fila sin precio unitario (abono directo, ventas anuladas, "sin detalle de venta") | `—` (em dash, `text-muted-foreground`) | hint del `kind` |
| Cantidad 0 con total > 0 (cobro parcial de cita atendida sin conteo) | `—` | `cobro parcial` |

Por qué rango y no promedio ni "varios": el lector hace la cuenta Cantidad × Precio ≈ Total a ojo. Con un promedio con asterisco imprime un número que nadie pagó y la cuenta "no cuadra"; con "varios" pierde información. El rango acota el total (5 × 180 ≤ 1 030 ≤ 5 × 220) y sigue siendo honesto. El mismo string lo produce `priceCell(row)` (§7) para pantalla y PDF (`price_text` + `price_hint`).

### 2.4 Sección vacía vs. sección que no aplica
- **No aplica** (`sections_available[key] === false`): no existe en la toolbar ni en el cuerpo ni en el PDF.
- **Aplica pero sin filas** en el rango: la tarjeta se renderiza igual (así el lector sabe que se incluyó): cabecera con badge `0` y total `S/ 0.00` en `text-muted-foreground`; en vez de tabla, `<p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin cobros de farmacia en este rango.</p>`. En el PDF, una fila única `Sin cobros en este rango` en cursiva (ver plantilla).

---

## 3. TOTAL FINAL (`ReportGrandTotal`)
Bloque destacado con tinte de marca (decoración → `primary`, que sigue el tema de acento de la org; el verde "significado" queda reservado a `success-*`, `globals.css:172-175`):

```
<section aria-labelledby="grand-title" className="rounded-xl border border-primary/30 bg-primary/10 px-5 py-4">
  <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
    <div className="min-w-0">
      <h3 id="grand-title" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Total final</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Suma de Servicios · Abonos y futuros · Farmacia. Tratamientos no incluido.</p>
    </div>
    <p className="text-3xl max-sm:text-2xl font-extrabold tracking-tight tabular-nums">
      <NumberPopIn key={grandTotal} value={formatPEN(grandTotal)} />
    </p>
  </div>
  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
    <dt>Servicios</dt><dd className="text-right tabular-nums font-medium text-foreground">4,530.00</dd>
    <dt>Abonos y servicios futuros</dt><dd …>900.00</dd>
    <dt>Farmacia</dt><dd …>7,020.00</dd>
  </dl>
  {/* Fila de conciliación — solo cuando es comparable */}
  <p className="mt-3 flex items-start gap-2 text-xs">
    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600 dark:text-success-400" />
    <span>Coincide con «Cobrado total» del reporte Financiero (S/ 12,450.00).</span>
  </p>
  <p className="mt-2 text-[11px] text-muted-foreground">Cobros por fecha de pago, en bruto (con IGV). No incluye pendientes por cobrar ni pagos directos a terceros.</p>
</section>
```
- `NumberPopIn` se re-anima con `key={grandTotal}` (`number-pop-in.tsx:14-17`); es la única cifra animada de la pantalla.
- **Fila "Coincide con…"** (coordinación UX/datos): el RPC devuelve `reconciliation.expected_grand_total` (Σ de las cubetas de `get_reports_overview` para las secciones marcadas, `get_custom_report.sql:399-403`). Estados:
  - `|grand_total − expected| < 0.005` → icono `CheckCircle2 text-success-600 dark:text-success-400` + "Coincide con «Cobrado total» del Financiero" (cuando están marcadas exactamente Servicios+Abonos+Farmacia) o "…con «Cobrado total» + «Cobros por tratamientos»" (las cuatro). Con otro subconjunto: "Coincide con la suma de las cubetas del Financiero" — o se omite la fila (decisión UX; recomiendo omitirla: la frase solo es útil cuando el lector puede ir a comprobarla en la otra pestaña).
  - Difiere → `AlertTriangle text-amber-600 dark:text-amber-400` + "Difiere en S/ 320.00 de «Cobrado total». Revisa ventas anuladas o cobros sin detalle." Debe ser rarísimo (datos lo trata como aviso de integridad), por eso ámbar y no rojo.
  - `reconciliation.refunds_in_range > 0` → línea informativa muted: "Devoluciones registradas en Caja en el rango: S/ 120.00 (no restadas)".
- Nunca `text-red-*` sin `dark:`; patrón `text-red-600 dark:text-red-400` (`profit-tab.tsx:380`).

---

## 4. La hoja impresa (A4)

### 4.1 Estructura
1. `{{> sheetHead}}` — membrete de la org (logo o nombre en color de marca, razón social, RUC, dirección, contacto, web). Sin `hide_org_name` (aquí el nombre de la clínica sí va, como en el presupuesto).
2. `{{> titleRow}}` — `doc.eyebrow = "Reporte personalizado"`, `doc.title = "Reporte de cobros · 01–07 set. 2026"`, `doc.code = ""`, `doc.issued_label = "Generado el 11/09/2026 14:32 por Ana Quispe"`.
3. `{{> meta}}` (3 columnas) — **Periodo** "1 al 7 de septiembre de 2026" (`longDate` de ambos extremos, o "11 de septiembre de 2026 (hoy)" si es un día) · **Secciones** "Servicios · Abonos y futuros · Farmacia" · **Cobros** "56 filas · 3 secciones".
4. Una `<section class="section">` por sección marcada: `h2` con título, chip `.count` (`styles.hbs:176-180`) y **total de la sección a la derecha** (nuevo `.sec-total`, ver estilos); `table.grid` (`styles.hbs:216-226`) con `thead` repetido en cada hoja, filas con `break-inside: avoid` y `tfoot` que se imprime **una sola vez** (`display: table-row-group`; el `table-footer-group` por defecto repetiría el total de sección en cada página y el lector vería "TOTAL" tres veces).
5. `.total` (`styles.hbs:260-269`) con "Total final" + small "Suma de …" + cifra 18pt; debajo, línea de partes y la conciliación; `.callout` "Qué incluye este total".
6. `{{> pageFooter}}` con `org.footer_html` + `doc.footer_note = "Documento generado por Yenda · 11/09/2026 14:32 · por Ana Quispe"` (extender `generatedFooterNote` con el nombre del usuario). Viaja con el bloque final (`break-before: avoid`), igual que en la receta.
7. Número de página "Página 2 de 3": Chromium lo pinta con `displayHeaderFooter` + `footerTemplate` (`page.pdf`). Requiere una opción retro-compatible en `htmlToPdfBuffer` (`lib/pdf/html/chromium.ts:18-21`):
   ```ts
   export interface HtmlToPdfOptions {
     loadTimeoutMs?: number;
     /** Pie nativo de Chromium (usa .pageNumber/.totalPages). Se dibuja en el margen de @page. */
     footerTemplate?: string;
   }
   // en page.pdf(...):
   ...(opts.footerTemplate
     ? { displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: opts.footerTemplate }
     : {}),
   ```
   con `@page { margin: 14mm 0 16mm }` para dejar sitio. El `footerTemplate` no carga Google Fonts: `font-family: system-ui; font-size: 7pt; color: #9aa3ad; padding: 0 15mm`. **Verificar con `scripts/pdf-preview.ts`** que con `preferCSSPageSize: true` el pie cae dentro del margen inferior de `@page` y no pisa el contenido. Alternativa sin tocar `chromium.ts`: `position: fixed; bottom: 0` (Chromium repite los `fixed` en cada página) — más frágil (puede solapar la última fila); solo si la opción anterior no prospera.

### 4.2 Tamaños en papel
- Celdas de tabla 9.4pt = 12.5 px (`styles.hbs:216`) → cumple "mínimo 12 px". Regla del documento: **ningún dato por debajo de 9pt**; los hints (`.hint` 7.6pt, `styles.hbs:226`) y la cabecera uppercase (7.6pt → subir a 8pt en esta plantilla) son metadatos, no datos.
- Con `padding: 6px 12px` por celda caben ~38 filas por hoja; un rango mensual con 300 productos de farmacia son ~9 hojas. Aceptable; la paginación es correcta gracias a `thead` repetido.
- Vertical: A4 retrato. Cuatro columnas caben de sobra (Descripción ≈ 52 %, Cantidad 12 %, Precio 18 %, Total 18 %).

### 4.3 Borrador `lib/pdf/html/templates/custom-report.hbs`
```hbs
{{!--
  Yenda · REPORTE DE COBROS PERSONALIZADO (motor HTML → Chromium).
  Datos: lib/pdf/custom-report-data.ts (buildCustomReportDocData).
  Ruta:  /api/pdf/custom-report?from=YYYY-MM-DD&to=YYYY-MM-DD&sections=a,b

  Variables: doc.{title, eyebrow, code, issued_label, footer_note} ·
  org.* (lib/pdf/html/org.ts) · meta[] ·
  sections[] = { key, title, count_label, total, empty_text, avoid_break,
                 quantity_label, rows[] }
  rows[]     = { description, hint, quantity_text, price_text, price_hint,
                 total, muted }
  grand      = { total, parts_label, parts_text, note }
  reconciliation = { matches, label } | null

  Un número, una fórmula: totales y filas llegan calculados del MISMO RPC
  (get_custom_report) que alimenta la pantalla; aquí solo se formatean con
  `money`. Los textos de precio (rango / "—") ya vienen redactados por
  lib/reports/custom-report.ts (priceCell), igual que en pantalla.

  La hoja NO es `.fixed`: pagina sola. `thead` se repite por hoja; `tfoot`
  se fuerza a table-row-group para que el total de sección salga UNA vez.
--}}
{{> head}}
<style>
  /* Documentos que paginan: margen vertical en @page (se repite en cada
     hoja). 16mm abajo: sitio para el pie nativo "Página x de y". */
  @page { size: A4; margin: 14mm 0 16mm; }
  @media print {
    .sheet { padding-top: 0; min-height: calc(297mm - 30mm - 1px); }
  }
  .meta { border-right: 0; }
  .meta .cell, .meta .cell:nth-child(3n) { border-right: 1px solid var(--line); }

  /* Cabecera de sección: título + chip a la izquierda, total a la derecha.
     El ::after de relleno del base no hace falta: lo empuja margin-left:auto. */
  .section > h2::after { content: none; }
  .section > h2 { break-after: avoid; }
  .section > h2 .sec-total {
    margin-left: auto; font-size: 9.6pt; letter-spacing: 0; text-transform: none;
    color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 600;
  }
  .section > h2 .sec-total small {
    font-size: 6.8pt; letter-spacing: .12em; text-transform: uppercase;
    color: var(--muted); font-weight: 600; margin-right: 6px;
  }
  /* Secciones cortas (≤ 6 filas, decidido en el data-builder) no se parten. */
  .section.avoid-break { break-inside: avoid; }

  /* Tabla de cobros */
  table.grid thead { display: table-header-group; }   /* se repite en cada hoja */
  table.grid tfoot { display: table-row-group; }      /* total UNA sola vez */
  table.grid tr { break-inside: avoid; }
  table.grid thead th { font-size: 8pt; }
  table.grid th.amt { text-align: right; }
  table.grid td.desc { width: 52%; word-break: break-word; }
  table.grid td.qty, table.grid td.price, table.grid td.total {
    text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  table.grid td.qty { width: 12%; }
  table.grid td.price { width: 18%; font-weight: 400; }
  table.grid td.total { width: 18%; font-weight: 600; }
  table.grid tr.muted td { color: var(--muted); }
  table.grid tfoot td { text-align: right; }
  table.grid tfoot td.lbl { font-size: 7.6pt; letter-spacing: .1em; text-transform: uppercase; }
  table.grid tr.empty td { text-align: center; color: var(--muted); font-style: italic; padding: 12px; }

  /* Total final: bloque de marca; nunca se parte ni queda huérfano. */
  .total { margin-top: 20px; break-inside: avoid; }
  .total .t-lbl small { text-transform: none; letter-spacing: .02em; font-size: 7.6pt; }
  .grand-parts { margin: 8px 2px 0; font-size: 8.4pt; color: var(--muted); }
  .grand-parts b { color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }
  .recon { margin: 8px 2px 0; font-size: 8.8pt; color: var(--ink-2); break-inside: avoid; }
  .recon.ok::before   { content: "\2713"; color: var(--brand); font-weight: 700; margin-right: 6px; }
  .recon.diff::before { content: "!"; color: #b45309; font-weight: 700; margin-right: 6px; }
  .callout { break-inside: avoid; }
  /* El pie viaja con el total: nunca solo en una hoja nueva. */
  .page-footer { break-inside: avoid; break-before: avoid; }
</style>

  <section class="sheet">
    <div class="sheet-body">
{{> sheetHead}}
{{> titleRow}}
{{> meta}}

{{#each sections}}
      <section class="section{{#if avoid_break}} avoid-break{{/if}}">
        <h2>{{title}} <span class="count">{{count_label}}</span><span class="sec-total"><small>Total</small>{{money total}}</span></h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="amt">{{quantity_label}}</th>
              <th class="amt">Precio</th>
              <th class="amt">Total</th>
            </tr>
          </thead>
          <tbody>
            {{#each rows}}
            <tr{{#if muted}} class="muted"{{/if}}>
              <td class="desc">{{description}}{{#if hint}}<span class="hint">{{hint}}</span>{{/if}}</td>
              <td class="qty">{{quantity_text}}</td>
              <td class="price">{{price_text}}{{#if price_hint}}<span class="hint">{{price_hint}}</span>{{/if}}</td>
              <td class="total">{{money total}}</td>
            </tr>
            {{else}}
            <tr class="empty"><td colspan="4">{{empty_text}}</td></tr>
            {{/each}}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="lbl">Total {{title}}</td>
              <td class="amt">{{money total}}</td>
            </tr>
          </tfoot>
        </table>
      </section>
{{/each}}

      <div class="total">
        <div class="t-lbl">Total final<small>{{grand.parts_label}}</small></div>
        <div class="t-fig">{{money grand.total}}</div>
      </div>
{{#if grand.parts_text}}
      <p class="grand-parts">{{grand.parts_text}}</p>
{{/if}}
{{#if reconciliation}}
      <p class="recon {{#if reconciliation.matches}}ok{{else}}diff{{/if}}">{{reconciliation.label}}</p>
{{/if}}
{{#if grand.note}}
      <div class="callout">
        <h3>Qué incluye este total</h3>
        <p>{{grand.note}}</p>
      </div>
{{/if}}
    </div>
{{> pageFooter}}
  </section>

{{> docEnd}}
```
Notas de implementación:
- `{{#each rows}} … {{else}} … {{/each}}`: el bloque inverso de `each` se evalúa con el contexto de la sección, por eso `{{empty_text}}` resuelve sin `../`.
- `{{money total}}` con un solo argumento: el helper recibe el hash de opciones como 2.º parámetro y cae a "PEN" (`render.ts:73-75`); es el mismo uso que `budget.hbs:63`.
- `parts_text` ejemplo: "Servicios **S/ 4,530.00** · Abonos y futuros **S/ 900.00** · Farmacia **S/ 7,020.00**" — si se quiere la negrita, construirlo como `SafeString` escapando cada parte en el data-builder (o pasar `parts[]` y hacer un `{{#each}}` inline).
- Fixture: `scripts/pdf-fixtures/custom-report.json` con 3 secciones (una vacía, una de 45 filas para probar el salto de página, un rango de precios) y probar con `CHROME_PATH=… npx tsx scripts/pdf-preview.ts custom-report.hbs scripts/pdf-fixtures/custom-report.json /tmp/out/custom` (`scripts/pdf-preview.ts:4`).

---

## 5. Dark mode y print

### 5.1 En pantalla oscura
Todo el componente usa tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-muted/50`, `bg-primary/10`), así que el cambio de `.dark` (`globals.css:53-78`) lo recolorea sin clases extra. Lo único con color semántico: el check de conciliación `text-success-600 dark:text-success-400` (escala fija `globals.css:180-191`) y la advertencia `text-amber-600 dark:text-amber-400`. Tintes de marca (`bg-primary/10`, `border-primary/30`) funcionan en ambos modos porque `--primary` se redefine en `.dark:60` y en cada tema de acento. Los chips marcados `has-[:checked]:bg-primary/10` idem. La toolbar sticky con `bg-background/95 backdrop-blur` no deja ver las filas al pasar por debajo en ningún modo.

### 5.2 Por qué la impresión ignora el tema
1. **Legibilidad física**: el papel es blanco y los navegadores no imprimen fondos por defecto; en `.dark` el texto es `oklch(0.92 …)` (`globals.css:55`) → gris casi blanco sobre blanco. Es un bug latente hoy en Almacén y Caja (`movement-list.tsx:382`, `close-tab.tsx:293`) porque `globals.css` no tiene `@media print`.
2. **El documento es de la clínica, no del usuario**: dos recepcionistas con temas distintos (o Océano vs. Esmeralda) deben imprimir hojas idénticas. `accent-themes.ts:36-38` ya fija que los PDFs no se temizan; el color del papel es `org.print_color_primary` (`org.ts:96-98`), configurado en Ajustes para eso.
3. **Sombras, blur, tintes al 10 %** rasterizan en bandas y gastan tóner; `styles.hbs:322-329` ya quita sombra y fija fondo blanco en print.
4. La vía Chromium hace todo esto gratis: HTML propio, `--paper #fff`, `--ink #20262b`, sin `.dark`.

Red de seguridad global recomendada (sirve también a Almacén y Caja; 8 líneas en `app/globals.css`):
```css
@media print {
  :root, .dark {
    --background: #fff; --foreground: #111827; --card: #fff; --card-foreground: #111827;
    --muted: #f3f4f6; --muted-foreground: #4b5563; --border: #d1d5db; --popover: #fff;
  }
  * { box-shadow: none !important; text-shadow: none !important; }
}
```

---

## 6. Accesibilidad y tacto
- **44 px en móvil**: chips de sección `min-h-11` (44 px) y `md:min-h-9`; el `Checkbox` ya amplía su área táctil a 44 × 36 px en < md (`checkbox.tsx:30-49`); botón primario `h-11 md:h-9` (mismo criterio que `size="icon"` en `button.tsx:26`).
- **Etiquetas clicables**: el `<label htmlFor>` envuelve texto + badge; tocar cualquier parte del chip conmuta el check. Ids estables `chk-services`, `chk-advances`, `chk-pharmacy`, `chk-treatments`.
- **Foco visible**: el input conserva `peer-focus-visible:ring-2 ring-ring ring-offset-2` (`checkbox.tsx:54`); el chip añade `has-[:focus-visible]:ring-2` para que el anillo envuelva todo el chip, no solo la cajita de 16 px. El `<a>` primario hereda `focus-visible:ring-1 ring-ring` de `buttonVariants` (`button.tsx:7`). Teclado: Espacio conmuta, Enter en el enlace abre el PDF, Escape no aplica (no hay modal).
- **Semántica**: `fieldset` + `legend sr-only` para el grupo; cada sección es `<section aria-labelledby>`; tabla con `<caption sr-only>` y `scope="col"`; total de sección con `aria-label` en palabras ("4 530 soles"); resumen de la toolbar con `aria-live="polite"` (anuncia "3 secciones · S/ 12,450.00" al marcar); enlace PDF con `aria-disabled` cuando no procede y `aria-describedby` a un texto "Abre el PDF en una pestaña nueva".
- **Info "qué incluye cada sección"**: usar `Popover` (`components/ui/popover.tsx`) en un botón `size="icon" variant="ghost"` con `Info`, no el tooltip por hover de `CardTitle` (`financial-report.tsx:84-97`), que no funciona en táctil ni con teclado.
- **Contraste**: `text-muted-foreground` (oklch 0.48) sobre `--card` blanco ≈ 4.6:1 (AA texto normal); en papel los hints usan `--muted #6b7480` a 7.6pt solo para metadatos.
- **Movimiento**: `NumberPopIn` es la única animación; comprobar que `.t-digit` respeta `prefers-reduced-motion` en `globals.css` (no lo verifiqué); si no, envolver con `motion-safe:`.
- **Impresión legible**: datos a ≥ 9pt (12 px); filas con `break-inside: avoid`; cabecera repetida para no leer una página de números sin rótulos.
- **Sin texto en imágenes**: el PDF es texto seleccionable (a diferencia del `exportContentPDF` raster).

---

## 7. Estructura de componentes propuesta

```
app/(dashboard)/reports/page.tsx                      (+ tab "custom": ReportTab, REPORT_LOADERS, dynamic, tabs[], rama de render)
app/(dashboard)/reports/custom-report.tsx             pestaña (client): datos + estado de checks + composición
app/(dashboard)/reports/custom-report-toolbar.tsx     checks + resumen + acciones
components/reports/report-section-table.tsx           tabla de sección (reutilizable)
components/reports/report-grand-total.tsx             bloque TOTAL FINAL + conciliación
lib/reports/custom-report.ts                          tipos del payload, SECTION_META, priceCell, formatRangeLabel, sumas visibles
lib/pdf/custom-report-data.ts                         buildCustomReportDocData(): payload RPC → contexto hbs
lib/pdf/html/templates/custom-report.hbs              plantilla (§4.3)
app/api/pdf/custom-report/route.tsx                   GET → PDF inline
lib/pdf/html/chromium.ts                              (+ footerTemplate opcional, 6 líneas)
scripts/pdf-fixtures/custom-report.json               fixture para pdf-preview
components/language-provider.tsx                      claves reports.custom_* (bloques es :438 y en :1140)
```

### 7.1 Tipos (`lib/reports/custom-report.ts`)
```ts
export type SectionKey = "services" | "advances" | "pharmacy" | "treatments";

/** Fila tal cual la entrega get_custom_report (sections.<key>.rows[]). */
export interface CustomReportRow {
  description: string;
  quantity: number;               // numeric en farmacia (puede traer decimales)
  price: number | null;           // solo cuando price_min === price_max
  price_min: number | null;
  price_max: number | null;
  total: number;
  kind?: "appointment_future" | "appointment_past" | "direct" | "plan"; // advances
  voided?: boolean;               // pharmacy
  attended?: number; production_total?: number;                        // services (no se pintan en v1)
}
export interface CustomReportSection { rows: CustomReportRow[]; total: number; }
export interface CustomReportPayload {
  range: { from: string; to: string; timezone: string };
  sections_available: Record<SectionKey, boolean>;
  sections: Partial<Record<SectionKey, CustomReportSection | null>>;
  grand_total: number;
  reconciliation: { payments_amount: number; treatment_payments_amount: number;
                    expected_grand_total: number; refunds_in_range: number;
                    collected_breakdown: Record<string, number> };
}

export const SECTION_META: Record<SectionKey, {
  order: number; title: string; unit: [string, string];   // ["servicio","servicios"]
  quantityLabel: string; emptyText: string; hint: string;  // hint = texto del Popover "qué incluye"
}> = { … };

/** Texto de la celda Precio — ÚNICA implementación para pantalla y PDF. */
export function priceCell(row: CustomReportRow): { text: string; hint?: string } {
  if (row.price != null) return { text: fmt(row.price) };
  if (row.price_min != null && row.price_max != null && row.price_min !== row.price_max)
    return { text: `${fmt(row.price_min)} – ${fmt(row.price_max)}`, hint: "precios distintos" };
  return { text: "—" };
}

/** "01–07 set. 2026" · "28 ago. – 04 set. 2026" · "28 dic. 2025 – 04 ene. 2026" · "11 set. 2026". */
export function formatRangeLabel(from: string, to: string): string  // meses abreviados peruanos: ene feb mar abr may jun jul ago set oct nov dic

/** Σ de los totales de las secciones marcadas (misma suma que grand_total del RPC). */
export function sumVisible(payload, enabled: Record<SectionKey, boolean>): number
```

### 7.2 Props
```ts
// app/(dashboard)/reports/custom-report.tsx
export function CustomReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string })
//  useQuery(["reports","custom", organizationId, dateFrom, dateTo]) → supabase.rpc("get_custom_report", { p_org_id, p_from, p_to })
//  enabled: Record<SectionKey, boolean> (localStorage) · pdfUrl = `/api/pdf/custom-report?from&to&sections=${keys.join(",")}`

// app/(dashboard)/reports/custom-report-toolbar.tsx
interface Props {
  sections: { key: SectionKey; title: string; count: number }[];   // solo las disponibles
  enabled: Record<SectionKey, boolean>;
  onToggle: (key: SectionKey, value: boolean) => void;
  summary: { sections: number; rows: number; total: number };
  pdfHref: string | null;                                          // null ⇒ enlace deshabilitado
  onExportExcel?: () => Promise<void>;
}

// components/reports/report-section-table.tsx
interface ReportSectionTableProps {
  id: string; title: string; countLabel: string;                   // "12 servicios"
  rows: CustomReportRow[]; total: number;
  quantityLabel?: string;                                          // "Cantidad" | "Cobros" | "Unidades"
  emptyText: string;
  rowHint?: (row: CustomReportRow) => string | undefined;          // kind/voided → hint
  showSymbolInCells?: boolean;                                     // default false
}

// components/reports/report-grand-total.tsx
interface ReportGrandTotalProps {
  total: number;
  parts: { label: string; total: number }[];
  includedLabel: string; excludedLabel?: string;                   // "Suma de …" / "Tratamientos no incluido"
  reconciliation?: { matches: boolean; reference: number; referenceLabel: string } | null;
  refundsInRange?: number;
  note: string;
}
```

### 7.3 Ruta `app/api/pdf/custom-report/route.tsx`
Calco de `prescription/[appointmentId]/route.tsx`: `runtime = "nodejs"`; auth; `generalLimiter`; leer `from`, `to`, `sections` de la query y validarlos (fechas ISO, claves del enum); resolver la org activa del usuario y su rol (owner/admin: Reportes es `adminOnly`, `sidebar.tsx:181`; el RPC vuelve a gatear, `get_custom_report.sql:49-56`); `supabase.rpc("get_custom_report", …)` (el mismo RPC que la pantalla); `organizations` con `ORG_DOC_COLUMNS`; `buildCustomReportDocData({ org, payload, sections, generatedBy: perfil del usuario })`; `renderDocumentHtml("custom-report.hbs", data)`; `htmlToPdfBuffer(html, { footerTemplate })`; respuesta `Content-Type: application/pdf`, `Content-Disposition: inline; filename="reporte-cobros-2026-09-01_2026-09-07.pdf"`, `Cache-Control: no-store`. No es dato clínico: sin `logClinicalAccess`; si se quiere trazabilidad, un `audit` genérico.

### 7.4 `buildCustomReportDocData` (`lib/pdf/custom-report-data.ts`)
Puro, sin Supabase (como `buildPrescriptionDocData`). Produce `doc`, `org` (`buildOrgDocBlock`), `meta` (Periodo · Secciones · Cobros), `sections[]` con `count_label`, `quantity_label`, `empty_text`, `avoid_break = rows.length <= 6`, filas con `quantity_text` (`fmtQty`), `price_text/price_hint` (`priceCell`), `muted = voided`, `hint` (kind); `grand` con `parts_label`, `parts_text`, `note`; `reconciliation` con `matches` (tolerancia 0.005) y `label`; `doc.footer_note` con `generatedFooterNote(org.timezone)` + " · por {nombre}". Testeable con el fixture.

### 7.5 i18n
Claves nuevas en `language-provider.tsx` (es en `:438 ss.`, en en `:1140 ss.`): `reports.tab_custom` "Personalizado", `reports.custom_title` "Reporte de cobros", `reports.custom_sections` "Secciones", `reports.custom_print` "Imprimir / PDF", `reports.custom_section_services|advances|pharmacy|treatments`, `reports.custom_total_section` "Total sección", `reports.custom_grand_total` "Total final", `reports.custom_matches` / `reports.custom_differs`, `reports.custom_empty_*`. El PDF es siempre en español (como el resto de documentos).

---

## 8. Riesgos visuales y cómo se resuelven
| Riesgo | Solución |
|---|---|
| **Tabla de 4 columnas en 390 px** | Wrapper `overflow-x-auto` con `table min-w-[520px]` (patrón `profit-tab.tsx:334-335`); la página ya es `max-md:overflow-x-hidden` (`page.tsx:292`), así que solo scrollea la tabla. Cabecera de sección apilada (`flex-wrap`) y total debajo del título. Alternativa v2: modo "fichas" (`max-sm:` descripción arriba, "8 × 150.00" abajo-izquierda, total derecha) — no para v1, la app no tiene ese patrón. |
| **Nombres de servicio/producto largos** ("Ecografía obstétrica morfológica del segundo trimestre con Doppler…") | Descripción absorbe el ancho, `break-words`, sin `truncate` ni `line-clamp`; en papel `word-break: break-word` y `width: 52%`. Nunca se corta un nombre en un documento que se firma o archiva. |
| **Muchas filas** (farmacia mensual: 300+ productos) | Pantalla: `[content-visibility:auto]` por sección; sin paginación (un reporte se lee y se imprime entero). Papel: `tr { break-inside: avoid }`, `thead` repetido, `tfoot` una vez; ~38 filas/hoja. Aviso en toolbar si `rows > 400`: "El PDF tendrá más de 10 páginas". Si datos decide agrupar colas ("Otros productos"), la UI no cambia. |
| **Montos de 6-7 cifras** ("S/ 1,234,567.50" = 15 caracteres) | Columna Total `w-36` (144 px) + `whitespace-nowrap` + `tabular-nums`; símbolo fuera de las celdas; TOTAL FINAL `text-3xl` → `max-sm:text-2xl`. En papel `td.total { white-space: nowrap }` (`styles.hbs:223`). |
| **Rango de precios largo** ("1,200.00 – 1,500.00", 19 caracteres) | Columna Precio `w-40` (160 px); `whitespace-nowrap`; si hubiera que partir, solo en el guion (`<wbr>` tras el en-dash). |
| **Chip de conteo vs. columna Cantidad** (12 servicios vs. Σ cantidades = 41) | El chip cuenta **filas** y lo dice ("12 servicios"); la fila total no suma la columna Cantidad (dejarla vacía en `tfoot` evita "41" junto a "12"). |
| **Sección sin filas** | Se pinta con total `S/ 0.00` y texto de vacío (§2.4); nunca desaparece en silencio si estaba marcada. |
| **Doble fuente de verdad del TOTAL FINAL** (checks en cliente vs. `grand_total` del RPC) | La pantalla muestra `sumVisible()` = Σ de `sections[key].total` marcadas — la misma operación que `grand_total` (`get_custom_report.sql:384-388`); el PDF pide el RPC con `p_sections` = marcadas y usa `grand_total` del servidor. Prueba de humor: la fila de conciliación lo delataría. |
| **Arranque en frío de Chromium (3–8 s)** | El `<a target="_blank">` abre la pestaña al instante y el navegador muestra la carga; no hay spinner que pueda quedarse colgado. Si la ruta falla (500), la pestaña muestra el JSON de error: envolver en una página HTML mínima "No se pudo generar el PDF, vuelve a intentar" con el mismo `styles.hbs`. |
| **Tema de acento distinto entre pantalla y papel** (Océano en pantalla, `print_color_primary` coral en PDF) | Es por diseño (`accent-themes.ts:36-38`); el PDF usa el color de Ajustes → General. Documentarlo en el Popover "qué incluye". |
| **"Hoy" a las 19:00 hora Lima** | El header calcula presets con `new Date()` (`page.tsx:170-182`): pasar a `useOrgToday()`; el RPC ya usa el "hoy" civil de la org. |
| **Ctrl+P sobre la pantalla** | `print:hidden` en toolbar + `print:h-auto print:overflow-visible` en `page.tsx:212, 292` para que no salga recortado; y la red de seguridad de `@media print` en `globals.css` (§5.2) para que en oscuro no salga en blanco. |
| **Plus Jakarta Sans y `tabular-nums`** | Si la fuente no expone `tnum`, la alineación derecha ya evita el zigzag en unidades; en papel IBM Plex Sans sí lo tiene (`styles.hbs:47`). |
| **Cantidad decimal en farmacia** ("2.5 frascos") | `fmtQty` (hasta 3 decimales, sin ceros) y cabecera "Unidades" en esa sección; servicios/abonos/tratamientos muestran enteros con cabecera "Cantidad"/"Cobros". |
