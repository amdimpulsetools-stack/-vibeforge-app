# Plan Vertical: Addon `dermatology` — Análisis estratégico

> **Status:** análisis exploratorio, NO implementación. Esperando aclaraciones de Dermosalud para definir alcance MVP.
> **Última actualización:** 2026-04-29
> **Cliente referencial:** Dermosalud (clínica dermatológica + estética)
> **Contexto repo:** addon `dermatology` ya registrado como seed en sistema de módulos verticales; falta UI y flujos.

---

## 1. Decisión de UX: ¿Desde dónde se sube la foto antes/después?

### Conclusión

**Desde el sidebar de la cita.** La cosmetóloga toma la foto en el momento de la cita, con el paciente físicamente presente. Pedirle navegar a `/patients`, buscar al paciente, abrir el drawer y encontrar el tab = 5+ clicks que no van a pasar. Acabaría tomando la foto con su WhatsApp y nunca subiéndola.

### Regla general aplicada

> **Se escribe desde la cita, se lee desde el paciente.**

Mismo patrón que las notas SOAP: se escriben desde el sidebar de la cita, se consultan desde el historial del paciente.

### Diseño concreto

**Botón en el sidebar de la cita** — visible solo cuando `service.category` es estético/dermatológico (gating del addon `dermatology`):

- "Foto antes / Foto después"
- Un click → cámara/galería del dispositivo. Sin formulario intermedio.
- La foto queda automáticamente atada a:
  - `patient_id` (paciente de la cita)
  - `appointment_id` (la cita actual — para timeline)
  - `service_id` (qué procedimiento — para filtrar por tipo)
  - `doctor_id` (quién lo hizo)
  - `taken_at` (timestamp del momento)
  - `phase` enum: `before` | `after` | `progress` | `final`
  - `body_zone` (opcional, ver Tier 1.2)
- **Compresión client-side** antes de subir: max 1200px lado largo, WebP cuando posible. La cosmetóloga no espera 30 segundos un upload de 12MB.

**Tab "Galería" en el drawer del paciente** = solo lectura. Timeline, comparador antes/después, filtros por procedimiento. La cosmetóloga nunca toca ese tab; el doctor sí, en consulta de control.

### Excepción

Si el paciente trae fotos viejas que quiere subir post-hoc (de antes de ser cliente), entra desde el drawer del paciente con un campo "fecha de la foto" manual. Caso minoritario, no optimizar.

---

## 2. Análisis de diferenciadores (organizado por tier de ROI)

### TIER 1 — Lo que te hace COMPETITIVO en dermatología

> Sin esto no tienes vertical, solo agenda con etiqueta "estético".

#### 1.1 Galería antes/después con comparador

- **Storage estructurado:** cada foto con `phase`, `body_zone`, `appointment_id`, `service_id`.
- **Vista comparador:** dos fotos lado a lado, slider arrastrable que revela una sobre la otra. Estándar de la industria — sin esto Dermosalud no toma en serio el producto.
- **Timeline visual:** scroll horizontal con miniaturas ordenadas por fecha, agrupadas por zona corporal o procedimiento.
- **Privacidad:** campo `is_face_visible` boolean → si es true, blur preview en listas y solo mostrar al expandir. Las fotos de cara son las más sensibles legalmente.
- **Compresión** ya mencionada arriba.

#### 1.2 Mapa corporal (body diagram) para marcar zonas

- SVG simple con frente/dorso del cuerpo + zoom en cara. La cosmetóloga toca la zona donde hizo el tratamiento.
- Cada foto, nota clínica y aplicación queda georreferenciada al body_zone (`forehead`, `glabella`, `cheek_l`, `cheek_r`, `chin`, `neck`, `chest`, `back_upper`, etc. — empezar con 25 zonas de cara/cuerpo principales).
- **Por qué importa:** un paciente puede tener Botox en frente HACE 4 MESES + filler en labios HACE 2 MESES. Sin body mapping eso es una sopa cronológica. Con body mapping ves el historial por zona.

#### 1.3 Análisis de piel estructurado (Skin Profile)

Tab "Perfil dermatológico" en el drawer del paciente con campos:

