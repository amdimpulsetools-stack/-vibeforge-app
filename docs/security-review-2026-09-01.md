# Revisión de seguridad — Yenda · 2026-09-01

Revisión ofensiva (pensar como atacante) de solo lectura sobre el código en `main`.
Cuatro vectores en paralelo con agentes + auditoría de dependencias. Nada se ejecutó
contra producción. Revisión previa: `docs/security-review-2026-04-22.md`.

## Valoración

| | Nota |
|---|---|
| **Estado hoy** — ACTUALIZADO 1-sep tras verificar prod: **C1 NO está vivo** (ver abajo) | **6.5 / 10** |
| ~~Estado con C1 vivo (descartado por `pg_policies` en prod)~~ | ~~5 / 10~~ |
| **Base arquitectónica** (RLS 100 %, cifrado, headers, webhooks HMAC, ledgers append-only) | 8 / 10 |
| **Tras la tanda P0** (mig 235 + 2 rutas) | 7.5 / 10 |
| **Tras P0 + P1** (una semana de trabajo) | 8.5 / 10 |
| Promedio de SaaS emergente (misma etapa, sin revisión formal) | ≈ 4 / 10 |

Lectura honesta: los cimientos están claramente **por encima del promedio** — el 100 % de
las tablas con RLS, secretos cifrados AES-256-GCM, headers completos, webhooks de Meta y
Mercado Pago con HMAC en tiempo constante, kardex y caja append-only, founder con 2FA
persistida, y una cultura de revisión (abril → septiembre) que ya cerró los P0 anteriores.
La nota de hoy la hunde **un solo resto de migración legacy** (C1) que ninguna revisión
anterior miró, más dos huecos en superficies públicas nuevas (Culqi y portal).
Todos tienen fix pequeño.

## Progreso desde abril

Corregidos: F-01/F-02 (portal cross-org), F-04/F-10 (2FA founder en memoria y cosmética),
F-19 (Mercado Pago sin secreto en prod), F-03 (magic link hasheado).
Siguen abiertos: F-05 (rate limit en memoria), F-09 (envíos sin límite), F-21 (PII en
logs), F-25 (CSP `unsafe-inline`), F-11 (IA sin restricción por columna).

---

## CRÍTICA

### C1 · Cualquier usuario registrado puede hacerse owner de cualquier clínica

> **VERIFICADO EN PRODUCCIÓN (1-sep-2026): NO está vivo.** `pg_policies` sobre
> `organization_members` devolvió solo las 4 policies `org_*` de la mig 013 —
> las legacy de la 005 no existen en prod (quedaron fuera en algún momento,
> aunque los archivos del repo y `verify-database.sql` sugerían lo contrario).
> El hallazgo queda como deuda de higiene de migraciones (una base recreada
> desde los archivos SÍ lo tendría). Los DROP de la mig 235 pasan a ser no-ops
> preventivos; **A1 y A2 sí se confirmaron en prod** (`org_update_members` con
> `with_check = null`) y son la razón vigente para aplicar la 235.
- **Dónde**: `supabase/migrations/005_fix_rls_recursion.sql:24-34` crea
  `"Org owner can add members"` con `WITH CHECK (auth.uid() = user_id OR …)`.
  La 013 creó las policies nuevas pero **nunca eliminó las de la 005** (verificado: sus
  49 `DROP POLICY` no tocan `organization_members`; `scripts/verify-database.sql:588-595`
  las lista como esperadas). Las policies RLS son permisivas (OR): basta una.
- **Ataque**: cuenta de prueba gratis → `POST /rest/v1/organization_members
  {user_id: yo, organization_id: <clínica>, role: 'owner'}` con la anon key + mi JWT.
  El id de la org es descubrible (el slug de reserva por defecto es el UUID de la org,
  `/api/book/[slug]` lo devuelve). Desde ahí: pacientes, historias, pagos, config.
- **Confirmación en prod**: `SELECT policyname, cmd, with_check FROM pg_policies WHERE
  tablename='organization_members'` — si aparece la policy de 005, está vivo.
- **Fix**: **mig 235** (DROP de las 3 policies de escritura de 005). Ningún flujo
  legítimo dependía de ellas (alta de owner por `handle_new_user`, invitaciones por
  service role).

