# Pre-Scale Readiness — Plan de preparación antes de publicidad y ventas agresivas

> **Estado:** plan activo
> **Creado:** 2026-07-12
> **Contexto:** pilotos comerciales Vitra + Dra. Patricia en implementación (desde 2026-07-03, trials hasta 07-sep). Objetivo: usar la ventana de pilotos para blindar producto, proceso y operación ANTES de encender publicidad.
> **Owner:** Oscar (Founder) · asistido por Claude

La tesis: los pilotos no son solo clientes — son el **banco de pruebas de escenarios reales** y la **fábrica de tu material de ventas**. Este doc tiene 5 partes: (1) workflow seguro de cambios, (2) tests de escenarios, (3) gates antes de publicidad, (4) playbook de crecimiento, (5) cadencia semanal.

---

## 1 · Workflow seguro: probar modificaciones ANTES de que lleguen a main

### Cómo funciona hoy (honesto)
Rama de desarrollo → PR → merge a `main` → deploy directo a producción (Vercel). Las migraciones se aplican a la BD de producción antes del merge (regla: **solo aditivas** — columnas nuevas con DEFAULT, nunca DROP/RENAME — para que el código viejo las ignore). Ha funcionado porque la disciplina fue estricta, pero no hay red si falla.

### Lo que hay que instalar (en orden de retorno/esfuerzo)

| # | Medida | Cómo | Esfuerzo |
|---|---|---|---|
| 1 | **Preview Deployments de Vercel como staging** | Cada PR ya genera una URL de preview. Regla nueva: NADA se mergea sin abrir el preview y correr el smoke test (§1.1). El preview usa la BD de prod (aceptable HOY porque las migs son aditivas) | 0 — es disciplina, no código |
| 2 | **Smoke test manual de 5 min por PR** (§1.1) | Checklist fijo en la descripción del PR | 0 |
| 3 | **Branch protection en `main`** | GitHub Settings → require PR + build verde antes de merge. Evita el push directo accidental | 10 min |
| 4 | **Supabase Branching para migraciones riesgosas** | Cuando una mig NO sea aditiva (la primera vez que toque datos existentes): crear branch de BD, aplicar ahí, probar el preview contra el branch, luego prod | Config 1 vez; usar solo cuando aplique |
| 5 | **Org de staging dentro de prod** | Crear org "Yenda QA" (plan interno) donde probar flujos sin tocar datos de Vitra/Patricia. Es tu "clínica de juguete" permanente con datos realistas | 30 min |
| 6 | **Rollback documentado** | Vercel: Instant Rollback al deploy anterior (1 click, documentar dónde está). BD: por eso las migs aditivas — el rollback de código nunca requiere rollback de BD | 15 min de doc |

### 1.1 · Smoke test por PR (pegar como checklist en cada PR)
```
[ ] Login como recepcionista → crear cita en org QA → aparece en grilla
[ ] Marcar llegada → card azul → iniciar → verde → finalizar → gris
[ ] Dashboard carga sin errores en consola
[ ] /book (página pública) carga y muestra horarios
[ ] Si el PR tocó settings: cambiar el ajuste → verificar efecto → revertirlo
[ ] Si el PR tocó una migración: query de verificación en prod anotada en el PR
```

---

## 2 · Tests de escenarios (game days) — el pedido central

No son tests unitarios: son **simulacros de situaciones de negocio** que VAN a pasar. Uno por semana durante los pilotos (§5). Cada uno tiene guion, resultado esperado, y qué anotar.

### Escenario A — "La clínica nueva desde cero" (activación)
**Simula**: tu primer cliente post-publicidad, sin ti al lado.
1. Registro nuevo con email virgen → onboarding completo → configurar agenda (¡con inicio 07:15!) → crear doctor, servicios, primera cita → compartir horarios por WhatsApp.
2. **Cronometrar**: ¿cuántos minutos hasta la primera cita creada? (métrica de activación, §4).
3. **Anotar cada fricción**: campos confusos, pasos sin explicación, momentos de "¿y ahora qué?".
**Pasa si**: una persona no técnica llega a la primera cita en <15 min sin ayuda.

### Escenario B — "El vecino curioso" (aislamiento multi-tenant) ⚠️ el más importante
**Simula**: dos clínicas competidoras usando Yenda (Vitra y Patricia LO SON).
1. Con sesión de la org A, intentar acceder a datos de la org B: URLs directas con IDs ajenos (cita, paciente, presupuesto), llamadas API con `organization_id` ajeno en el payload, búsqueda de pacientes.
2. Verificar storage: intentar URL de un PDF de presupuesto de otra org.
**Pasa si**: TODO devuelve vacío/403. Un solo leak aquí es fin del negocio — es dato de salud (Ley 29733).

