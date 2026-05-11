# Auditoría legal — `/privacy` y `/terms` vs Ley N° 29733

**Fecha:** 2026-05-11
**Alcance:** páginas públicas legales de Yenda (multi-tenant SaaS médica con datos de Categoría Especial).
**Modo:** read-only. No se realizan cambios de código ni commits.
**Archivos auditados:**
- `app/(public)/privacy/page.tsx` (542 líneas)
- `app/(public)/terms/page.tsx` (424 líneas)
- `supabase/migrations/116_terms_acceptance.sql`
- `supabase/migrations/123_consent_hardening_and_terms_gate.sql`
- `app/api/auth/accept-terms/route.ts`
- `lib/constants.ts:10` (`TERMS_VERSION = "2026-04-29"`)

---

## Estado actual de las páginas

**Política de Privacidad** (`app/(public)/privacy/page.tsx`) — sorprendentemente sólida para un producto pre-launch. Cubre:
- §01 Datos recopilados (cuenta, pacientes, pago, técnicos) — `privacy/page.tsx:85-114`.
- §02 Roles legales: Cliente = Titular del Banco, Yenda = Encargado del Tratamiento (art. 36 + DS 003-2013-PCM) — `privacy/page.tsx:116-153`.
- §04 Seguridad (TLS, AES-256, RLS, bcrypt, AES-256-GCM aplicación, backups, auditoría) — `privacy/page.tsx:197-235`.
- §05 Datos médicos: cita a NTS 139-MINSA y NIST/ISO/HIPAA — `privacy/page.tsx:237-262`.
- §06 Retención: HC 15 años, contable 5 años, cuenta 30 días, logs 12 meses — `privacy/page.tsx:264-294`.
- §07 Sub-encargados: 9 proveedores con cards individuales (Supabase/AWS, Vercel, Mercado Pago, Nubefact, Resend, WhatsApp, Anthropic, Sentry, Google) y aviso de 30 días previos a cambios — `privacy/page.tsx:296-385`.
- §08 Notificación de incidentes: 72 horas — `privacy/page.tsx:387-407`.
- §10 Derechos ARCO con plazo de 20 días hábiles (art. 24 Reglamento) — `privacy/page.tsx:431-477`.
- §11 DPO: `privacidad@yenda.app` — `privacy/page.tsx:479-503`.

**Términos y Condiciones** (`app/(public)/terms/page.tsx`):
- §01 Aceptación + autoridad para vincular organización — `terms/page.tsx:71-90`.
- §04 Planes, SLA ≥99%, cancelación, reembolsos, cambios de precio — `terms/page.tsx:150-196`.
- §07 Limitación de responsabilidad: cap 12 meses de suscripción — `terms/page.tsx:256-278`.
- §08 Disclaimer de IA y dispositivo médico — `terms/page.tsx:280-310`.
- §09 Exportación 30 días + eliminación post-cancelación — `terms/page.tsx:312-334`.
- §13 Conciliación CCL → tribunales de Lima — `terms/page.tsx:373-388`.

**Acompañamiento técnico:**
- Aceptación explícita registrada en `user_profiles.accepted_terms_at/version` (mig 116).
- Versión autoritativa server-side `TERMS_VERSION = "2026-04-29"` (`lib/constants.ts:10`) — el cliente no puede falsificar versión (`accept-terms/route.ts:40`).
- Middleware gate redirige a `/onboarding/accept-terms` para usuarios pre-existentes (mig 123, líneas 122-129).

---

## Gaps identificados

| # | Requisito Ley 29733 | Cubierto? | Severidad pre-launch |
|---|---|---|---|
| 1 | Identificación formal del titular del banco (razón social, RUC, domicilio Yenda) | NO — solo "Yenda" como marca | **ALTA** |
| 2 | Declaración explícita de procesamiento de **Categoría Especial / datos sensibles de salud** (art. 2.5 + art. 13.5) | PARCIAL — se mencionan datos médicos pero nunca aparece la frase "datos sensibles" ni "Categoría Especial" ni se invoca art. 13.5 | **ALTA** |
| 3 | Inscripción del banco de datos en el RNPDP (Registro Nacional ANPD) | NO mencionada — mig 116 menciona "cuando corresponda" pero no se compromete fecha | **ALTA** |
| 4 | Consentimiento **del paciente** (no solo del médico) para tratar sus datos clínicos | NO — la política asume que el contrato B2B con la clínica basta | **CRÍTICA** |
| 5 | Notificación al paciente si la clínica migra de proveedor o si Yenda es vendido | PARCIAL — §11 Cesión (terms) avisa al Cliente, no al paciente | **MEDIA** |
| 6 | Derecho del paciente a portabilidad de su HC en formato estructurado | PARCIAL — terms §09 cubre Cliente, no paciente | **MEDIA** |
| 7 | Notificación de brechas a la **ANPD** (no solo al Cliente) | NO — solo se notifica al owner; falta compromiso con autoridad | **ALTA** |
| 8 | Edad mínima / tratamiento de datos de menores (art. 14) | NO mencionado — pediatría es caso obvio en SaaS médica | **ALTA** |
| 9 | Base legal para transferencia internacional (art. 11–15 + Directiva ANPD 01-2020) | PARCIAL — §07 menciona "consentimiento + cláusulas contractuales" pero no nombra SCCs ni mecanismo formal | **MEDIA** |
| 10 | Procedimiento concreto para ejercer ARCO (formato de solicitud, datos a adjuntar, canal alternativo no-email) | PARCIAL — solo da email | **MEDIA** |
| 11 | Identificación de la ANPD como autoridad ante quien el titular puede reclamar si Yenda no responde | NO mencionado | **MEDIA** |
| 12 | Cookies: banner de consentimiento previo al uso de cookies no esenciales | N/A — privacy §09 dice que solo se usan esenciales; OK si es verdad | BAJA (verificar) |
| 13 | Política de retención de **logs de acceso a HC** específica (auditoría sanitaria) | PARCIAL — §06 dice "12 meses logs"; HIPAA/NTS sugiere 6 años para auditoría clínica | MEDIA |
| 14 | Identificación de jurisdicción para titulares fuera de Perú (si la SaaS atiende clínicas con pacientes extranjeros) | NO | BAJA |

