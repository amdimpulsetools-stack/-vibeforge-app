# Plan Vertical: Fertilidad y Ginecología

**Estado:** Borrador estratégico — pre-implementación
**Última actualización:** 2 de mayo, 2026
**Pilot anchor:** Vitra (Centro de Fertilidad — San Isidro, Lima)
**Documento espejo:** `docs/plan-vertical-dermatologia.md`
**Owner:** Oscar (Founder, Yenda)

---

## 0. TL;DR

- **Dos addons separados, co-activables:** `gynecology` y `fertility`. La arquitectura actual de `addons` con `specialties[]` + `organization_addons` ya soporta esto sin migración nueva.
- **Tab compartido "Historial gineco-obstétrico"** (G/P/A/C, FUR, menarquia, anticoncepción, citologías) se activa si cualquiera de los dos addons está prendido.
- **Modelo de monetización en 3 capas:**
  1. **Capa 1 — Plan base** (incluido en todos los planes existentes): agenda, SOAP genérica, WhatsApp, MP, booking, reportes básicos.
  2. **Capa 2 — Pack Vertical** (addon mensual): infraestructura específica de la especialidad.
  3. **Capa 3 — Módulos Premium** (addon de addon): funcionalidades de alto valor que solo aplican a sub-segmentos.
- **Pilot Vitra:** Pack Fertilidad full incluido durante año 1 a cambio de feedback estructurado y derecho de caso público.
- **No-roadmap explícito:** IA predictiva de éxito reproductivo, PACS de embriología externa, score automatizado de riesgo obstétrico. Razones documentadas en sección 7.

---

## 1. Decisión arquitectónica: dos addons separados

### 1.1 Criterio de decisión

| Pregunta | Respuesta |
|---|---|
| ¿Hay clínicas que solo hacen ginecología sin fertilidad? | Sí, la mayoría del mercado |
| ¿Hay centros que solo hacen fertilidad? | Sí (Vitra es ejemplo) |
| ¿Hay centros que hacen ambas en paralelo? | Sí, frecuente (centros tipo "Salud de la Mujer") |
| ¿Comparten datos clínicos? | Parcialmente — historial gineco-obstétrico aplica a ambas |
| ¿Comparten flujo operativo? | No. Fertilidad = ciclos + presupuestos + criopreservación. Ginecología = controles + citologías + obstetricia |

**Conclusión:** dos addons (`gynecology`, `fertility`) con un componente clínico compartido. Permite vender a tres tipos de cliente sin inflar producto.

### 1.2 Reutilización sin migración

La tabla `organization_addons` (many-to-many) ya permite que una organización active uno, otro o ambos. El componente compartido se gatilla en código por la condición `org.has_addon('gynecology') OR org.has_addon('fertility')`.

---

## 2. Patient Journey State Machine

### 2.1 Problema central a resolver

El dolor #1 reportado en discovery con clínicas de fertilidad: **pacientes que no regresan después de la primera consulta y se pierden silenciosamente del embudo**. Hoy esto se gestiona con tags manuales sin reglas, lo cual no escala.

### 2.2 Modelo conceptual

Tabla nueva `patient_journey_stages` (alternativa: usar JSONB en `specialty_clinical_data` para evitar migración):

```
patient_id
addon_key            -- 'fertility' | 'gynecology'
stage_key            -- 'awaiting_second_visit' | 'in_stimulation' | 'awaiting_punction' | ...
stage_data JSONB     -- { triggered_at, triggered_by_appointment_id, expected_by, ... }
status               -- 'active' | 'completed' | 'expired'
```

### 2.3 Transiciones para Fertilidad

| Trigger | Acción del sistema |
|---|---|
| Cita con `service.category = 'fertilidad-consulta-inicial'` queda `completed` | Crea stage `awaiting_second_visit` con `expected_by = completed_at + 21 días` |
| Se agenda cita con `service.category = 'fertilidad-segunda-consulta'` | Stage pasa a `second_visit_scheduled` |
| Esa cita queda `completed` | Stage pasa a `awaiting_treatment_decision` |
| Se crea `treatment_plan` con tipo FIV/IIU/Inducción | Stage pasa a `treatment_planned`, abre sub-stages del ciclo |
| `expected_by` vence sin progreso | Stage pasa a `at_risk` y dispara seguimiento automático en `/scheduler/follow-ups` |