### Escenario C — "La tarjeta rechazada" (ciclo de vida de billing)
**Simula**: el cobro mensual falla (pasará constantemente con tarjetas peruanas).
1. En org QA con suscripción de prueba: simular pago rechazado (webhook manual o sandbox MP) → verificar email "Pago no procesado" + estado `grace` → verificar que la clínica SIGUE operando 7 días → simular expiración → suspensión con mensaje claro (no pantalla rota) → pago exitoso → reactivación limpia.
**Pasa si**: en ningún punto la doctora ve un error críptico ni pierde datos; los emails llegan y se entienden.

### Escenario D — "El cliente que crece" (límites de plan)
**Simula**: clínica del plan Independiente que necesita más asientos.
**Contexto real (corregido 2026-07-17)**: pacientes y citas son **ilimitados por decisión canónica** (migs 162/163) — la palanca de pricing son los ASIENTOS (doctores, recepcionistas, admins, consultorios), y esos **sí se bloquean** desde el soft-wall v0.15.16.
1. En org QA con plan Independiente: intentar agregar un 2º doctor → debe bloquear con mensaje claro + CTA de upgrade/addon.
2. Intentar agregar consultorio extra → ídem.
3. Hacer el upgrade → verificar que desbloquea al instante y que MP cobra el monto nuevo (ojo: MP Wave 2 pendiente — el cambio de plan aún no sincroniza monto con MP, verificar qué pasa hoy).
4. Verificar que crear pacientes y citas NUNCA se bloquea (es la promesa "ilimitado" — ver §4.5).
**Pasa si**: los asientos bloquean con mensaje vendedor (no error críptico), el upgrade desbloquea, y pacientes/citas fluyen sin fricción.

### Escenario E — "Se borró todo" (restore drill)
**Simula**: error humano o incidente que corrompe datos.
1. Activar PITR en Supabase (checklist founder, pendiente).
2. **Simulacro real**: en un proyecto CLON (no prod), restaurar a un punto de hace 1 hora. Cronometrar y documentar los pasos exactos.
**Pasa si**: sabes restaurar en <30 min con doc escrito. La diferencia entre "incidente" y "catástrofe" es haberlo practicado UNA vez antes de necesitarlo.

### Escenario F — "Yenda está caído" (respuesta a incidentes)
**Simula**: la doctora escribe "no puedo ver mi agenda" a las 8 AM.
1. Definir el runbook: ¿dónde miras primero? (Vercel status → Sentry → Supabase status) ¿Qué le respondes en los primeros 5 min? ¿Dónde publicas el estado? (statuspage, pendiente en checklist).
2. Simular: apagar algo inocuo en org QA y ejecutar el runbook completo, con mensaje real a un "cliente" de prueba.
**Pasa si**: hay UN documento con el árbol de decisión y templates de mensaje. Los SaaS que crecen no son los que nunca fallan — son los que fallan comunicando bien.

### Escenario G — "El WhatsApp de las 3 AM" (automatizaciones en hora local)
**Simula**: los crons de seguimiento (fertility follow-up) disparando fuera de horario.
1. Revisar contactos generados en org piloto: ¿todos dentro de la ventana horaria configurada? ¿Zona horaria Lima correcta?
2. Caso borde: paciente con seguimiento activo cuya cita se cancela/reagenda → ¿el seguimiento se ajusta o queda huérfano?
**Pasa si**: cero mensajes fuera de ventana y cero seguimientos huérfanos en los datos reales de los pilotos.

### Escenario H — "La recepcionista nueva" (permisos y roles)
**Simula**: rotación de personal (constante en clínicas).
1. Invitar miembro → verificar que ve SOLO lo de su rol → desactivarlo → verificar bloqueo de sesión inmediato (mig 118) → verificar que sus citas históricas siguen visibles con su nombre (responsable huérfano, ya resuelto hoy).
**Pasa si**: el offboarding es 1 click y no rompe nada histórico.

---

## 3 · Gates: NO encender publicidad hasta que… (checklist duro)

Orden por riesgo. Los 4 primeros son bloqueantes absolutos.

- [ ] **G1 — Escenario D (asientos) ejecutado y aprobado** — el enforcement de asientos YA existe (soft-wall v0.15.16) y pacientes/citas son ilimitados por diseño (migs 162/163); el gate es VERIFICARLO end-to-end, incl. qué pasa con el monto en MP al hacer upgrade (Wave 2 pendiente). *(corregido 2026-07-17: la versión anterior de este gate citaba un P0 obsoleto)*
- [ ] **G2 — Escenario B (aislamiento) ejecutado y aprobado** con evidencia escrita.
- [ ] **G3 — Emails de auth con branding** (hoy salen crudos de Supabase = parecen phishing; primera impresión del funnel de ads). Opción A: 30 min con Resend SMTP. *(P0 documentado)*
- [ ] **G4 — DKIM/SPF/DMARC en yenda.app** — sin esto, los emails del G3 caen a spam y las campañas queman dinero. *(checklist founder)*
- [ ] **G5 — PITR activado + restore drill hecho** (Escenario E).
- [ ] **G6 — Statuspage + runbook de incidentes** (Escenario F).
- [ ] **G7 — Placeholders legales Ley 29733 completados + RNPDP en trámite** (S/130, 30 días hábiles — iniciarlo YA por el lead time). *(checklist founder)*
- [ ] **G8 — Canal de soporte definido y comunicado** (email/WhatsApp con SLA respuesta <4h laborales; con 2 pilotos puede ser tu celular, con 20 clientes no).
- [ ] **G9 — Escenarios A y C ejecutados y aprobados.**
- [ ] **G10 — Caso de éxito de al menos 1 piloto** (§4) listo como material de venta.