## ALTAS

| # | Hallazgo | Dónde | Fix |
|---|---|---|---|
| A1 | Admin se auto-promueve a owner / degrada al owner / cambia `organizations.owner_id` vía PostgREST (la API lo bloquea, REST no) | `013:101-107`, `013:83-85` | **mig 235** (trigger anti-escalada) + column-level REVOKE de `owner_id/deleted_at/is_active` en `organizations` |
| A2 | Miembro desactivado conserva acceso total: `get_user_org_ids`/`is_org_admin`/`get_user_org_role` ignoran `is_active`; un admin desactivado se reactiva solo | `013:51-67`, `032:32-37`, `members/[id]/route.ts:22-27` | **mig 235** (helpers con `is_active`) + revocar sesiones al desactivar (`auth.admin.signOut(userId,'global')`) |
| A3 | MFA (AAL2) solo se exige en el layout del dashboard; `/api/**` y PostgREST aceptan AAL1 → con la contraseña basta | `app/(dashboard)/layout.tsx:75-82`, `middleware.ts:211-213` | Comprobar AAL en middleware para `/api` + policies sensibles con `auth.jwt()->>'aal'` |
| A4 | Founder: `totp/setup` regenera el secreto sin exigir 2FA; `user_profiles` UPDATE permite escribir `totp_secret` | `founder/totp/setup/route.ts:28-47`, mig 072 | `setup` exige sesión 2FA vigente; `REVOKE UPDATE (totp_secret, totp_enabled)` |
| A5 | `register-invited` fija contraseña y confirma email de un usuario ya existente con solo el token; los admins ven los tokens | `register-invited/route.ts:64-105`, policy `023:25-28` | Rechazar si el usuario existe y está confirmado; ocultar `token` a admins |
| A6 | Admin auto-activa plan/suscripción y addons (fraude de facturación): `organization_subscriptions`/`plan_addons` INSERT/UPDATE por `is_org_admin` | `016:86-89`, `020:112-115` | Escritura solo `service_role` (verificar antes que ninguna página escriba desde el navegador) |
| A7 | **Webhook Culqi sin firma**: un POST fabricado marca un link como pagado y crea un `patient_payment` real que cancela deuda clínica y entra a Caja | `webhooks/culqi/route.ts:26-91` (TODO propio en :15-19) | Verificar el cargo contra la API de Culqi (`GET /v2/charges/{id}` con la secret key de la org, comparar monto/moneda/link) antes de reconciliar |
| A8 | **Portal: toma de control de cualquier paciente con su DNI** (reservar sin DNI → magic link → `register` con el DNI de la víctima re-liga la ficha y sobrescribe su `portal_email`) | `portal/register/route.ts:47-64` | No re-ligar fichas que ya tienen email/`portal_verified_at`; exigir coincidencia de email/teléfono o verificación por recepción |
| A9 | **Inyección de fórmulas** en Google Sheets (`USER_ENTERED`) y CSV desde el nombre del paciente en la reserva pública → exfiltración de la agenda a un dominio externo | `lib/google-sheets.ts:237,270-285`, `audit-log/export:193-198` | Prefijar `'` a celdas que empiecen por `= + - @ \t \r` (o `RAW` para columnas de texto) |

## MEDIAS