### 2.4 Conexión con `clinical_followups`

Hoy los seguimientos se crean manualmente. Para esta vertical:

- Nueva columna `clinical_followups.source` → `'manual' | 'rule' | 'system'`
- Nueva columna `clinical_followups.rule_key` → `'fertility.second_visit_lapse'`, etc.
- Cron diario revisa stages vencidas y crea follow-ups con prioridad semáforo (verde/amarillo/rojo según días vencidos).
- Panel `/scheduler/follow-ups` solo necesita un filtro nuevo de origen + badge de regla disparadora. **Cero cambios estructurales.**

---

## 3. Integración con presupuestos (v0.12.0)

`treatment_plan_items` ya soporta multi-servicio con cantidades y precios. Un ciclo FIV de S/13,500 se modela:

```
treatment_plan "FIV ciclo 1"
  ├─ item: Primera consulta tratamiento × 1
  ├─ item: Control ovulatorio × N
  ├─ item: Aspiración folicular × 1
  ├─ item: FIV/ICSI × 1
  ├─ item: Vitrificación de embriones × 1
  ├─ item: Desvitrificación de embriones × 1
  ├─ item: Transferencia embrionaria × 1
  ├─ item: Asesoría psicológica × 1
  └─ item: Honorarios médicos × 1
```

Lo único que falta sobre la base actual:

1. **`treatment_plan_templates`** — nueva tabla con plantillas pre-llenadas (FIV, IIU, Ovodonación, Inducción simple, Crio preservación de óvulos) que la clínica clona y ajusta precios.
2. **PDF de presupuesto branded** — reusa `lib/pdf/clinic-header.ts` (v0.14.0). Falta solo el template del presupuesto: membrete + paciente + breakdown + términos + firma.
3. **Tracking de envío** — columna `treatment_plans.sent_to_patient_at` + botón "Enviar por WhatsApp" con clipboard pre-formateado.
4. **Estados de aceptación** — `pending_acceptance` / `accepted` / `rejected` en `treatment_plans`. Habilita el embudo de conversión: presupuestos enviados → aceptados → revenue convertido. **Esta es la métrica que mueve la aguja en fertilidad.**

---

## 4. Estructura de Tiers por addon

### 4.1 Pack Fertilidad

#### Tier 1 — Base del addon (lo que hace competitivo el módulo)

- Historial gineco-obstétrico estructurado (G/P/A/C, FUR, menarquia, IMC, AMH, FSH/LH/E2)
- Plantillas de presupuesto pre-cargadas: FIV, IIU, Ovodonación, Crio preservación
- Estados del journey de paciente con auto-tagging por reglas
- Embudo de conversión de presupuestos (sent → accepted → rejected)
- PDF de presupuesto branded + envío trackeado por WhatsApp
- Seguimientos automáticos en `/scheduler/follow-ups` por reglas vencidas
- Consentimientos especializados base (FIV, IIU, criopreservación)
- Tracking básico de ciclo: día del ciclo, ecografías de control, niveles hormonales por día
- Beta-HCG seriadas con gráfica de duplicación

#### Tier 2 — Diferenciado (vendible como módulo premium)

- **Inventario de criopreservación** — óvulos/embriones/semen congelados por paciente, con tanque/canister/posición/lote, fecha de vigencia legal, consentimiento asociado y registro de descarte autorizado.
- **Calendario de protocolo automatizado** — dado un protocolo (ej. antagonista), se autogeneran citas y recordatorios del ciclo.
- **Reportes de tasas de éxito** por doctor / protocolo / grupo etario.
- **Portal del paciente con vista de ciclo** — paciente ve su día actual, próxima ecografía, medicamento del día.