---

## 4 · Playbook de crecimiento (lo que hacen los SaaS que llegan a grandes)

### 4.1 Los pilotos son tu fábrica de pruebas sociales
- **Pide permiso desde ya** a Vitra y Patricia para usar su caso (logo, cifras, testimonio). El descuento de piloto se justifica con esto.
- **Instrumenta el ROI mientras ocurre**: el módulo de seguimientos ya calcula "revenue recuperado atribuible" — ese número ES tu anuncio ("Yenda le recuperó S/X en tratamientos a un centro de fertilidad en Lima en 60 días"). Documenta el baseline AHORA (antes: Excel + cuántas pacientes perdidas/mes) para tener un antes/después honesto.
- Objetivo: 1 caso de éxito escrito + 1 testimonio en video de 60 seg por piloto al cierre del trial (07-sep).

### 4.2 Define TU métrica de activación (y persíguela)
Los SaaS exitosos no miden registros — miden el momento "aha". Propuesta para Yenda:
> **Org activada = creó ≥5 citas en sus primeros 7 días.**
Todo el onboarding se optimiza contra eso (Escenario A alimenta esto). Revisar semanalmente: cuántas orgs nuevas, cuántas activadas, dónde se caen las que no.

### 4.3 "Do things that don't scale" (Paul Graham) — tu fase actual
Para las primeras ~20 clínicas: **onboarding concierge** — tú (o alguien entrenado) las configura EN una videollamada de 30 min. No es deuda, es investigación: cada llamada te dice qué automatizar después. Los pilotos ya funcionan así; sistematízalo (agenda de 30 min, guion, checklist de salida).

### 4.4 Motor de referidos natural del dominio
Las doctoras se conocen entre sí (colegios médicos, congresos, grupos de WhatsApp). Al mes 2 de un cliente contento: "¿A qué colega le serviría esto? 1 mes gratis para ambas". Costo de adquisición casi cero vs. ads — los mejores SaaS B2B nicho (Veeva, ServiceTitan, Toast) crecieron por densidad de boca-a-boca en su vertical, no por publicidad masiva.

### 4.5 La publicidad, cuando llegue, apunta al dolor no al software
Ya tienes el posicionamiento (comparativo vs Doctoralia/Doctocliq): *"Doctoralia te consigue la primera cita. Yenda convierte esa cita en un tratamiento."* La landing ya está auditada. Falta: pixel/analytics de conversión ANTES del primer sol de ads (medir registro→activación→pago por canal, si no la publicidad es fe, no estrategia).

### 4.6 Cadencia de métricas de founder (15 min cada lunes)
MRR · orgs activas · orgs activadas/nuevas (§4.2) · churn · citas creadas/semana (uso real) · revenue recuperado acumulado de pilotos (tu número estrella) · tickets de soporte y su tema #1 (ese tema es tu próximo fix).

---

## 5 · Cadencia propuesta (semanas de piloto, desde 2026-07-13)

| Semana | Game day (§2) | Gate (§3) a cerrar | Growth (§4) |
|---|---|---|---|
| 1 | B (aislamiento) ⚠️ | G2 + iniciar G7 (RNPDP: lead time 30d) | Permiso de casos a pilotos + baseline ROI |
| 2 | D (límites) | **G1 (enforcement — dev)** | Definir métrica de activación + analytics |
| 3 | A (clínica desde cero) + C (billing) | G3 + G4 (emails + DNS) | Guion de onboarding concierge |
| 4 | E (restore) + F (incidentes) | G5 + G6 | Pixel/conversión listos |
| 5 | G (crons) + H (roles) | G8 + G9 | Borrador de caso de éxito |
| 6-8 | Re-runs de lo fallado | G10 | Testimonios + plan de referidos → **GO/NO-GO publicidad** |

---

*Relación con otros docs: los P0 técnicos viven en `docs/coming-updates-core.md` (este plan los referencia como gates, no los duplica). Checklist manual del founder: ídem. Comparativo competitivo: sesión 2026-07-09.*
