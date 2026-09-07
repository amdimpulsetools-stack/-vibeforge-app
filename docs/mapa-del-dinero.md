# Mapa del dinero en Yenda

> Qué número muestra cada pantalla y de dónde sale exactamente.
> Verificado contra los RPC de producción el 2026-09-07.
> Fuente de verdad del código: `lib/patient-debt.ts`, `lib/treatments/money.ts`,
> `get_patient_summary`, `get_admin_dashboard_stats_v3`, `get_reports_overview`,
> `get_treatments_overview`, `caja_shift_summary`, `pharmacy_day_summary`,
> `get_einvoices_kpis`.

## Las tres reglas de la casa

1. **Un cobro = una fila.** Todo el dinero que entra se guarda en `patient_payments`
   con: fecha de pago, monto, método, **origen** (clínica o farmacia) y **a qué
   pertenece** (una cita *o* un plan *o* un tratamiento — nunca dos a la vez).
2. **Precio real de una cita** = precio pactado (o el del catálogo si no se pactó
   otro) − descuento, y nunca menos de cero.
3. **Bruto vs. neto.** Todo lo que se cobra se muestra **bruto** (con IGV, como se
   cobra). Solo la **ganancia** se calcula **neta** (÷ 1,18 si el producto es
   gravado). Nunca al revés.

"Hoy" es el día civil de la zona horaria de la organización, no la del servidor.

---

## 1. Dashboard (dueño / administrador)

| Tarjeta | Fórmula |
|---|---|
| **Ingresos** (hoy / semana / mes) | Σ de **todos los cobros** cuya *fecha de pago* cae en el periodo − devoluciones. Incluye consultas, farmacia y tratamientos. |
| **Deuda pendiente** (hoy / semana / mes) | Por cada cita no cancelada del periodo: precio de la cita − cobros clínicos de esa cita. Se suman solo los saldos positivos. |
| **Pacientes con deuda** | Cuántos pacientes distintos tienen al menos una cita con saldo. |
| **Meta del mes** | El número que la clínica configuró en Ajustes (`monthly_revenue_goal`). |

Es una foto de **caja**: cuenta el dinero el día que entra, no el día que se
atendió al paciente.

## 2. Dashboard del doctor

| Tarjeta | Fórmula |
|---|---|
| **Ingresos del mes** | Σ de los cobros hechos este mes **sobre citas de ese doctor**. No incluye farmacia ni tratamientos (esos no cuelgan de una cita). |

## 3. Dashboard de recepción

| Tarjeta | Fórmula |
|---|---|
| **Mis cobros de hoy** | Σ de los cobros que **ese usuario** registró hoy, solo de clínica (nunca farmacia). Bruto. |
| **Pendiente de cada cita del día** | Precio de la cita − cobros clínicos de esa cita. |

## 4. Reportes › Financiero

| Tarjeta | Fórmula |
|---|---|
| **Total facturado** | Σ del precio de las citas **atendidas + confirmadas** del rango. No cuenta programadas ni canceladas. |
| **Total cobrado** | Σ de los cobros del rango que **no son de tratamiento**. |
| **Pendiente** | Total facturado − Total cobrado. |
| **Cobros por tratamientos** | Σ de los cobros de tratamientos del rango. Va aparte, nunca dentro de "Pendiente". |
| **Facturado por doctor** | Σ del precio de las citas atendidas + confirmadas de ese doctor. |
| **Ingresos por servicio** | Σ del precio de las citas **atendidas** de ese servicio. |

Ojo con la diferencia de naturaleza: **Facturado** es lo devengado (lo que se
atendió) y **Cobrado** es caja (lo que entró). No tienen por qué coincidir con el
Dashboard, que es solo caja.

## 5. Ficha del paciente (drawer y lista)

| Dato | Fórmula |
|---|---|
| **Total facturado** | Σ (precio pactado − descuento) de todas sus citas no canceladas. |
| **Total pagado** | Σ de sus cobros **clínicos que no son de tratamiento**. |
| **Saldo pendiente** | Facturado − Pagado, con piso en cero (un saldo a favor no es deuda). |

Lo que compra en farmacia **no baja** su deuda de consultas. Lo que paga de un
tratamiento **tampoco**: son cuentas separadas a propósito.

## 6. Panel de la cita