#### Tier 3 — Aspiracional (no roadmap inmediato)

- Bundles de protocolos avanzados configurables por la clínica.
- Timeline obstétrica post-FIV (transición automática hacia el addon `gynecology`).

### 4.2 Pack Ginecología

#### Tier 1 — Base del addon

- Historial gineco-obstétrico estructurado (compartido con `fertility`)
- Calendario obstétrico: dado FUR → calcula edad gestacional, FPP, semana actual, alertas por trimestre
- Carnet perinatal digital estructurado (peso, PA, AFU, LCF por control)
- Catálogo de servicios pre-cargado (control prenatal, citología, colposcopía, ecografía obstétrica I/II/III, control posparto)
- Recordatorios automáticos: citología cada 3 años, mamografía anual desde 40 años
- Plantillas de plan: control prenatal completo, paquete pre-quirúrgico

#### Tier 2 — Diferenciado

- **Curva de crecimiento fetal** — reusa infraestructura de `growth_curves` existente, solo cambian tablas de referencia.
- **Timeline de citología/HPV con alertas Bethesda.**
- **Bundle financiero de control prenatal completo** (9 controles + 3 ecografías + paquete con saldo prepagado).

#### Tier 3 — Aspiracional

- Integración con laboratorios externos (PAP, HPV, beta-HCG) — reusa addon `lab_integration` ya en seed.

---

## 5. Modelo de monetización en 3 capas

### 5.1 Capa 1 — Incluido en todos los planes (Independiente / Centro Médico / Policlínico / Clínica)

Todo lo que es **piso de producto**. Cobrarlo aparte se percibe como nickel-and-diming.

- Calendario inteligente, gestión de pacientes, agenda multi-doctor
- Historia clínica SOAP genérica con firma digital
- Recordatorios WhatsApp/email
- Pagos básicos con Mercado Pago
- Booking online público
- Reportes financieros básicos
- Asistente IA in-product (Claude Haiku 4.5)

### 5.2 Capa 2 — Pack Vertical (addon mensual, además del plan base)

Se activa por organización vía `organization_addons`. Una clínica con plan Centro Médico que activa Pack Fertilidad paga `S/349 + addon`.

- **Pack Vertical Fertilidad** → contenido del Tier 1 de Pack Fertilidad (sec. 4.1)
- **Pack Vertical Ginecología** → contenido del Tier 1 de Pack Ginecología (sec. 4.2)
- Una organización puede activar uno, el otro, o ambos.

### 5.3 Capa 3 — Módulos Premium (addon de addon)

Solo se ofrecen a organizaciones que ya tienen el Pack Vertical correspondiente activo. Lógica: cada uno resuelve un problema específico que solo algunas clínicas tienen.

| Módulo Premium | Vertical requerida | Lógica de pricing |
|---|---|---|
| Inventario de criopreservación | Fertilidad | Plano (módulo on/off) — solo aplica a clínicas con laboratorio propio |
| Portal de paciente con vista de ciclo | Fertilidad | Por paciente activo en ciclo (uso variable) |
| Reportes de tasas de éxito | Fertilidad | Plano |
| Calendario de protocolo automatizado | Fertilidad | Plano |
| Integración con laboratorio externo | Ginecología | Por integración activa |
| Bundle de control prenatal completo | Ginecología | Plano |

---

## 6. Pricing (orden de magnitud, sin compromiso comercial)

| Item | Rango sugerido | Notas |
|---|---|---|
| Pack Vertical Fertilidad | S/250–400 / mes | Adicional al plan base |
| Pack Vertical Ginecología | S/150–250 / mes | Adicional al plan base |
| Inventario Crio | ~S/200 / mes | Solo si clínica activa |
| Portal Paciente Ciclo | S/3–5 por paciente activo | Modelo de uso |
| Reportes tasas de éxito | ~S/150 / mes | Plano |
| Integración laboratorio | ~S/180 / mes por integración | Plano |
| Bundle control prenatal | ~S/120 / mes | Plano |

