# "Reporte personalizado" — Benchmark de producto y recomendaciones

> Rol: experto en reportes modernos (producto + benchmark). Solo lectura de código.
> Fecha: 2026-09-11. Repo: `/home/user/-vibeforge-app` (Yenda).
>
> **Método y límites.** Las páginas de los vendors (Square, Toast, Intuit, Jane, Cliniko, Open Dental, Dentrix, SimplePractice, Lightspeed) están bloqueadas por el proxy de egreso de esta sesión, así que NO pude abrirlas completas: cada afirmación concreta sale de los extractos de la documentación oficial que devuelve el buscador, y cito la URL. Donde el extracto no alcanzó, lo digo ("no verificado"). Todo lo que digo del repo sí está leído en el código, con ruta.

---

## 0. Lo esencial en diez líneas

1. Lo que pide la doctora existe en todos los productos de referencia bajo un nombre: **"Sales by item/product/service summary"** (POS y QuickBooks), **"Production Summary por código de procedimiento"** (dental) o **"Income allocation / Payments summary"** (clínicas). Columnas canónicas: *Descripción · Cantidad · Importe*, con *Precio promedio* y *% del total* como extras frecuentes. Nadie usa "Precio de lista" como columna: usan **promedio = Total ÷ Cantidad**, porque así la fila siempre cuadra.
2. Los presets de fecha estándar son **Hoy · Ayer · Esta semana · Este mes · Mes anterior · Rango**. Yenda ya tiene Hoy/7d/30d/90d/Este mes en `/reports`; para la contadora faltan **Ayer** y **Mes anterior** (trabaja con meses cerrados).
3. Export: **CSV/Excel siempre; PDF en la mitad** (Square PDF solo para summary; Cliniko "imprimir → guardar como PDF"; Open Dental print preview; Jane/Toast/Lightspeed/SimplePractice solo CSV/XLSX). Guardar el reporte configurado: Square (Custom reports) y QuickBooks (Save customization + email programado) sí; el resto no.
4. El error número uno de estos reportes es **dos pantallas, dos totales**. En Yenda el riesgo es real: el nuevo reporte convivirá con "Cobrado total" de Financiero. La defensa es de arquitectura, no de UI: **las secciones se definen como las cubetas de `collected_breakdown` (mig 250) + `treatment_payments_amount` (mig 244)** y el TOTAL FINAL se imprime con una línea de conciliación contra esas dos tarjetas.
5. Hallazgo incómodo del repo: el export PDF/Excel de `/reports` (`export-menu.tsx`, `lib/report-export.ts`) **no está montado en ninguna página** — nadie renderiza `ExportMenu` ni llama a `exportContentPDF`/`exportReportExcel`. No hay "export CSV de Financiero" que reutilizar; sí hay un escritor de Excel listo (`exportReportExcel`) y, mucho mejor, el **motor HTML→Chromium con membrete real de la org** (`lib/pdf/html/*`) que ya imprime recetas, órdenes y presupuestos.
6. Segundo hallazgo: **las devoluciones no se netean en `/reports`** (mig 250/251 solo suma `patient_payments`) mientras el Dashboard sí las resta (mig 230). Y una venta de farmacia **anulada conserva su fila de pago** `source='pos'` (mig 232, `pharmacy_void_sale` no la toca), así que la cubeta "Farmacia" de Financiero incluye anuladas y "Farmacia › Ventas del día" (`pharmacy_day_summary`) no. El nuevo reporte no debe heredar esto; hay que decidir la regla (sección 3e).
7. "Cantidad" tiene que definirse por sección o la contadora la interpretará mal: **citas cobradas** en Servicios, **nº de cobros** en Adelantos y Tratamientos, **unidades** en Farmacia (sección 3c).
8. Nombre recomendado: **"Resumen de cobros del periodo"**. Posicionamiento: Financiero es el tablero de la dueña (KPIs, gráficos, doctores); este es **el documento** que se imprime y se entrega, por concepto, un número por fila. Comparten RPC y cuadran al céntimo.
9. V1 mínima digna: presets + checks de sección + tablas con subtotal + TOTAL + banner "bruto con IGV" + PDF con membrete + Excel. Todo lo demás (comparar periodo, doctor, método de pago, email programado, columnas configurables, gráficos) es V1.1/V2 y no hace falta para no parecer pobre.
10. Coste casi cero con mucho valor: conciliación impresa con Financiero, PDF con membrete por el motor existente, Excel por `exportReportExcel`, nota IGV con datos ya almacenados (`pharmacy_sales.igv_amount`, `services.igv_affectation`), presets Ayer/Mes anterior con `useOrgToday()`.

---

## 1. Benchmark: cómo resuelven "ventas/cobros por periodo, agrupado"

### 1.1 Tabla comparativa