| Dato | Fórmula |
|---|---|
| **Precio** | Precio pactado − descuento. |
| **Pagado** | Σ de los cobros clínicos de esa cita. |
| **Pendiente** | Precio − Pagado, con piso en cero. |
| **Compras en farmacia** | Se muestran aparte, nunca dentro del pagado. |

## 7. Tratamientos (addon de fertilidad)

| Dato | Fórmula |
|---|---|
| **Cobrado en el periodo** | Σ de los cobros de tratamientos con fecha de pago en el rango. |
| **Honorarios** / **Terceros** | El mismo cobrado, partido por el concepto que se eligió al cobrar. |
| **Pendiente (en curso)** | Por tratamiento activo: acordado − cobrado en clínica − pagos que la paciente hizo directo al tercero. Piso en cero. |

Los **pagos directos a terceros** (laboratorio, banco de óvulos) no son ingreso de
la clínica: cubren lo acordado, nada más. Nunca aparecen en Ingresos ni en Caja.

## 8. Farmacia y Almacén

| Pantalla | Dato | Fórmula |
|---|---|---|
| Farmacia › Ventas del día | **Total del día** | Σ del total (con IGV) de las ventas confirmadas de ese día. Las anuladas se cuentan aparte. |
| Farmacia › Ventas del día | **Por medio de pago** | El mismo total, partido en efectivo / electrónico / otro. |
| Almacén › Rentabilidad | **Ingreso** | Venta ÷ 1,18 si el producto es gravado; tal cual si es exonerado o inafecto. |
| Almacén › Rentabilidad | **Costo** | Costo real del lote que salió (o el último costo conocido si falta). |
| Almacén › Rentabilidad | **Ganancia** | Ingreso neto − Costo. |
| Almacén › Rentabilidad | **Margen** | Ganancia ÷ Ingreso neto × 100. |
| Almacén › Rentabilidad | **Merma** | Costo de lo que se perdió o venció. |

La compra se digita **sin IGV** y la venta se cobra **con IGV**. Por eso la
ganancia se calcula neteando la venta: comparar un precio con IGV contra un costo
sin IGV infla el margen ~18 %.

## 9. Caja

| Dato | Fórmula |
|---|---|
| **Esperado en efectivo** | Fondo inicial + cobros en efectivo del turno + movimientos en efectivo. |
| **Contado** | Lo que la cajera cuenta físicamente al cerrar. |
| **Diferencia** | Contado − Esperado. |
| **Cobros del turno** | Todo lo cobrado durante el turno, partido por medio de pago (incluye tarjeta y Yape, aunque no estén en el cajón). |

Movimientos que suman: ingreso, reposición. Movimientos que restan: egreso,
sangría (retiro al banco), devolución. Caja **arquea efectivo**; todavía no es un
libro de gastos (eso es la fase 2 del módulo).

## 10. Facturación electrónica (SUNAT)

| Tarjeta | Fórmula |
|---|---|
| **Emitido en el período** | Σ del total (con IGV) de los comprobantes aceptados o en envío. Los rechazados, con error o anulados no suman. |

Emitir un comprobante **no** crea un cobro, y cobrar **no** emite un comprobante:
son dos actos distintos. Lo cobrado y lo facturado a SUNAT pueden no coincidir.

---

## Tres avisos honestos para la reunión

1. **En Reportes, "Total cobrado" incluye las ventas de farmacia, pero "Total
   facturado" solo cuenta citas.** Con eso, "Pendiente" sale más bajo de lo real
   en las clínicas que venden productos. En la organización de la Dra. Patricia
   hay 32 cobros de farmacia, así que le afecta hoy. La regla interna dice que la
   plata de clínica y la de farmacia no se mezclan; esta pantalla se salta la
   regla y hay que corregirla.
2. **La "Deuda pendiente" del Dashboard no resta los descuentos** (la ficha del
   paciente sí). En la organización de la Dra. Patricia hay 7 citas con descuento,
   así que ese número está ligeramente inflado y no cuadra con el saldo que se ve
   en cada paciente.
3. **El Dashboard y Reportes miden cosas distintas a propósito**: uno es caja
   (cuándo entró el dinero) y el otro devengado (cuándo se atendió). Que no
   coincidan no es un error; que se contradigan dentro de la misma pantalla, sí.

Los puntos 1 y 2 son arreglables sin tocar datos: es cambiar la fórmula de esas
dos tarjetas para que usen las mismas funciones que ya usa la ficha del paciente.