**Anclaje racional:** una clínica de fertilidad tipo Vitra factura S/13,500–20,000 por ciclo FIV. Cobrarles S/600–800/mes total (plan + addon + un módulo premium) representa **menos del 0.5% de un solo ciclo**. Si el sistema recupera una sola paciente perdida por mes vía auto-tagging, el addon se paga ~25 veces.

---

## 7. Lo que queda fuera del producto (no-roadmap)

Documentar los "no" es tan importante como documentar los "sí". Estas exclusiones son deliberadas y se comunican a clientes que las pidan.

### 7.1 IA predictiva de éxito reproductivo

**Razones:**
- Requiere data limpia que Yenda no tendrá en años, y el dataset agregado sufriría sesgo de selección severo.
- Las decisiones reproductivas tienen carga emocional y financiera enorme; un falso negativo o falso positivo son daños no triviales.
- Implicancia médico-legal: el algoritmo se vuelve "consejo médico de facto" sin estar regulado como dispositivo médico.
- Vender expectativas de IA en este contexto erosiona confianza si el modelo decepciona.

**Posible reapertura:** solo si emerge regulación clara, dataset multi-clínica auditable, y respaldo de sociedad médica peruana (SPGO, INEN).

### 7.2 PACS de embriología / escala de Gardner / fotos de blastocistos

**Razón:** es un producto entero por sí solo. Construirlo dilata el roadmap principal sin retorno claro. Los centros que lo necesitan ya tienen software de embriología especializado (ESHRE, Vitrolife, etc.).

**Posible reapertura:** integración bidireccional con sistemas de embriología existentes vía API, no construcción propia.

### 7.3 Score automatizado de riesgo obstétrico

**Razones:**
- Funciona bien en hospitales con perinatólogos certificados; en consultorio privado puede convertirse en argumento de demanda si se usa mal.
- La fórmula correcta varía por contexto (alto vs bajo riesgo, primigesta vs multípara) y por guías que se actualizan periódicamente.
- Yenda no quiere ser oráculo médico — quiere ser plataforma operativa.

**Posible reapertura:** como herramienta de sugerencia explícita ("estos antecedentes podrían requerir evaluación especializada") con disclaimer fuerte y opt-in del médico.

---

## 8. Cumplimiento y datos sensibles

Fertilidad y obstetricia tocan información clínica de máxima sensibilidad. Esta sección define límites de producto.

### 8.1 Datos críticos manejados

- Identidad de donantes de gametos (anonimato según política de la clínica)
- Consentimientos legales con vigencias (criopreservación, descarte de embriones)
- Datos de pareja (filiación, paternidad)
- Estados clínicos sensibles (ITS, abortos, pérdidas gestacionales)

### 8.2 Implicancias de producto

- Todo descarte de gameto / embrión debe quedar registrado con consentimiento firmado y vigente. Si no hay consentimiento válido, el sistema no permite la operación.
- RLS por organización + auditoría de acceso a registros de fertilidad. Logs inmutables de quién vio qué y cuándo.
- Permisos granulares: no todos los roles ven todo. Recepción ve agenda y pagos pero no historial reproductivo detallado. Médico tratante sí.
- Eliminación de paciente requiere pasos extra (paciente con plan activo no es eliminable; debe ser archivado).

### 8.3 Marco normativo peruano relevante

- Ley 26842 (Ley General de Salud).
- Código Civil — implicancias sobre filiación en TRA (Técnicas de Reproducción Asistida).
- Ley 29733 (Protección de Datos Personales) — aplica con categoría especial para datos de salud.
- Vacío regulatorio actual sobre TRA en Perú: decisiones políticas las toma cada clínica. Yenda no tiene posición; replica la política de la organización cliente.

---

## 9. Pilot Vitra — estrategia específica

### 9.1 Acuerdo Founding Member para Vitra

