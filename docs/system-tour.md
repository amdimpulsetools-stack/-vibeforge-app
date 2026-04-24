# System Tour — Yenda / VibeForge

**Para:** ti mismo en 6 meses, o cualquier dev que herede esto.
**Última actualización:** 2026-04-24 (v0.12.4)

Este doc es la guía mental del sistema. No reemplaza al código, pero te dice **dónde mirar** cuando algo rompe.

---

## 1. Modelo mental en 30 segundos

Yenda es una **SaaS multi-tenant de gestión clínica para LATAM** (foco Perú). Cada `organization` es una clínica; cada `membership` conecta usuarios a orgs con un `role` (owner/admin/doctor/recep/…). Todo dato clínico está aislado por `organization_id` con **RLS en Supabase**.

Tres capas:

1. **Frontend** — Next.js 15 App Router + Tailwind + shadcn/ui + Radix
2. **Backend** — Supabase Postgres (RLS + Auth + Storage) y API Routes de Next para orquestación / integraciones
3. **Integraciones** — Mercado Pago (cobros online), Resend (email), Vercel (deploy), Sentry (errors)

---

## 2. Flujos end-to-end

### 2.1 Login → Scheduler → Cita → Pago

```
/login (Supabase magic link / password)
   ↓  middleware valida sesión + carga membership
/dashboard (KPIs del día)
   ↓
/scheduler (vista día/semana por doctor)
   ↓  click en slot vacío → modal Nueva Cita
   ↓  DNI → patient lookup (autocomplete)
   ↓  servicio + doctor + slot → INSERT appointments
   ↓
Sidebar de la cita:
   - Cobros (payments) — inline discount opcional
   - Consentimiento (si services.requires_consent)
   - Historia clínica → clinical_notes + signos + Dx CIE-10
   - Plan de tratamiento (si existe) — banner "Agendar como sesión"
```

### 2.2 Paciente en portal

```
/book/<org-slug>         — booking público (anónimo) si booking_settings.is_enabled
/portal/<org-slug>       — portal del paciente (magic-link) si booking_settings.portal_enabled
```

El paciente ve: próximas citas, historial, su plan de tratamiento con saldo, recetas y órdenes. Cancela si `portal_allow_cancel = true` respetando `portal_min_cancel_hours`.

### 2.3 Plan de tratamiento (multi-servicio)

```
clinical_notes.treatment_plan → treatment_plans (header)
                              └── treatment_plan_items (servicio × cantidad × precio)
                              └── treatment_plan_sessions (una por sesión esperada)

Cuando agendas una cita:
  - Si paciente tiene plan activo → banner azul
  - "Agendar como sesión" → appointments.treatment_plan_session_id = <session>
  - Al completar → session.status = 'completed'

Saldo del plan = Σ items.total − Σ payments.amount_applied_to_plan
```

Soporta 3 modelos de cobro: sesión-por-sesión, abonos parciales, pago total adelantado. La tabla `plan_payment_allocations` registra cómo cada pago se reparte entre sesiones.

### 2.4 Consentimiento informado (Ley 29414)

```
services.requires_consent = TRUE
   ↓
Cita con ese servicio:
   - Banner ámbar en sidebar + nota clínica
   - "Subir consentimiento firmado" → camera en mobile
   - clinical_attachments (Storage) + clinical_notes.consent_registered = true
```

Tier 1 (actual): adjunto por foto.
Tier 2 (roadmap): plantillas de consentimiento + firma digital.

---

## 3. Dónde vive qué (mapa de archivos)

### Rutas (App Router)

| Ruta | Descripción |
|---|---|
| `app/(auth)/login` | Login email+password + magic link |
| `app/(dashboard)/dashboard` | KPIs principales |
| `app/(dashboard)/scheduler` | Vista calendario — el corazón |
| `app/(dashboard)/patients` | CRUD pacientes |
| `app/(dashboard)/reports` | Operacional / Financiero / Retención / Marketing |
| `app/(dashboard)/admin` | CRUD doctores, servicios, consultorios, plantillas |
| `app/(dashboard)/settings` | Config org: agenda, portal, correos, MP |
| `app/(dashboard)/founder` | Panel interno (solo `is_founder = true`, requiere 2FA) |
| `app/book/[slug]` | Booking público |
| `app/portal/[slug]` | Portal del paciente |
| `app/api/*` | Endpoints server (MP webhooks, PDFs, adjuntos firmados, etc.) |

### Librería compartida

| Path | Para qué |
|---|---|
| `lib/supabase/client.ts` | Browser client |
| `lib/supabase/server.ts` | Server client (cookies) |
| `lib/supabase/middleware.ts` | Refresh de sesión en edge |
| `lib/supabase/admin.ts` | Service-role (SOLO en rutas server, NUNCA expuesto) |
| `lib/founder-auth.ts` | 2FA DB-backed (tabla `founder_2fa_sessions`) |
| `lib/require-founder.ts` | Guard para rutas founder |
| `lib/pseudonymize-phi.ts` | Quita PHI antes de llamadas a LLM |
| `lib/membership.ts` | Resuelve `membership` del usuario actual |
| `hooks/use-*.ts` | React Query hooks por entidad |