- **Fototipo Fitzpatrick** (I-VI) — radio buttons con descripción de cada uno.
- **Condiciones activas:** multi-select (acné, melasma, rosácea, fotoenvejecimiento, hiperpigmentación, dermatitis, queratosis, etc.).
- **Sensibilidades / alergias dermatológicas** específicas (separadas de las alergias generales del paciente).
- **Productos en uso en casa:** texto libre + structured (limpiador, sérum, FPS, retinoide nocturno).

**Por qué importa:** información que el doctor vuelve a leer en cada consulta. Hoy queda en notas SOAP texto libre y se pierde.

#### 1.4 Catálogo de procedimientos estéticos pre-cargado

- Cuando se activa el addon `dermatology`, se siembran ~40 procedimientos típicos como `services` con categoría "Estético": Botox por zona, fillers HA, peeling químico (varias intensidades), IPL, láser CO₂, depilación láser por zona, dermapen, hidrafacial, mesoterapia, criolipólisis, plasma rico en plaquetas, etc.
- Cada uno con: duración default, indicaciones pre/post, requiere consentimiento (auto-popup del módulo de consentimiento existente), categoría SUNAT.
- **Por qué importa:** la clínica no carga manualmente cada servicio. Activar el addon = catálogo el primer día.

---

### TIER 2 — Diferenciadores que te ponen ARRIBA del 80% de la competencia local

> Doctoralia, Helisa, etc. NO tienen esto.

#### 2.1 Mapeo de inyecciones con dosis acumuladas

- Sub-feature del body mapping: cuando el procedimiento es Botox/filler/mesoterapia, el doctor marca el punto exacto en el mapa de la cara y registra la dosis (unidades de Botox, ml de filler).
- **Vista acumulada:** "Esta paciente lleva 24 unidades de Botox en frente en los últimos 12 meses." Crítico clínicamente — hay límites de dosis.
- **Visualización:** mapa de calor sobre el rostro de la paciente con intensidad según dosis acumulada por zona.

#### 2.2 Recordatorios de mantenimiento por procedimiento

- Cada procedimiento estético tiene una "vida útil": Botox 4-6 meses, fillers 9-12 meses, peeling cada 4-6 semanas en serie, etc.
- **Auto-cron** que detecta pacientes cuyo último procedimiento de tipo X está cerca de vencer y mete un seguimiento clínico semáforo amarillo + envía WhatsApp pre-armado: *"Hola Sofía, tu Botox cumple 4 meses esta semana. ¿Agendamos refresh?"*
- **Esta feature SOLA paga el addon.** Una clínica estética que recupera el 30% de pacientes que se le iban porque "se olvidaron de volver" = revenue inmediato.
- Tabla nueva: `treatment_intervals (service_id, expected_followup_days, reminder_message_template)`.

#### 2.3 Segmentación de pacientes por valor + comportamiento estético

Tags automáticos:

- **VIP estético**: LTV ≥ S/X en últimos 12 meses (umbral configurable por org).
- **En serie activa**: tiene plan de tratamiento abierto sin cancelar.
- **Touch-up due**: dentro de la ventana de mantenimiento.
- **Reactivación**: sin cita en 6+ meses, antes era recurrente.
- **Multi-procedimiento**: ≥3 tipos distintos de tratamiento.

Filtros de estos tags en `/patients` y endpoints para campañas marketing. Dashboard "Pacientes en riesgo de pérdida" — top 20 con LTV alto pero sin contacto reciente.

#### 2.4 Vista timeline visual del paciente (vista premium)

- Reemplaza el listado plano del historial actual por un timeline scroll vertical:
  - Cada nodo es una visita.
  - Miniatura de foto antes/después de esa visita.
  - Etiquetas de procedimientos hechos.
  - Doctor + costo.
  - Click expande la nota SOAP.
- Visual atractivo para mostrar al paciente en consulta ("mira tu progreso").
- También útil para vender: el doctor puede screenshotear el timeline (con permiso del paciente, que ya firmó consentimiento de fotografías) y postearlo como caso de éxito.

#### 2.5 Inventario de inyectables con tracking de lote