| Año | Plan + Addon | Contraprestación de Vitra |
|---|---|---|
| 1 | Plan Clínica + Pack Fertilidad full **incluidos** | Feedback estructurado quincenal + derecho de caso público + testimonios en video |
| 2 | Plan Clínica + Pack Fertilidad a precio normal con descuento Founding Member | — |
| 3+ | Pricing estándar + módulos premium que decidan activar | — |

**Beneficio para Yenda:** caso documentado de tres años (retention demostrada), testimonio fuerte, evidencia de pricing power (no se fueron al pasar a precio normal).

### 9.2 Modalidad híbrida con Omnia

Vitra mantiene Omnia para historia clínica oficial. En su tenant:

- Toggle de admin: `historia_clinica = 'externa:omnia'` → módulo SOAP de Yenda desactivado.
- Campo "Instrucciones para recepción / notas operativas" disponible en cada cita (no es HC formal, es coordinación operativa).
- Estructura de paciente en Yenda compatible con HC clínica (campos vacíos pero listos) para futura migración con un solo clic.

Esta modalidad híbrida se vuelve **propiedad del producto Yenda**, no excepción para Vitra. Abre el segmento de clínicas con HC ya instalada (Omnia, LOLIMSA, Medesk, etc.) — la mayoría del mercado peruano.

### 9.3 Disciplina del pilot

- **Las primeras 2 semanas: solo escuchar.** No construir features. Documentar fricciones reales.
- **Semanas 3-6:** definir MVP del addon `fertility` con base en lo efectivamente reportado, no en hipótesis.
- **Recién entonces migrar y construir.**

---

## 10. Roadmap / próximos pasos inmediatos

| # | Acción | Responsable | Plazo |
|---|---|---|---|
| 1 | Validar este plan con stakeholder estratégico (Oscar) | Oscar | Hecho |
| 2 | Crear addons `fertility` y `gynecology` en seed (vacíos por ahora) | Claude Code | Antes del kickoff Vitra |
| 3 | Activar tenant Vitra con `fertility` prendido en modo "shell" | Claude Code | Día del kickoff |
| 4 | Cargar plantillas de presupuesto Crio + FIV (basado en docx de promociones) | Oscar | Pre-kickoff |
| 5 | Cargar catálogo de ~75 servicios limpios (basado en Excel de mayo) | Oscar | Pre-kickoff |
| 6 | Bitácora de feedback estructurado quincenal | Oscar | Semanas 1–8 |
| 7 | Definir MVP final del addon `fertility` | Oscar + Claude Code | Semana 6–8 |
| 8 | Implementar MVP | Claude Code | Semana 9–14 |
| 9 | Documentar caso público + testimonio | Oscar | Semana 16+ |

---

## Anexos

### A. Diferencia con `plan-vertical-dermatologia.md`

Dermatología no requiere journey state machine compleja porque sus tratamientos suelen ser series cortas (3-6 sesiones) con menor riesgo de paciente perdida. Fertilidad sí — el ciclo completo dura semanas o meses, hay puntos de abandono claros, y la conversión presupuesto→aceptación es la métrica de negocio principal.

### B. Glosario abreviado

- **G/P/A/C** — Gestaciones, Partos, Abortos, Cesáreas
- **FUR** — Fecha de Última Regla
- **FPP** — Fecha Probable de Parto
- **AFU** — Altura del Fondo Uterino
- **LCF** — Latido Cardíaco Fetal
- **AMH** — Hormona Antimülleriana
- **FSH/LH/E2** — Folículo-estimulante / Luteinizante / Estradiol
- **FIV** — Fecundación In Vitro
- **IIU** — Inseminación Intrauterina
- **ICSI** — Inyección Intracitoplasmática de Espermatozoides
- **TRA** — Técnicas de Reproducción Asistida
- **NGS** — Next Generation Sequencing (análisis genético)
- **PGT-A** — Preimplantation Genetic Testing for Aneuploidies

---

*Documento vivo. Actualizar cada vez que se cierre un ciclo de feedback con Vitra o se tome una decisión arquitectónica que afecte el scope.*
