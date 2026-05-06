# Atención combinada (multi-servicio por cita) — análisis para decisión

> **Estado**: 🟡 **PENDIENTE DE DECISIÓN**.
> Requiere validación de congruencia con Nubefact, comisiones, módulo de reportes, y conversación con stakeholders (Vitra como pilot, posibles clientes de estética).
> Este documento extiende y supersedea las secciones operativas de `dual-treatment-eval.md` (que conserva su valor como audit técnico del schema actual).

## 1. Reframe — ya no se llama "dual treatment"

"Dual" sugiere exactamente 2; el caso real admite N (consulta + botox + limpieza, etc.). Naming candidato:

| Candidato | Pro | Contra |
|---|---|---|
| **Atención combinada** | Médicamente correcto en español | Suena formal |
| **Servicios múltiples por cita** | Descriptivo, claro | Verboso |
| **Consulta + procedimiento** | Cubre el caso típico | Limita el modelo mental |

**Recomendación**: **no marketear esto como "feature"**. En la UI simplemente cambiar "Servicio" → "Servicios" (plural) y permitir multi-select. Internamente el junction se llama `appointment_services` siguiendo el patrón ya existente en el codebase (`einvoice_line_items`, `treatment_plan_items`). Cero nombre de feature dedicado.

## 2. Diferenciación crítica — esto NO es un treatment plan

| `treatment_plans` (existente) | Atención combinada (propuesta) |
|---|---|
| Roadmap de visitas FUTURAS | Múltiples servicios en UNA visita |
| Lo crea el doctor desde la HC | Se crea en la reserva o se añade durante la consulta |
| Granularidad: visitas | Granularidad: servicios dentro de una visita |
| Caso típico: "FIV en 4 sesiones" | Caso típico: "consulta + botox mismo día" |

Confundir ambos llevaría a usar `treatment_plan_items` para resolver esto, lo cual es incorrecto: un plan a futuro no debería materializarse hasta que se agenda la cita correspondiente.

## 3. Workflow real — 2 puntos de entrada

### Flujo A — Al agendar (recepción)
La recepcionista marca múltiples servicios en el form de cita. Caso típico cuando el doctor ya conversó con el paciente en una visita anterior y dejó indicado "para la próxima vez, también botox".

### Flujo B — Durante la consulta (doctor) — **el diferenciador real**
Paciente vino solo a consulta. Doctor recomienda botox, paciente acepta. Doctor abre la HC y hace click en **"Agregar servicio"** → se suma a esta misma cita en tiempo real. La recepcionista lo ve reflejado cuando el paciente sale a pagar.

La mayoría de SaaS médicos solo soportan A. Soportar B es lo que hace que en estética la herramienta valga la diferencia (hoy las recepcionistas hacen recibo manual o crean una "cita ficticia" para cobrarlo, ambos rompen reportes).

## 4. Decisiones espinosas — pendientes de validación

| # | Decisión | Voto preliminar | Validar con |
|---|---|---|---|
| D1 | Duración del slot al sumar servicios (consulta 20min + botox 45min) | **Sumar** — 65min reflejados en calendar | Vitra (¿les rompe la grilla?) |
| D2 | Mid-visit add: ¿lo añade el doctor solo o requiere confirmación de recepción? | **Doctor directo** — recepción solo lo ve cuando el paciente sale | Vitra workflow real |
| D3 | Descuento global vs por servicio | **Mantener global en MVP** | Casos de uso: ¿alguna clínica necesita "20% off solo en el botox"? |
| D4 | Colisión de slots cuando se hace mid-visit add | **Alertar y permitir override** ("Choca con cita de Pedro a las 11:30") | UX validation con recepcionistas |
| D5 | Cancelación parcial (paciente acepta consulta, rechaza botox a último minuto) | Permitir remover servicio mientras la cita esté en estado abierto | Lógica de pago / reembolso |

## 5. Congruencia con Nubefact — **lo que hay que validar**

Esto es el bloque que el founder explícitamente pide revisar antes de decidir.

**Lo que ya está bien (verificado en `dual-treatment-eval.md`)**:
- `lib/einvoice/mapper.ts` y `computeInvoiceTotals` ya soportan N items sin cambios.
- `einvoice_line_items` (mig 108) ya es N:N con `service_id + quantity + unit_price + descripcion`.
- El emit-dialog hoy siembra UN item desde `appointment.service_id` pero la infraestructura abajo está lista.