### Base de datos

`supabase/migrations/` — versionadas, nunca edites una aplicada. La secuencia termina en **104** (founder 2fa sessions). Índices clave en **103** (scheduler y búsqueda).

**Extensiones activas:** `pg_trgm` (search pacientes), `pgcrypto`.

---

## 4. Convenciones críticas (no rompan esto)

1. **RLS siempre.** Toda tabla con datos de org debe tener RLS activo y política por `organization_id = membership.organization_id`.
2. **Defense-in-depth.** Además de RLS, queries server-side deben filtrar explícitamente por `organization_id` — RLS es la red de seguridad, no el único control.
3. **Nunca exponer service-role en client.** `lib/supabase/admin.ts` solo se importa en `app/api/**` y Server Actions.
4. **PHI nunca llega al LLM sin pseudonimizar.** Usa `lib/pseudonymize-phi.ts`.
5. **Snake_case en DB, camelCase en TS.** Generar tipos con `npm run types` después de cada migración.
6. **Server Components por default.** `"use client"` solo si hay state o event handlers.
7. **Migraciones numeradas en orden.** Si dos devs colisionan, renombra; no fuerces.
8. **Forms = React Hook Form + Zod.** No construyas validación manual.
9. **Mutations:** Server Actions para simples, API routes para flujos complejos (webhooks, files).

---

## 5. Gotchas operativos

### Scheduler
- El índice O(1) por slot se construye en `day-view.tsx` con `buildAppointmentIndices()`. No vuelvas a loop-dentro-de-loop.
- Form del modal **desvincula `patient_id` automáticamente** si cambias nombre/teléfono post-DNI lookup. Fix en commit `47d1fdc` — no lo revirtas.

### Portal / Booking
- `booking_settings.allow_online_booking = false` → el botón "Agendar" muestra modal con WhatsApp. El portal sigue funcionando para ver citas.
- El slug público es único por org, viene de `organizations.slug`.

### Consentimiento
- Si firmas una nota clínica, queda **bloqueada**. No subas consentimientos después — siempre antes de firmar.
- `clinical_notes.consent_registered` es el flag; el adjunto físico está en `clinical_attachments`.

### Founder panel
- `is_founder = true` en `profiles` + cookie `founder_2fa` válida (expira, está en DB desde migración 104).
- En Vercel serverless **no uses Maps en memoria** — siempre DB.

### Mercado Pago
- Webhook en `/api/mp/webhook`. Valida el prefix del `data.id` (ver F-19 pendiente) para evitar spoof.
- Cada pago se liga a `appointments.id` o `treatment_plan_id`.

### LLM / pseudonimización
- Toda llamada a modelo externo pasa por `pseudonymizePhi()` primero. No saltes este paso aunque "sea un prompt corto".

---

## 6. Comandos de mantenimiento

```bash
npm run dev                  # Dev local
npm run build                # Build prod
npm run types                # Regenerar types/database.ts desde Supabase
npm run lint                 # ESLint
```

### Checklist de salud (mensual)

- [ ] Revisar Sentry: errores no triages
- [ ] Ver Supabase → Reports → slow queries
- [ ] Correr `npm audit` y revisar CVEs altos
- [ ] Verificar que migraciones locales = Supabase prod (`supabase db diff`)
- [ ] Rotar keys viejas si hubo turn-over
- [ ] Backup manual de Storage (Supabase auto-backea DB, no Storage)

### Cuando rompe algo

1. **Login roto** → revisar middleware + cookies SameSite + Supabase Auth settings
2. **Scheduler lento** → `EXPLAIN ANALYZE` de la query de appointments; confirmar que migración 103 está
3. **Adjuntos no cargan** → signed URLs expiran en 1h; regenerar. Revisar bucket policies.
4. **MP no registra pago** → logs de `/api/mp/webhook`; verificar firma + prefix
5. **Portal de paciente en blanco** → `booking_settings.portal_enabled`; magic link caducado

---

## 7. Roadmap cercano (ver `COMING-UPDATES.md`)

Lo que está en el freezer hasta estabilizar el pilot de Vitra:

- F-03 magic-link hash en DB
- F-05 rate limiter en Redis (upstash)
- F-19 MP webhook prefix check
- Tier 2 consentimiento: plantillas + firma digital
- Design system unification (queda ~6 modales hand-rolled, ~13 `confirm()` nativos)
- Módulo de laboratorio (FIV/IIU tracking avanzado)

---

## 8. Contactos y recursos

- **Prod:** https://yenda.app
- **Supabase project:** (ver `.env.local`)
- **Vercel dashboard:** deploy de `main`
- **Repo:** branch de trabajo `claude/review-pdr-c4vLE`
- **PRD:** `PRD.md` en raíz — fuente de verdad de alcance y decisiones
- **Updates log:** `COMING-UPDATES.md` — lo que viene y lo que se movió a backlog

---

**Regla de oro:** cuando algo se sienta "raro" en el sistema, primero lee el PRD para ver si es comportamiento esperado, después mira la migración relevante, y solo entonces toca código. La mayoría de los bugs que reportan son features mal entendidas.