---

## Wording propuesto — listo para pegar

### Gap #1 — Identificación del titular (al pie de `/privacy` y `/terms`)

> **Titular del Banco de Datos / Responsable del tratamiento (Yenda)**
> Razón social: [INSERTAR RAZÓN SOCIAL S.A.C.] · RUC: [INSERTAR] · Domicilio fiscal: [INSERTAR DIRECCIÓN COMPLETA EN LIMA, PERÚ] · Correo legal: legal@yenda.app · Correo de privacidad: privacidad@yenda.app

### Gap #2 — Categoría Especial (insertar como nuevo §05.bis en `/privacy`)

> **Tratamiento de datos sensibles (Categoría Especial)**
> Reconocemos que los datos de salud, historia clínica, diagnósticos, tratamientos, resultados de laboratorio e imágenes médicas que se procesan en {APP_NAME} constituyen **datos sensibles** o de **Categoría Especial** conforme al art. 2.5 y al art. 13.5 de la Ley N° 29733. Para su tratamiento se requiere consentimiento expreso, escrito y previo del titular (paciente), salvo las excepciones del art. 14 (atención médica de emergencia, salud pública, investigación con datos disociados). El Cliente (clínica/consultorio), en su calidad de Titular del Banco de Datos, es responsable de obtener y conservar dicho consentimiento; Yenda provee herramientas (módulo de consentimientos informados) para facilitar su captura y archivo.

### Gap #3 — Inscripción RNPDP

> **Inscripción ante la Autoridad Nacional de Protección de Datos Personales (ANPD)**
> Yenda mantiene inscritos sus bancos de datos personales ante la ANPD del Ministerio de Justicia conforme al art. 29 de la Ley 29733. Códigos de inscripción: [INSERTAR CÓDIGOS RNPDP]. El Cliente, como Titular del Banco de Datos de pacientes, debe inscribir su propio banco cuando corresponda (más de 5,000 titulares o tratamientos sistemáticos de Categoría Especial); Yenda provee asistencia documental para esta inscripción.

### Gap #4 — Consentimiento del paciente (CRÍTICO; insertar como §05.ter en `/privacy`)

> **Consentimiento del paciente**
> Antes de registrar los datos personales y clínicos de un paciente en {APP_NAME}, el profesional de salud o la clínica debe obtener del paciente (o de su representante legal en caso de menores o incapaces) el consentimiento informado, expreso y por escrito o por medio electrónico equivalente, conforme a la Ley 29414 (Derechos de las Personas Usuarias de los Servicios de Salud), la Ley 29733 (art. 13.5 y 14) y la NTS 139-MINSA. {APP_NAME} pone a disposición plantillas y un módulo de consentimientos informados para facilitar esta obligación. El paciente conserva sus derechos ARCO sobre sus datos en todo momento y puede ejercerlos directamente con la clínica o, subsidiariamente, escribiendo a privacidad@yenda.app.

### Gap #7 — Notificación a la ANPD (ampliar §08 en `/privacy`)

> Adicionalmente, en caso de incidente que afecte datos sensibles de manera significativa, Yenda comunicará el evento a la **Autoridad Nacional de Protección de Datos Personales (ANPD)** dentro del plazo razonable que la normativa establezca, y colaborará con el Cliente para que éste cumpla con sus propias obligaciones de notificación a los pacientes afectados.

### Gap #8 — Datos de menores (nuevo §05.quater en `/privacy`)