| # | Hallazgo | Dónde | Fix |
|---|---|---|---|
| M1 | Rate limit en memoria por lambda (inefectivo en Vercel): `/book`, `pay/charge`, webhooks, `mfa/recover`, `register-invited` | `lib/rate-limit.ts` | Upstash/Redis o contador en Postgres; Turnstile en `/book` |
| M2 | Webhook WhatsApp acepta sin firma si falta `WHATSAPP_APP_SECRET`; payload sin `entry` → 500 | `whatsapp/webhook/route.ts:150-164` | Exigir el secreto en prod; `Array.isArray(entry)` |
| M3 | OAuth Google: `state` sin nonce persistido, sin expiración, callback sin `auth.getUser()`; clave HMAC = service role key | `google/connect:50-54`, `callback:43-61` | Nonce en cookie httpOnly + auth + `GOOGLE_OAUTH_STATE_SECRET` |
| M4 | Reserva pública: cita se cuelga de la ficha de otro paciente por DNI; no valida rango horario ni `schedule_blocks` | `book/create:270-293`, `:214-228` | Exigir coincidencia adicional; validar horario y bloqueos |
| M5 | Mercado Pago: firma cubre `data.id` de la query pero se procesa `body.data.id`; sin frescura de `ts` | `mercadopago/webhook:72-105` | Igualar ids, ventana ±5 min, dedupe por `x-request-id` |
| M6 | Open relay interno: `email/send-test` envía HTML (con enlaces) a cualquier dirección desde `@yenda.app` | `email/send-test:60-85` | `to` limitado al propio usuario / miembros; owner/admin |
| M7 | IA: cuota mensual solo se descuenta en éxito → coste ilimitado | `ai-assistant/route.ts:645-793` | Contar antes de la primera llamada al modelo |
| M8 | IA: bypass del allowlist de tablas con `FROM (TABLE clinical_notes)` → historia clínica hacia Anthropic (RLS sí impide cross-org) | `ai-assistant/route.ts:324`, mig 195 | Rechazar `\bTABLE\s+`; validar con `EXPLAIN (FORMAT JSON)` |
| M9 | IA: pseudonimización por nombre de columna — un alias (`dni AS documento`) la anula; la pregunta cruda se loguea | `lib/pseudonymize-phi.ts`, `route.ts:770-781` | Redactar por valor (DNI 8 dígitos, celular 9xxxxxxxx, email) |
| M10 | Códigos de descuento: cualquier rol crea un 100 % y lo aplica; contador no atómico | `discount-codes/*`, mig 100 | owner/admin + `UPDATE … WHERE uses_count < max_uses` |
| M11 | Envíos de email/WhatsApp sin rate limit (F-09 abierto) | `notifications/send*`, `whatsapp/send` | Limiter + cuota diaria por org |
| M12 | RPCs de reportes (`get_admin_dashboard_stats_v3`, `get_reports_overview`, `get_at_risk_patients`, `get_patient_ltv`…) ignoran rol y la restricción "doctor solo ve sus pacientes" | migs 044/197/199/231/233 | `IF get_user_org_role(org) NOT IN ('owner','admin') THEN RAISE` |
| M13 | `notify_org_members` invocable por cualquier miembro con título/cuerpo libres (notificaciones falsas de "pago registrado") | mig 220 | `REVOKE EXECUTE FROM authenticated` (solo service/trigger) |
| M14 | Integridad cross-tenant por FKs sin org: `patient_payments.cash_shift_id`, `inventory_movements.product_id/lot_id` pueden apuntar a otra clínica y alterar su arqueo/stock (requiere conocer un UUID ajeno) | migs 214/209/232 | FKs compuestas `(id, organization_id)` como ya hace `pharmacy_sale_items` |
| M15 | ~40 rutas resuelven "la org" con `organization_members … .limit(1).single()` sin ORDER BY → usuario multi-org actúa sobre org arbitraria (adjuntos clínicos guardados bajo la org equivocada) | `clinical-attachments/route.ts:82-107`, antecedents, exam-orders… | Helper único `resolveOrgContext` que valide la org activa o la derive de la entidad |
| M16 | Límite de dispositivos falsificable (device id de cliente, cookie no httpOnly, sin cookie = sin control); revocación no invalida refresh tokens | `hooks/use-device-id.ts`, `middleware.ts:237`, `lib/auth/sessions.ts:234-262` | Revocar con `auth.admin.signOut`; sin cookie ⇒ registrar o bloquear |
| M17 | `mfa/recover` es oráculo de contraseñas (mensajes distintos), sin CAPTCHA | `mfa/recover/route.ts:90-113` | Respuesta única + captcha |
| M18 | Cookies de sesión legibles por JS (diseño de `@supabase/ssr`) + CSP `'unsafe-inline'` en `script-src` → cualquier XSS roba la sesión | `middleware.ts:23` | CSP con nonce por request + `strict-dynamic` |

## BAJAS (resumen)