| Producto | Reporte equivalente | Agrupa por | Columnas | Presets de fecha | Export | Cómo llaman al total | ¿Guardar reporte? |
|---|---|---|---|---|---|---|---|
| **Square** (POS) | *Sales summary* + *Item sales* (y *Category*, *Modifier sales*) | Ítem / categoría / modificador; también por método de pago | Gross sales, Refunds, Net sales, Discounts, Tips, Taxes, Total collected, Fees; en Item sales: items sold/count, gross, net | Diario, semanal, mensual, personalizado; **comparar dos periodos** desde el preset | CSV (elige columnas); **PDF** para summary/payout/reconciliation | "Net sales" (neto de descuentos y devoluciones, sin impuesto) y "Total collected" | **Sí**: Custom reports → bloques → *Save Report*; exporta |
| **Toast** (POS restaurantes) | *Sales summary* (+ *Product mix*) | Categoría / ítem (product mix), método de pago, servicio | Gross sales (sin tax ni tip), discounts, refunds, Net sales, tax, tips, payments | Yesterday, Today, This week, …, Custom | CSV, XLS; 15 meses de historia | "Net sales" = gross − descuentos − devoluciones | No (solo email fijo *Daily/Weekly Performance Summary*; no se programa un reporte arbitrario) |
| **Lightspeed Retail** (X/S-Series) | *Sales summary*, *Sales by product / category / employee* | Producto, categoría, empleado, ubicación, caja | Item, Department, Quantity sold, importes | Dropdown de rango + "Specify period" (Year/Quarter/Month/Week/Day/Hour) | XLSX, CSV | Totales de la tabla | No verificado |
| **QuickBooks Online** (contabilidad) | *Sales by Product/Service Summary* (y *Detail*) | Producto/servicio (opcionalmente por clase) | **Quantity · Amount · % of Sales · Avg Price** (fijas; no se pueden quitar en summary) | Report period estándar (This month, Last month, This fiscal year…) | Excel, PDF, imprimir, email | Fila **TOTAL** | **Sí**: *Save customization*, grupos de reportes y **email programado** (adjunta Excel) |
| **Jane App** (clínicas) | *Sales Report* (por factura), *Billing Summary*, *Applied & Unapplied Payments* | Por factura → payer (paciente/aseguradora), tipo (tratamiento/producto), estado, staff; por ítem en *Product Performance* | Invoice, payer, type, status Paid/Unpaid, subtotal, taxes, total | Rango | CSV / Excel ("⋯ → Export") | Distingue **Invoiced vs Applied**: facturado en el periodo vs. cobrado aplicado en el periodo | No |
| **Cliniko** (clínicas) | *Payments summary*, *Daily payments*, *Revenue by raised/closed invoices*, *Practitioner performance* | Método de pago (cash, card, HICAPS…), practicante, tipo de ítem (producto/servicio/otro) | Totales tax-incl. y tax-excl., descuentos | Día o rango | CSV; **Print → guardar como PDF** | "Total revenue" con incl./excl. de impuesto | No |
| **Open Dental** (dental) | *Production and Income*: Daily / Monthly / Annual / Provider | Día, mes, proveedor; el *Daily* lista transacciones | Production (gross/net), Adjustments, Write-offs, Income (patient + insurance) | Botones **Today / This Month / This Year** + flechas ±1 día/mes | Print preview, export (Complex Report System) | "Total Income", "Net Production" | No (reporte estándar con filtros) |
| **Dentrix** (dental) | *Day Sheet (Charges and Receipts)* y *Practice Analysis → Production Summary por código* | Cronológico / alfabético / seguro; por código de procedimiento | Day Sheet: fecha, paciente, descripción, cargo/abono, proveedor. Production Summary: **cantidad, producción total, honorario promedio, % del total** | Rango; se corre "al cierre de cada día" | Impresión | "Grand Totals" | No |
| **SimplePractice** (salud mental) | *Income allocation*, *Income received*, *Appointment status* | Clínico; productos vs citas; aseguradora | Payments, dates of service, allocations | Pay periods / rango | CSV, XLSX (solo plan Plus para allocation) | Total revenue allocated | No |

**Lectura transversal**

- **Grupo + tres columnas** es el estándar: *Descripción · Cantidad · Importe*. Cuando hay cuarta columna es **promedio** (QuickBooks "Avg Price", Dentrix "average fee") o **% del total** (QuickBooks, Dentrix). El "Precio" del pedido de la doctora se resuelve como promedio (sección 3c).
- **Todos etiquetan el impuesto.** Square/Toast separan gross/net y "taxes"; Cliniko imprime tax-incl./excl.; Jane subtotal + taxes. Un reporte que no dice si incluye IGV es un reporte que la contadora tiene que reprocesar.
- **La fecha del dinero se declara.** Jane (Invoiced vs Applied) y Open Dental (Production vs Income) hacen explícita la diferencia servicio/cobro. Yenda ya tomó partido en Financiero desde la mig 251: **caja** (fecha de cobro).
- **Devoluciones visibles.** Square y Toast muestran *Refunds* como línea propia entre gross y net; Dentrix las lleva como abonos en el Day Sheet. Nadie las esconde dentro del total.
- **Guardar/programar es minoría**: solo Square (custom reports) y QuickBooks (save + email). En clínicas nadie lo tiene. Es V2.

### 1.2 Fuentes (extractos de documentación oficial vía buscador)