**Lo que hay que validar antes de tirar la migración**:
1. ¿Nubefact acepta línea por servicio con códigos SUNAT distintos en una misma factura/boleta? Verificar con un test sandbox: emitir una boleta con 2 line items con códigos distintos.
2. **IGV**: ¿todos los servicios médicos van al mismo régimen? Consulta es exonerada (por lo general); botox podría ser gravado. Si en una misma factura van mezclados, ¿Nubefact lo procesa? **Posible blocker legal/contable**.
3. ¿El número de comprobante necesita ser uno solo o uno por servicio? Asumimos uno solo (es lo natural en SUNAT) pero verificar.
4. Reportes contables (libro de ventas, declaración mensual): ¿agrupar por cita o por servicio? Probable: por línea (cada servicio cuenta como venta independiente para SUNAT).

## 6. Estimación revisada (vs los 33-45h originales)

Asumiendo solo multi-service, sin rebuild de comisiones (eso queda fuera de scope):

| Fase | Alcance | Estimado |
|---|---|---|
| **F1 — MVP recepción** | Junction `appointment_services` + form multi-select + calendar card + total = suma + backfill | **16-20 h (~3 días)** |
| **F2 — Mid-visit add** | Botón "Agregar servicio" en HC + ajuste de slot duration + warning de colisión | **8-12 h (~1.5 días)** |
| **F3 — Billing + reportes** | Nubefact emite 1 línea por servicio + reportes "service volume" usan junction | **8-12 h (~1.5 días)** |
| | **Total** | **~30 h (~6 días dev)** |

Recomendación de phasing: **F1 + F2 juntos** (~4-5 días) llevan ya el valor a producción. **F3** puede esperar hasta que un cliente activo necesite reporte por servicio individual.

## 7. Lista de cosas a validar antes de implementar

Checklist para cuando se retome la decisión:

- [ ] **Nubefact**: emitir boleta sandbox con 2 line items con códigos SUNAT distintos. ¿Pasa?
- [ ] **IGV mixto** en misma boleta: ¿gravado + exonerado? Consulta a contador externo.
- [ ] **Vitra**: ¿el flujo de "consulta + ecografía mismo slot" lo manejan hoy con 2 citas back-to-back? Confirmar el dolor real.
- [ ] **Estética (futuro cliente)**: ¿el flujo "consulta + botox" lo hacen 70%+ de las visitas? Confirmar con clínica de muestra.
- [ ] **Comisiones**: ¿alguna clínica ya nos pidió comisión por servicio (% del botox al doctor)? Si sí, F3 sube de prioridad y necesita rediseño.
- [ ] **Treatment plans**: ¿se mantienen separados? Validar que un plan a futuro NO se solape conceptualmente con esto.
- [ ] **Reportes existentes**: enumerar las queries que hoy usan `appointments.service_id` y planificar migración (`financial-report.tsx:105-107`, `operational-report.tsx:108-116`, `doctor-dashboard.tsx:580/790/855` según el audit previo).

## 8. Riesgo de postergar

Si se posterga más allá del addon Dermatología:
- 🔴 La primera clínica de estética que pruebe el addon va a flagear esto en el primer día. Lanzaríamos un producto incompleto.
- 🟡 Cada nueva feature que se construya sobre `appointments.service_id` (1:1) **multiplica el costo de la migración futura**. Hoy son ~3 lugares; en 3 meses serán 8-10.
- 🟢 Vitra puede esperar — su volumen de "consulta + procedimiento mismo slot" es bajo. No es bloqueante para el pilot actual.

## 9. Conclusión / Estado

**Decisión NO tomada**. Pendiente de:
1. Validación técnica con Nubefact (test sandbox).
2. Confirmación contable del IGV mixto.
3. Conversación con Vitra sobre frecuencia real del caso.
4. Decisión de timing vs addon Dermatología.

Cuando se retome, el implementation-path es claro y el estimado es ~30h. La complejidad real está en las 5 decisiones espinosas (sección 4) y la validación de Nubefact (sección 5), no en el código.