> **Tratamiento de datos de menores de edad**
> El tratamiento de datos personales de menores de 14 años requiere el consentimiento de sus padres o representantes legales (art. 14 Ley 29733 y Reglamento). En el contexto pediátrico, la clínica (Cliente) es responsable de recabar dicho consentimiento antes de registrar al paciente menor en {APP_NAME}.

### Gap #11 — Reclamo ante la ANPD (ampliar §10 en `/privacy`)

> Si consideras que tu solicitud ARCO no ha sido atendida adecuadamente, puedes presentar un reclamo ante la **Autoridad Nacional de Protección de Datos Personales (ANPD)** del Ministerio de Justicia y Derechos Humanos: Calle Scipión Llona 350, Miraflores, Lima · www.gob.pe/anpd · protecciondedatos@minjus.gob.pe.

---

## Riesgo legal pre-launch

**Honesto:** las páginas están **muy por encima** del promedio del mercado peruano de SaaS B2B. La estructura del rol legal (Cliente = Titular, Yenda = Encargado, art. 36) es correcta y bien argumentada. Pero hay tres riesgos reales:

1. **Multa administrativa de la ANPD** (alta probabilidad si hay denuncia formal). El régimen sancionador (art. 38 + escalas DS 003-2013) tipifica como **infracciones graves** (5–50 UIT, ~S/ 27,500–275,000) la falta de inscripción del banco de datos, el tratamiento de Categoría Especial sin consentimiento expreso del titular, y la falta de información transparente al titular. Los gaps #2, #3, #4 y #8 son los que activan estas escalas. El #4 es el más punzante: si un paciente reclama que sus datos están en Yenda sin haber firmado consentimiento y la clínica tampoco lo recabó, la ANPD puede sancionar **a Yenda solidariamente** como Encargado que sabía o debía saber.

2. **Demanda civil** (probabilidad baja, impacto medio). En Perú las demandas individuales por daño moral por violación de privacidad son raras y de cuantía baja; el mayor riesgo es una **demanda colectiva por organización profesional médica** (Colegio Médico) si hay incidente público.

3. **Reputacional** (alta). Es el riesgo más realista. Una clínica grande hace due diligence legal antes de firmar; si su abogado lee `/privacy` y no encuentra ni "Categoría Especial" ni "consentimiento del paciente" ni "RNPDP", **bloqueará la compra**. Para enterprise sales (Clínica Internacional, Auna, San Pablo) los gaps #1–#4 son deal-breakers.

**Verdict:** lanzable a beta cerrada con clínicas que ya conocen al fundador. **NO lanzable a registro público abierto** sin cerrar al menos #1, #2, #3, #4, #7 y #8. Los #5, #6, #9, #10, #11 pueden cerrarse en sprint 2 sin riesgo material.

---

## Recomendaciones extras

**Asesoría legal especializada (recomendado antes del lanzamiento público):**
- **Estudio Echecopar / Baker McKenzie Lima** — boutique de TMT y privacidad, han trabajado SaaS médicos.
- **Rodrigo, Elías & Medrano** — fuerte en regulatorio salud y data privacy.
- **Estudio Muñiz** — opción más comercial para early-stage; tienen práctica de protección de datos liderada por María del Pilar Sabogal.
- **Cravath / Hernández & Cía** — opción si quieres un único estudio que cubra corporativo + privacidad + laboral en preparación a futura ronda.

Costo orientativo: S/ 8,000–15,000 por una revisión completa de Privacy/Terms + memo de cumplimiento Ley 29733 + plantillas de consentimiento informado del paciente. Vale la pena cada sol antes de firmar la primera clínica grande.

**Inscripción en el RNPDP:**
- **Sí**, Yenda debe inscribir su propio banco "Usuarios y profesionales de salud" — es obligatorio independiente del volumen porque trata datos de identificación + contacto sistemáticamente.
- El banco "Pacientes" técnicamente lo inscribe la clínica (es su Titular), pero Yenda debe ofrecer guía documental.
- Trámite: portal www.gob.pe/anpd → formulario virtual → S/ 130 por banco → 30 días hábiles. No hay penalidad por inscribir tarde si se hace antes de cualquier denuncia, pero la falta es infracción grave una vez detectada.

**Quick wins adicionales (no jurídicos, pero amplifican credibilidad):**
- Agregar al footer del marketing site "Banco de datos inscrito en RNPDP N° XXXX-2026-JUS/ANPD" una vez tramitado.
- Publicar un **Trust Center** (`/trust`) que liste sub-encargados, certificaciones, status page y reportes de incidentes — crítico para enterprise sales en salud.
- Pedir a Supabase/Vercel los **DPA firmados** (Data Processing Addendum) y archivarlos; un abogado de clínica grande los va a pedir.

---

**Próximo paso sugerido:** abrir issue "P0 — Privacy/Terms 29733 hardening" con los 4 gaps críticos (#1, #2, #3, #4) como sub-tareas y bloquear el lanzamiento público hasta resolverlos. Los #7 y #8 pueden ir en el mismo PR sin coste marginal.