- Square: [Sales summary / trends / payment methods](https://squareup.com/help/us/en/article/5381-in-app-summaries-and-reports) · [Item, category, modifier sales](https://squareup.com/help/us/en/article/8363-view-item-category-and-modifiers-sales-reports) · [Print, export or email reports](https://squareup.com/help/us/en/article/8362-print-export-or-email-your-reports) · [Create custom reports](https://squareup.com/help/us/en/article/6104-creating-custom-reports-in-the-online-dashboard)
- Toast: [Sales Summary Report Overview](https://support.toasttab.com/en/article/Sales-Summary-Report) · [Sales Summary FAQ](https://support.toasttab.com/en/article/Sales-Summary-FAQ) · [Daily/Weekly Performance Email FAQ](https://support.toasttab.com/en/article/Weekly-Performance-Summary-Email-FAQs) · [Comunidad: schedule reports](https://community.toasttab.com/t5/back-office-team/schedule-reports-to-be-automatically-emailed/td-p/15927)
- Lightspeed: [Using the sales summary report (X-Series)](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534089010715-Using-the-sales-summary-report) · [Exporting reporting data](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534147956123-Exporting-your-reporting-data-from-Retail-POS-X-Series) · [Sales by Item (S-Series)](https://shopkeep-support.lightspeedhq.com/hc/en-us/articles/47442968135067-Sales-by-Item-Report)
- QuickBooks: [Use reports to see your sales and inventory status](https://quickbooks.intuit.com/learn-support/en-us/help-article/report-management/use-reports-see-sales-inventory-status/L7ocoLmqP_US_en_US) · [Columnas fijas del summary (comunidad)](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/change-columns-for-sales-by-product-service-summary-report/00/1286833) · [Customize reports](https://quickbooks.intuit.com/learn-support/en-us/help-article/customize-reports/customize-reports-quickbooks-online/L0gKmSawG_US_en_US) · [Set schedule and email for custom reports](https://quickbooks.intuit.com/learn-support/en-us/help-article/email-reports/set-schedule-email-information-memorized-report/L0pQ4ifGJ_US_en_US). *No verificado en doc oficial*: que los importes del summary sean sin impuesto (es lo habitual en QBO, pero el extracto no lo afirma).
- Jane: [Sales Report](https://jane.app/guide/reporting/sales-report) · [Billing Summary Report](https://jane.app/guide/billing-summary-report) · [Applied & Unapplied Payments Report](https://jane.app/guide/applied-unapplied-payments-report) · [Exporting reports](https://jane.app/guide/exporting-reports-and-customizing-them-in-excel)
- Cliniko: [View a summary of all payments](https://help.cliniko.com/en/articles/2009509-view-a-summary-of-all-payments) · [View daily payments](https://help.cliniko.com/en/articles/1887439-view-daily-payments) · [See your total practice revenue](https://help.cliniko.com/en/articles/2026119-see-your-total-practice-revenue) · [Understanding report figures](https://help.cliniko.com/en/articles/11203202-understanding-report-figures) · [Export your data (CSV)](https://help.cliniko.com/en/articles/1023831-export-your-data)
- Open Dental: [Production and Income Reports](https://www.opendental.com/manual/reportprodinc.html) · [Production and Income (definiciones)](https://opendental.com/manual/productionincome.html)
- Dentrix: [Running the Day Sheet Report](https://www.dentrix.com/articles/show/67) · [5 Dentrix Reports Every Office Should Use](https://magazine.dentrix.com/5-dentrix-reports-every-office-should-use/) · [Day sheet (charges and receipts) — ayuda](https://hsps.pro/DentrixEnterprise/Help_11.0.48/mergedProjects/Guides/Reports_Reference/Day_sheet_(charges_and_receipts).htm)
- SimplePractice: [Income allocation report](https://support.simplepractice.com/hc/en-us/articles/25261326781581-Navigating-the-Income-allocation-report) · [Exporting your reports](https://support.simplepractice.com/hc/en-us/articles/46494400564237-Exporting-your-reports) · [Understanding your income reports](https://support.simplepractice.com/hc/en-us/articles/13218358379021-Understanding-your-income-reports)

---

## 2. Table stakes vs. extras

### Sí o sí en V1 (sin esto parece pobre frente a cualquiera de arriba)

| Requisito | Por qué (problema de la doctora) | Referencia |
|---|---|---|
| Presets **Hoy · Ayer · Esta semana · Este mes · Mes anterior · Rango**, "hoy" en zona horaria de la org (`useOrgToday()`) | La contadora trabaja con el mes cerrado; la doctora con hoy/ayer. `/reports` hoy calcula presets con `new Date()` del navegador (`app/(dashboard)/reports/page.tsx:170-183`), no con la tz de la org. | Toast, Open Dental, QuickBooks |
| Checks de sección con **subtotal por sección** y **TOTAL FINAL** | Es literalmente el pedido; todos los productos muestran subtotal por grupo y total. | QuickBooks, Dentrix |
| Columnas **Descripción · Cantidad · Precio prom. · Total** con definición impresa de "Cantidad" | Sin definición, "Cantidad" se lee como citas en una sección y como unidades en otra (sección 3c). | QuickBooks Avg Price, Dentrix average fee |
| Banner fijo: **"Montos cobrados, brutos, IGV incluido. Criterio: fecha de cobro."** | La contadora necesita saber que no es base imponible ni facturación SUNAT (`docs/mapa-del-dinero.md` §10: cobrar ≠ emitir comprobante). | Cliniko incl./excl., Square gross/net |
| Línea de **conciliación** contra Financiero ("= Cobrado total S/ X + Cobros por tratamientos S/ Y") | Evita el clásico "en la otra pantalla sale otro número" (sección 3a). | Jane Invoiced vs Applied |
| **PDF con membrete** (logo, razón social, RUC) e **Excel** | "Para ella y su contadora": el PDF se entrega, el Excel se pega en el libro. | Square PDF, QuickBooks Excel/PDF, Cliniko print→PDF |
| Secciones **ocultas según módulo** (Farmacia solo con addon `almacen`; Tratamientos solo con fertilidad) y **sin filas vacías** | Una clínica sin farmacia no debe ver "FARMACIA S/ 0,00". Financiero ya filtra cubetas con monto 0 (`financial-report.tsx:180`). | — |
| Impresión desde navegador (`window.print`) además del PDF | Farmacia ya lo hace así (`day-sales-tab.tsx:347`); es lo que la recepción usa a las 7 pm. | Cliniko |

### Claramente V1.1 / V2 (no hace falta para ser digno)

| Extra | Cuándo | Quién lo tiene |
|---|---|---|
| Desglose **por método de pago** (efectivo / electrónico / otro; Yape, tarjeta…) | V1.1 — datos ya en `patient_payments.tender_kind` / `payment_method` (mig 213) | Square, Cliniko, Toast |
| Filtro / columna **por doctor** | V1.1 — solo aplica a Servicios y Adelantos (los cobros de farmacia no tienen doctor) | Cliniko practitioner, Open Dental Provider, SimplePractice |
| **Comparar con periodo anterior** (Δ y %) | V2 — el RPC de IA (`get_report_metrics_for_ai`) ya calcula periodo anterior, pero mezclar dos periodos en un documento para la contadora confunde más de lo que ayuda | Square, QuickBooks |
| **% del total** por fila | V1.1 — una columna barata; útil para la dueña, ruido para la contadora | QuickBooks, Dentrix |
| **Guardar configuración** ("mi reporte mensual") | V1.1 en localStorage por usuario; V2 en base | Square Custom reports, QuickBooks |
| **Email programado** a la contadora | V2 — solo cuando el PDF mensual se use dos meses seguidos | QuickBooks |
| **Columnas configurables**, gráficos | V2+ / nunca. Es un documento, no un dashboard: Financiero ya tiene los gráficos. | Square |
| Detalle **por cita / por venta** (drill-down) | V2 — Farmacia ya imprime su listado por venta (`PrintReport` en `day-sales-tab.tsx`); Dentrix Day Sheet | Dentrix, Open Dental Daily |

---

## 3. Errores clásicos y cómo evitarlos aquí

### 3a. Dos pantallas, dos totales para el mismo periodo

**Riesgo concreto.** Este reporte convivirá con "Cobrado total" (`totals.payments_amount`) y "Cobros por tratamientos" (`totals.treatment_payments_amount`) de Financiero. Si el nuevo reporte agrupa con su propio SQL (otro filtro de fecha, otro tratamiento de `source`, otro manejo de anuladas), el TOTAL FINAL diferirá en cuanto entre un adelanto, una anulación o un pago de las 19:30 (UTC vs Lima).

**Regla propuesta: las secciones SON las cubetas.** El RPC `get_reports_overview` (mig 250, `supabase/migrations/250_reports_pending_and_collected_breakdown.sql:70-88`) ya clasifica cada cobro del rango por `payment_date` en `pharmacy · treatments · period_appointments · other_appointments · plans · other`. Las secciones del pedido mapean 1:1:

| Sección del pedido | Cubeta(s) mig 250 | Subtotal debe ser igual a |
|---|---|---|
| SERVICIOS | `period_appointments` | Financiero "Facturado por citas" (= Σ `doctors[].collected`, mig 251) |
| ABONOS Y SERVICIOS FUTUROS | `other_appointments` + `plans` + `other` | Desglose de Cobrado total: "Adelantos y otras fechas" + "Planes de tratamiento" + "Sin cita asociada" |
| FARMACIA | `pharmacy` (ver 3e: anuladas) | Desglose "Farmacia" y Farmacia › "Total del día" |
| PAGOS POR TRATAMIENTOS | `treatments` | Financiero "Cobros por tratamientos" |
| TOTAL FINAL | Σ de todo | "Cobrado total" + "Cobros por tratamientos" |

**Cómo se materializa.** Un RPC nuevo `get_period_collections_detail(p_from, p_to)` que reutilice *literalmente* el CTE `range_payments` de la mig 250 (misma clasificación) y solo añada el `GROUP BY` por servicio / concepto / producto. Y el reporte imprime, al pie, la conciliación con los totales de `get_reports_overview` en la misma llamada de pantalla: si no cuadran, se muestra un aviso ("no cuadra con Financiero por S/ X") en lugar de fingir. Eso convierte el error clásico en un test permanente.

**Un detalle de fechas.** Farmacia agrupa por `sale_date` (mig 232) y Financiero por `payment_date`; `pharmacy_confirm_sale` los alinea (comentario mig 232: "alinea movement_date, payment_date y sale_date"), pero el reporte debe usar **una sola** columna de fecha para las cuatro secciones: `payment_date`.

### 3b. Bruto/neto e impuestos

- **Todo el reporte es bruto, con IGV, como se cobra** (`CLAUDE.md`, "Regla de oro IGV"). No hay que dividir nada entre 1,18 en este documento: sería "ganancia/utilidad" y ese número vive en Almacén › Rentabilidad.
- **Pero la contadora debe leerlo en el encabezado**, no descubrirlo: banner "Montos cobrados brutos (IGV incluido). No es base imponible ni comprobantes emitidos a SUNAT". Referencia: Cliniko imprime tax-incl./excl.; Square separa taxes.
- **Nota IGV informativa, sin recalcular**: para Farmacia la venta ya guarda `subtotal_taxed / subtotal_exempt / subtotal_unaffected / igv_amount` (`216_pharmacy_module.sql:71-77`), así que "de los cuales IGV S/ X" sale de una suma, no de una fórmula nueva. Para Servicios existe `services.igv_affectation` (mig 108) y para tratamientos `treatment_payment_concepts.igv_affectation` (mig 242); en V1 basta con imprimir "gravado / exonerado" como etiqueta, sin montos netos.
- **"Cobrado" ≠ "Facturado a SUNAT"**: `docs/mapa-del-dinero.md` §10 lo deja claro. Si la contadora pide "lo facturado", eso es `get_einvoices_kpis` (Emitido en el período), no este reporte. Vale una línea al pie: "Comprobantes electrónicos emitidos en el periodo: S/ X (ver Facturación)" para orgs con el módulo.

### 3c. "Cantidad" ambigua — definición por sección

| Sección | Fila (Descripción) | **Cantidad** | **Precio** (rotular "Prom.") | **Total** | Fuente |
|---|---|---|---|---|---|
| SERVICIOS | `services.name` de la cita (snapshot "Sin servicio" si falta) | **Citas cobradas**: `COUNT(DISTINCT appointment_id)` de cobros clínicos del rango sobre citas del rango. Una cita con dos pagos cuenta 1. | Total ÷ Cantidad (**promedio cobrado por cita**, no precio de lista) | Σ `amount` (bruto) | `patient_payments` ⋈ `appointments` ⋈ `services`, cubeta `period_appointments` |
| ABONOS Y SERVICIOS FUTUROS | 3–4 filas fijas: "Adelantos de citas futuras" (cita después del rango), "Pagos de citas de fechas anteriores" (cita antes del rango), "Abonos a planes de tratamiento", "Abonos sin cita asociada" | **Nº de cobros** (filas de `patient_payments`) | Total ÷ Cantidad | Σ `amount` | cubetas `other_appointments` (partida por `appointment_date` vs rango), `plans`, `other` |
| FARMACIA | `pharmacy_sale_items.description` (snapshot del nombre; los servicios vendidos por POS se marcan "(servicio)") | **Unidades**: Σ `quantity` (numeric 12,3: puede ser fraccionaria, imprimir hasta 3 decimales solo si no es entero) | `unit_price` si fue único en el rango; si hubo varios precios, Total ÷ Cantidad y asterisco "precio promedio" | Σ `line_total` (ya neto de `line_discount`) | `pharmacy_sale_items` ⋈ `pharmacy_sales` con `status='confirmada'` y fecha en rango |
| PAGOS POR TRATAMIENTOS | `treatment_payment_concepts.label` (Honorarios médicos, Laboratorio, …) | **Nº de cobros** | Total ÷ Cantidad | Σ `amount` | `patient_payments.treatment_id IS NOT NULL` ⋈ `treatment_payment_concepts` |
| TOTAL FINAL | — | — | — | Σ de los cuatro subtotales | = `payments_amount` + `treatment_payments_amount` |

Por qué "Precio" = promedio y no precio de lista: con precio de lista (`services.base_price`) la fila no cuadra en cuanto hay un descuento, un precio pactado (`price_snapshot`) o un pago parcial, y la contadora hace la multiplicación a mano y encuentra el "error". QuickBooks (Avg Price) y Dentrix (average fee) hacen exactamente esto. **Invariante impresa: Cantidad × Precio prom. = Total (redondeado)**.

Casos borde que hay que decidir, no improvisar:
- Cita con dos servicios/"pagos añadidos a la cita" (tooltip de Financiero: "incluidos los pagos añadidos a la cita"): todos los cobros de la cita van bajo el servicio de la cita. Es una aproximación honesta y coincide con "Facturado por citas".
- Cita cobrada parcialmente en el periodo: cuenta 1 con el importe cobrado. Es caja, no producción; la producción por servicio ya existe en Operacional › "Ingresos por servicio" (`services[].revenue`) y **no debe mezclarse** (mapa del dinero §4 lo llama "la única cifra que sigue midiendo precio").
- Cantidad de farmacia fraccionaria (0,5 frasco): mostrar "0,5", nunca redondear a 1.

### 3d. Fecha de cobro vs. fecha de servicio

- Este reporte mide **fecha de cobro** (`payment_date`), igual que Financiero desde la mig 251 y que el Dashboard (mapa del dinero §1, §4). Se declara en el banner: "Criterio: fecha de cobro".
- La sección "ABONOS Y SERVICIOS FUTUROS" existe precisamente por esta elección: es la respuesta a "cobré en agosto una cita de septiembre". Es el equivalente exacto de Jane *Applied vs Invoiced* y de Open Dental *Income vs Production*.
- Recomiendo **no** ofrecer un conmutador "por fecha de atención" en V1: duplicaría "Ingresos por servicio" de Operacional y abriría de nuevo la puerta al negativo de la mig 250 (Pendiente −4 510 del 7-sep). Si la doctora lo pide, V2 con nombre distinto ("Producción por servicio").
- Sugerencia de rotulado: cambiar "SERVICIOS FUTUROS" por **"Adelantos y abonos"**: la cubeta `other_appointments` también trae pagos **atrasados** de citas pasadas, que no son "futuros". Partirla en dos filas (futuras / anteriores) cuesta un `CASE` sobre `appointment_date`.

### 3e. Devoluciones y anulaciones

Estado real en el repo (leído, no supuesto):

| Evento | Con Caja activa | Sin Caja | Lo ve Dashboard | Lo ve `/reports` (mig 250/251) | Lo ve Farmacia › Ventas del día |
|---|---|---|---|---|---|
| Cancelar cita con pagos (`appointment_cancel_refund`, mig 230) | `cash_movements` tipo `devolucion` con monto negativo; **el pago original no se toca** | **DELETE / reducción** de los pagos más recientes | Neteado (v3 resta `devolucion`) | **No neteado** (solo suma `patient_payments`) | n/a |
| Anular venta POS (`pharmacy_void_sale`, mig 232) | `cash_movements` `devolucion` de `-total`; la fila `patient_payments` `source='pos'` **se conserva** | Nada en dinero (solo stock); el pago **se conserva** | Neteado solo si hay Caja | **Incluye la anulada** en la cubeta Farmacia | Excluida (`status='confirmada'`) |

Consecuencias para el nuevo reporte:
1. **FARMACIA debe construirse desde `pharmacy_sales`/`pharmacy_sale_items` con `status='confirmada'`**, no desde `patient_payments` — es la única forma de agrupar por producto y de excluir anuladas. Entonces su subtotal **no** coincidirá con la cubeta `pharmacy` de Financiero cuando haya anuladas. Hay que decir en el pie: "Ventas anuladas en el periodo: n · S/ X (excluidas)". Y elevar al dueño del dinero la corrección de la cubeta en `get_reports_overview` (excluir `source='pos'` cuya venta esté `anulada`), que es un bug preexistente, no de esta feature.
2. **Devoluciones de citas**: en V1 el TOTAL FINAL es *bruto cobrado* y debajo va una línea informativa "Devoluciones registradas en Caja en el periodo: −S/ X" (Σ `cash_movements.movement_type='devolucion'` por fecha), **sin restarla** del total, porque hoy Financiero tampoco la resta y se rompería la conciliación 3a. Decidir con la contadora en V1.1 si el documento debe cerrar en neto (entonces Financiero cambia a la vez: un número, una fórmula).
3. Nunca filas negativas ni pagos negativos (línea roja de la mig 230). Devolución = línea propia, como Square/Toast "Refunds".

---

## 4. Nombre y posicionamiento

"Reporte personalizado" describe el mecanismo (checks), no lo que la contadora recibe. Tres candidatos:

| Nombre | A favor | En contra |
|---|---|---|
| **Resumen de cobros del periodo** | "Cobros" es la palabra exacta de la casa (mapa del dinero: cobrado, no facturado ni ingresos); "resumen" es lo que la doctora pidió ("todo sintetizado"); "del periodo" ata al selector de fechas. La contadora lo entiende sin explicación: es caja, no libro de ventas. | Menos sexy que "personalizado". |
| Cierre de cobros | Rima con "Cierre de ventas" de Farmacia y con el uso diario a las 7 pm. | Suena a un día, no a un mes; "cierre" en Perú evoca arqueo/caja (ya existe Caja). |
| Reporte para contabilidad | Audiencia clarísima. | Promete lo que no es: la contadora espera comprobantes/base imponible y esto es caja bruta. Riesgo de reclamo. |

**Elegido: "Resumen de cobros del periodo"** (pestaña: "Resumen de cobros"). Subtítulo en pantalla e impreso: *"Lo que entró en el periodo, agrupado por concepto. Montos brutos con IGV, por fecha de cobro."*

**Frente a Financiero, para que no parezcan duplicados:**
- Financiero = **tablero** para la dueña: tarjetas, gráficos, productividad por doctor, pendiente por cobrar, IA. Responde "¿cómo va la clínica?".
- Resumen de cobros = **documento** para entregar: tablas por concepto, sin gráficos, con membrete, subtotales y TOTAL. Responde "¿de qué es cada sol que entró?".
- Están enlazados, no repetidos: en la tarjeta "Cobrado total" de Financiero, el panel "De dónde viene" (`financial-report.tsx:254-268`) gana un enlace "Ver detalle por concepto →" que abre el Resumen con el mismo rango; y el Resumen imprime la conciliación "Coincide con Financiero › Cobrado total + Cobros por tratamientos".
- No hay "Pendiente por cobrar" en el Resumen: es un reporte de dinero que entró, no de deuda.

---

## 5. Valor añadido a coste casi cero (ordenado por valor/coste)

1. **Conciliación impresa con Financiero (coste ≈ 0).** Misma llamada a `get_reports_overview` que ya hace `/reports`; el pie imprime "TOTAL = Cobrado total S/ X + Cobros por tratamientos S/ Y" y avisa si difiere. *Resuelve:* "en la otra pantalla me sale otro número", el error que ya costó el −4 510 del 7-sep.
2. **PDF con membrete real vía el motor existente (coste: una plantilla `.hbs` + una ruta).** `lib/pdf/html/chromium.ts` (`htmlToPdfBuffer`), partials `head`/`sheetHead`/`pageFooter`/`styles` (`table.grid` con `tfoot` en color de marca, `tabular-nums`, helper `money` en formato es-PE) ya imprimen receta, orden de examen y presupuesto con logo, razón social, RUC y pie repetido por hoja. Copiar el patrón de `app/api/pdf/exam-order/[orderId]/route.tsx` → `/api/pdf/period-summary?from&to&sections=`. *Resuelve:* un documento que la contadora puede archivar y atribuir a la clínica; evita el PDF-captura de `exportContentPDF` (html2canvas de un tema oscuro, borroso y sin datos legales), que además hoy no está montado.
3. **Excel con `exportReportExcel` (coste ≈ 0).** `lib/report-export.ts:130` ya escribe hoja "Resumen" + una hoja por tabla a partir de `ReportExportConfig {kpis, tables}`; solo hay que construir el config con las secciones marcadas. *Resuelve:* la contadora pega cifras en su libro sin retipear.
4. **Nota IGV sin fórmulas nuevas (coste bajo).** Farmacia: Σ `pharmacy_sales.igv_amount` y subtotales por afectación ya almacenados. Servicios/tratamientos: etiqueta gravado/exonerado desde `services.igv_affectation` / `treatment_payment_concepts.igv_affectation`. *Resuelve:* la contadora sabe qué parte del bruto lleva IGV sin que Yenda "calcule" nada que contradiga la regla de oro.
5. **Presets Ayer / Mes anterior con `useOrgToday()` (coste trivial).** `hooks/use-org-today.ts` ya existe; `/reports` sigue usando `new Date()` del navegador. *Resuelve:* "hoy" correcto a las 19:30 y el cierre mensual sin picar fechas.
6. (Bonus, orgs con facturación) **Línea "Comprobantes emitidos en el periodo"** con `get_einvoices_kpis` (mig 199). *Resuelve:* la primera pregunta de cualquier contadora peruana ("¿y lo facturado?") y hace visible que cobrar ≠ emitir.

Lo que **no** añadiría aunque sea barato: el resumen IA (`/api/ai-reports`) dentro del documento. Tiene cupo mensual por plan y un prompt que ya debe esquivar "rentabilidad"; en un documento para contabilidad, texto generado resta credibilidad.

---

## 6. Roadmap

| Fase | Alcance | Datos / piezas del repo | Validar con la doctora antes de la siguiente fase |
|---|---|---|---|
| **V1** (documento digno) | Pestaña "Resumen de cobros" en `/reports`; presets Hoy/Ayer/Esta semana/Este mes/Mes anterior/Rango (tz org); checks por sección con gating por addon (`almacen`, `fertility_*`); 4 tablas Descripción·Cantidad·Prom.·Total con subtotal; TOTAL FINAL; banner bruto/IGV/fecha de cobro; conciliación con Financiero; línea informativa de devoluciones y anuladas; PDF con membrete (motor Chromium) + `window.print` + Excel. Sin gráficos. | RPC nuevo `get_period_collections_detail` clonando el CTE `range_payments` (mig 250) + GROUP BY; `pharmacy_sale_items` para farmacia; `treatment_payment_concepts` para conceptos; `get_reports_overview` para conciliar; `lib/pdf/html/*`; `exportReportExcel`. Visibilidad del desglose de tratamientos con la misma regla que `get_treatments_overview` (`v_sees_fees`: owner/admin). | (1) ¿"Precio" como promedio le sirve o quiere precio de lista aparte? (2) ¿Le basta "Servicios" = lo cobrado, o extraña "lo atendido"? (3) ¿La contadora quiere el total bruto o neto de devoluciones? (4) ¿Imprime a diario (Hoy) o solo mensual? Medir: nº de PDFs generados por org en 4 semanas. |
| **V1.1** (afinado con uso real) | Desglose por método de pago (efectivo/electrónico/otro y método literal) como sección opcional; columna "% del total"; partir "Adelantos" en futuras/anteriores y, si se pide, por servicio de la cita futura; filtro por doctor (solo Servicios/Adelantos); recordar la última selección de secciones (localStorage); enlace desde la tarjeta "Cobrado total" de Financiero; corregir la cubeta Farmacia de Financiero (excluir anuladas) y decidir neteo de devoluciones **en ambas pantallas a la vez**. | `tender_kind`/`payment_method` (mig 213); `cash_movements` `devolucion`; `appointments.doctor_id`. | ¿La contadora concilia contra extracto bancario/Yape (→ método de pago vale) o contra caja física (→ Caja ya lo cubre)? ¿Alguien usó el filtro por doctor? |
| **V2** (automatización) | Plantillas guardadas por org ("Reporte mensual contadora"); envío programado por email (PDF+Excel) con cron existente; comparación con periodo anterior como columna opcional; detalle por cita/venta (drill-down) tipo Day Sheet; producción por servicio por fecha de atención como reporte hermano con otro nombre. | `app/api/cron/*` patrón existente; `get_report_metrics_for_ai` ya trae periodo anterior. | Solo si el PDF mensual se generó ≥2 meses seguidos en ≥3 orgs. Si no, V2 es humo. |

---

## 7. Preguntas para el founder (con recomendación)

1. **¿"Precio" es precio de lista o promedio cobrado?** *Recomiendo promedio (Total ÷ Cantidad), rotulado "Prom."*: es lo que hacen QuickBooks y Dentrix y es la única forma de que Cantidad × Precio = Total con descuentos, precios pactados y pagos parciales. Si la doctora quiere ver el precio de lista, va como columna extra en V1.1, nunca en lugar del promedio.
2. **¿SERVICIOS mide lo cobrado (caja) o lo atendido (producción)?** *Recomiendo caja*, igual que Financiero desde la mig 251 (fue decisión de la propia clínica: "quiere ver cuánto entró"). La producción por servicio ya existe en Operacional y mezclarlas resucita el negativo del 7-sep.
3. **¿El TOTAL FINAL es bruto o neto de devoluciones/anulaciones?** *Recomiendo V1 bruto con línea informativa de devoluciones y anuladas, sin restar*, porque Financiero hoy tampoco resta y deben cuadrar. Decidir el neteo con la contadora en V1.1 y cambiar las dos pantallas juntas. Aparte: la cubeta Farmacia de Financiero incluye ventas anuladas (mig 232 conserva el pago); hay que arreglarlo en `get_reports_overview`, no en este reporte.
4. **¿Quién puede ver el desglose de tratamientos por concepto (honorarios)?** *Recomiendo el mismo gate que `get_treatments_overview` (owner/admin ven honorarios/terceros; el resto solo el subtotal)*. Un reporte imprimible que revele honorarios a recepción es una fuga.
5. **¿Nombre?** *Recomiendo "Resumen de cobros del periodo"* (pestaña "Resumen de cobros"), con el subtítulo de la sección 4. "Personalizado" describe los checks, no el contenido, y la contadora no sabrá qué es.
6. **¿PDF por el motor Chromium con membrete o captura de pantalla?** *Recomiendo el motor Chromium* (`lib/pdf/html`): coste de una plantilla, resultado con RUC/razón social/logo y tablas de verdad. La captura (`exportContentPDF`) ni siquiera está montada hoy y saldría en tema oscuro. Mismo motivo por el que la receta y el presupuesto ya no se hacen por captura.

---

## Anexo A. Mapa de datos por sección (para quien implemente)

| Sección | Tablas | Filtro | Agrupa por | Columnas |
|---|---|---|---|---|
| SERVICIOS | `patient_payments pp` ⋈ `appointments a` ⋈ `services s` | `pp.payment_date ∈ [from,to]`, `COALESCE(pp.source,'clinical')='clinical'`, `pp.treatment_id IS NULL`, `a.appointment_date ∈ [from,to]` | `s.name` | `COUNT(DISTINCT a.id)`, `SUM(pp.amount)`, prom. = SUM/COUNT |
| ADELANTOS Y ABONOS | `patient_payments` (⋈ `appointments` para la fecha; `treatment_plan_id` para planes) | mismos de arriba salvo que la cita **no** está en el rango, o no hay cita | 4 filas fijas (`CASE`: cita futura / cita anterior / plan / sin cita) | `COUNT(*)`, `SUM(amount)` |
| FARMACIA | `pharmacy_sale_items i` ⋈ `pharmacy_sales sl` | `sl.status='confirmada'`, `sl.sale_date ∈ [from,to]` (verificar igualdad con `payment_date` del pago enlazado), addon `almacen` activo | `i.description` (+ marca si `service_id` no nulo) | `SUM(i.quantity)`, `SUM(i.line_total)`, prom. = SUM/SUM; pie: `COUNT` y `SUM(total)` de `status='anulada'` |
| TRATAMIENTOS | `patient_payments pp` ⋈ `treatment_payment_concepts c` | `pp.treatment_id IS NOT NULL`, `COALESCE(source,'clinical')='clinical'`, fecha en rango, addon fertilidad | `c.label` (ordenar por `c.display_order`) | `COUNT(*)`, `SUM(amount)`; honorarios visibles solo con el gate de la mig 245 |
| Conciliación | `get_reports_overview(from,to)` | — | — | `totals.payments_amount`, `totals.treatment_payments_amount`, `totals.collected_breakdown.*` |
| Devoluciones (informativo) | `cash_movements` | `movement_type='devolucion'`, fecha en rango | — | `SUM(amount)` (ya negativo) |

Invariantes que un test debería afirmar: Σ SERVICIOS = `collected_breakdown.period_appointments`; Σ ADELANTOS = `other_appointments + plans + other`; Σ TRATAMIENTOS = `treatment_payments_amount`; Σ FARMACIA = `collected_breakdown.pharmacy` − pagos de ventas anuladas (hasta que se corrija la cubeta).

## Anexo B. Hallazgos del repo que condicionan la feature

- `app/(dashboard)/reports/export-menu.tsx` y `lib/report-export.ts` no se usan desde ninguna página (grep en `app/`, `components/`, `hooks/`, `lib/`): los cuatro reportes exponen `getExportConfig` por `ref` pero `reports/page.tsx` no pasa `ref` ni renderiza `ExportMenu`. El export de `/reports` está desconectado.
- `reports/page.tsx:97-98,170-183`: rango inicial y presets con `new Date()` del navegador; la regla de la casa es `useOrgToday()` (`hooks/use-org-today.ts`).
- `get_reports_overview` (mig 250/251) no netea `cash_movements` `devolucion`; `get_admin_dashboard_stats_v3` (mig 230) sí. Ya está documentado como "miden cosas distintas" en `docs/mapa-del-dinero.md`, pero para un documento de contabilidad hay que elegir.
- `pharmacy_void_sale` (mig 232, `supabase/migrations/232_pharmacy_sale_date.sql:375-545`) no elimina ni marca la fila `patient_payments` de la venta anulada → la cubeta `pharmacy` de Financiero y "Ingresos" del Dashboard sin Caja la cuentan como cobro pleno; `pharmacy_day_summary` (misma migración, líneas 563-631) la excluye.
- Motor PDF reutilizable: `lib/pdf/html/chromium.ts`, `render.ts` (helpers `money`, `longDate`, `shortDate`), partials en `lib/pdf/html/partials/` (`sheetHead` = membrete con logo/razón social/RUC/dirección/contacto; `pageFooter`; `styles` con `table.grid` y `tfoot` en color de marca), datos de org en `lib/pdf/html/org.ts`. Patrón de ruta: `app/api/pdf/exam-order/[orderId]/route.tsx`.
- Farmacia ya imprime "Cierre de ventas" por venta (`app/(dashboard)/farmacia/day-sales-tab.tsx:710-820`) con CSV y `window.print`; el nuevo reporte agrupa por producto, que hoy no existe en ninguna pantalla.
- Conceptos de tratamiento: `treatment_payment_concepts (key, label, revenue_bucket honorarium|general|third_party, igv_affectation, display_order)` (mig 242); `patient_payments.treatment_concept_id` + snapshot `revenue_bucket`. `get_treatments_overview` (mig 245) agrega por bucket, no por concepto, y oculta honorarios a quien no es owner/admin (`v_sees_fees`).
- Métodos de pago: configurables por org en `lookup_values` (iconos en `lib/payment-icons.ts`); `tender_kind` ∈ efectivo/electronico/otro (mig 213) es lo que cuadra contra Caja.