- Tabla `aesthetic_inventory (org_id, product_name, brand, lot_number, expiry_date, units_total, units_used)`.
- Cuando el doctor registra una aplicación, descuenta unidades del lote activo (FIFO por vencimiento).
- Alerta cuando queda <20% o vencimiento <30 días.
- **Cumplimiento legal:** si un paciente reporta evento adverso meses después, el doctor puede trazar exactamente qué lote se usó (requisito DIGEMID-MINSA y europeos similares).

---

### TIER 3 — Diferenciadores avanzados

> Cuando ya tengas 5+ clínicas estéticas y necesites diferenciación de segundo nivel.

#### 3.1 Comisiones por cosmetóloga / técnica

- Algunas clínicas pagan a sus técnicas un % por procedimiento ejecutado. Hoy lo hacen en Excel.
- Tab "Comisiones" en `/reports` con cálculo automático: técnica X hizo 15 hidrafaciales este mes a 15% = S/Y.
- Configurable: % global, % por servicio, % por miembro del equipo.

#### 3.2 Membresías / suscripciones del paciente

- Patient Membership: paciente paga S/300/mes y obtiene 1 procedimiento incluido + 20% off en el resto.
- Mercado Pago suscripción del paciente (no la del owner — del cliente final).
- Modelo Recurring revenue para la clínica + retención brutal.

#### 3.3 Pre-consulta digital por WhatsApp

- Antes de la primera cita, el paciente recibe un link de formulario: foto auto-tomada, áreas de interés, productos que usa hoy, presupuesto aproximado.
- El doctor llega a la consulta con el paciente ya filtrado y la consulta se vuelve más conversión que diagnóstico.
- Big lift en conversión consulta → procedimiento.

#### 3.4 Catálogo "antes/después" anonimizado para landing pública de la clínica

- El paciente firma autorización extendida → su foto antes/después se sube a un catálogo público de la clínica (cara blureada o área aislada).
- Galería pública en `/clinic/[slug]/galeria` para SEO de la clínica.
- Tu plataforma le da a Dermosalud un componente extra de marketing — diferenciador competitivo grande.

#### 3.5 Score de satisfacción post-procedimiento

- 24-72h después del procedimiento, WhatsApp/email automático: *"Sofía, ¿cómo te sientes? Califica del 1 al 5."*
- Dashboard agregado de satisfacción por procedimiento, por doctor, por mes.
- Si es ≤2: alerta al admin para llamar (recuperación de relación antes de review negativa pública).

---

## 3. Recomendación de scope MVP

### v1 del addon `dermatology` (MVP)

Todo el **Tier 1** completo:

- 1.1 Galería antes/después con comparador
- 1.2 Mapa corporal
- 1.3 Skin Profile
- 1.4 Catálogo pre-cargado

**Esto solo ya es un producto vendible.** Estimado: ~2 semanas de trabajo de un agente bien briefeado.

### v1.1 (post-feedback Dermosalud)

- 2.1 Mapeo de dosis acumuladas
- 2.2 Recordatorios de mantenimiento (probablemente la feature de mayor ROI individual)
- 2.3 Segmentación VIP/Reactivación

Estimado: ~1-2 semanas adicionales.

### v1.2 y siguientes

- 2.4 Timeline visual
- 2.5 Inventario con tracking de lote
- Tier 3 conforme tengas señal de mercado.

---

## 4. Preguntas abiertas — necesito respuesta antes de implementar

1. **¿Dermosalud te dio aclaraciones específicas?** Si sí — pueden cambiar prioridades. Quizás ellos quieren membresías ya (Tier 3) y el body mapping no les importa.

2. **¿Cuántos procedimientos distintos hace Dermosalud realmente?** Si son 5 (botox, peeling, hidrafacial, IPL, depilación) — el catálogo pre-cargado del 1.4 es overkill. Si son 30 — vital.

3. **¿La cosmetóloga usa tablet, celular o desktop?** Esto cambia el diseño del botón "agregar foto" y del body mapping (touch-friendly vs mouse).