Tokens de sesión del portal sin hash en BD · uploads con MIME del cliente, extensión sin
validar y `patient_id` sin validar como UUID; `org-assets` admite SVG · crons con
comparación no constante y `daily-summary` sin dedupe · `/pagar` reconstruye la URL del
fetch desde `Host` · `get_user_session_check(p_user_id)` y `get_ai_*_usage(org_id)`
SECURITY DEFINER sin comprobar membresía (oráculos) · `refresh_patient_recurring` y
`pharmacy_avg_cost` por UUID ajeno · `accept-invite` ignora `expires_at` · cookie
`founder_2fa_session` no se destruye en logout · contraseña mínima 6 en `register-invited`
y `reset-password` · `user_already_exists` enumera cuentas · secretos cifrados de
WhatsApp/Google/NubeFact legibles por cualquier miembro (dependen de `ENCRYPTION_KEY`) ·
`decrypt()` falla abierto · PII en logs (MP, daily-summary, IA) · errores PostgREST crudos
al cliente en ~10 rutas · filter injection en la búsqueda de pacientes (`.or(ilike.${q})`)
· `images.remotePatterns` abierto a `*.supabase.co` · `footer_html` del founder a
Chromium sin sanitizar · `xlsx` 0.18 sin fix (solo export) · transferencia de datos a
Anthropic: revisar DPA (Ley 29733) · Turnstile solo es real si "Captcha protection" está
activo en Supabase Auth (A VERIFICAR).

## Dependencias (`npm audit`, 1-sep)

29 vulnerabilidades: 1 crítica, 13 altas, 14 moderadas, 1 baja. Con fix disponible salvo
`xlsx`. Relevantes: **`sanitize-html`** (crítica, XSS por `xmp` y URIs `javascript:` en
atributos; se usa en editor de texto enriquecido, plantillas de correo y 5 PDFs clínicos)
→ `npm update sanitize-html`; **`next`** (alta: request smuggling en rewrites) → subir a
15.5.x; `postcss`, `@sentry/nextjs` → update. `xlsx` → migrar a `exceljs`.

---

## Plan de remediación

**P0 — hoy (bloquea la nota)**
1. Confirmar C1 en prod (`pg_policies`) y aplicar **mig 235** (C1 + A1 + A2). Sin
   migración de datos, sin cambios de UI.
2. A7 — verificación del cargo Culqi contra su API antes de reconciliar.
3. A8 — `portal/register`: no re-ligar fichas ya reclamadas.
4. `npm update sanitize-html next postcss @sentry/nextjs`.

**P1 — esta semana**
A3 (AAL en middleware), A4 (setup TOTP), A5 (register-invited), A6 (suscripciones solo
service role), A9 (fórmulas Sheets/CSV), M1 (rate limit distribuido + Turnstile en
`/book`), M2 (secreto WhatsApp obligatorio), M3 (state OAuth), M7-M9 (IA), M10 (descuentos),
M11 (límite de envíos), M12 (rol en RPCs de reportes), M13 (`notify_org_members`).

**P2 — siguiente sprint**
M4-M6, M14-M18 y las bajas, en este orden: M15 (helper de org) → M14 (FKs compuestas) →
M18 (CSP con nonce) → resto.

## Lo que está bien (y conviene conservar como patrón)

RLS habilitada en las 119 tablas, helpers `SECURITY DEFINER STABLE` con `search_path`
fijo y `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE` (las funciones nuevas nacen cerradas) ·
`getUser()` (no `getSession()`) en middleware · headers: HSTS preload, `frame-ancestors
'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP acotada por ruta · Culqi
público con token de 24 bytes, monto siempre de BD y claim atómico · Mercado Pago y
WhatsApp con HMAC en tiempo constante · magic links del portal hasheados, 15 min, un uso
· founder con 3 capas y 2FA persistida en BD · invitaciones UUID v4 con 7 días y un uso ·
roles nunca tomados del cliente · MFA recovery con scrypt · cero SQL crudo, Zod en rutas
clave, `from(tabla)` siempre desde mapas fijos · secretos cifrados y enmascarados en GET,
`encrypt()` falla cerrado en prod · `ai_readonly_query` SECURITY INVOKER con timeout ·
kardex y caja append-only, correlativos con advisory lock, activación de addons atómica ·
Sentry sin PII · patrones ejemplares para copiar: `clinical-notes/[id]` (org desde la
entidad), `addons/route.ts` (org explícita validada), `budgets/assign`, `live-notifications/emit`.