4. **¿Hay regulación específica en Perú para cosméticos/estéticos?** Asunción: sí (DIGEMID/INVIMA-equivalente para inyectables, registro sanitario para procedimientos). El detalle ayuda a definir el 2.5 (tracking de lotes).

5. **Modelo de pricing:** ¿Dermosalud paga el plan completo o paga el plan + addon `dermatology` extra (PRO addon)?
   - Si es addon PRO con tarifa adicional → vale la pena meter más features para justificar el precio.
   - Si está incluido en plan → scope más conservador.

---

## 5. Conexiones con módulos existentes (no reinventar)

El addon `dermatology` debe **integrarse con lo que ya existe**, no duplicar:

| Necesidad | Módulo existente que reusar |
|---|---|
| Subir fotos | `clinical_attachments` (mig 053) — ya tiene categorías y storage |
| Plan de tratamiento por sesiones | `treatment_plans` + `treatment_sessions` (mig 053) — ya soporta sesiones numeradas |
| Notas clínicas SOAP | `clinical_notes` (mig 050) — agregar tab condicional para skin profile |
| Consentimiento por procedimiento | `informed_consents` (mig 120) — auto-popup según `service.requires_consent` |
| Recordatorios automáticos | Cron `/api/cron/reminders` — extender con ventana de mantenimiento |
| Etiquetas de paciente | Sistema de tags existente — agregar tags computadas por rules |
| Membrete en PDFs | `lib/pdf/clinic-header.ts` — ya disponible para reportes/timeline export |

**Migración estimada del MVP:** 1-2 migraciones nuevas máximo:
- `1XX_dermatology_addon.sql`: `patient_skin_profile`, `body_zones` (catálogo), `aesthetic_photo_metadata` (extiende clinical_attachments con phase + body_zone + is_face_visible).
- `1XX_dermatology_seed.sql`: catálogo de procedimientos pre-cargados.

---

## 6. Riesgos a tener en cuenta

- **Privacidad de fotografías:** las fotos de cara son legalmente las más sensibles. El consentimiento de fotografías ya existe como tipo en `informed_consents` — debe ser **prerequisito obligatorio** antes de subir cualquier foto. UX: bloquear el botón "Foto antes/después" si el paciente no tiene consentimiento de fotos firmado y vigente.
- **Costo de storage:** una clínica activa puede generar 100-500 fotos/mes. Multiplica por 12 meses por X clínicas. Comprimir agresivamente (WebP, max 1200px) y considerar tier de plan con cuota de fotos.
- **Tablets en consultorio:** si la clínica usa tablets compartidas, hay tema de auth — la sesión queda abierta entre pacientes. Considerar PIN de 4 dígitos para "reabrir sesión" rápido sin re-login completo.
- **Migración de pacientes existentes de Dermosalud:** si ya tienen fotos en otro sistema/Drive/WhatsApp, hace falta un import bulk. Out of scope del addon, pero anticipar pregunta.

---

## 7. Próximos pasos

1. **Esperar aclaraciones de Dermosalud** (las 5 preguntas de §4).
2. Con esas respuestas, refinar scope del MVP — algunos features podrían moverse de Tier a Tier.
3. Diseñar migración SQL del addon (1-2 archivos).
4. Brief al agente de implementación con scope cerrado.
5. Implementación MVP en sprints de 3-5 días con commits incrementales.
6. Demo con Dermosalud antes de v1.1.

---

## Apéndice — Conexión con la conversación que generó este análisis

Este documento captura el análisis que se hizo sobre dos preguntas concretas:

**Pregunta A:** *"¿La persona que va a subir las fotos lo hace desde el sidebar de la cita o tendría que entrar al drawer del paciente?"*
→ Respuesta resumida: sidebar de la cita. Ver §1.

**Pregunta B:** *"¿Qué diferenciadores podemos añadir para esta especialidad? Funcionalidad, interactividad, mejoras visuales en el seguimiento, etiquetar pacientes por tipos de tratamiento o por monto invertido."*
→ Respuesta resumida: Tier 1/2/3 organizado por ROI. Ver §2.

Documento generado el 2026-04-29 antes de recibir las aclaraciones de Dermosalud, por lo tanto sujeto a revisión cuando llegue ese input.
