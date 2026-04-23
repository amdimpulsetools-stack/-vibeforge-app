# Security Review — 2026-04-22

**Scope:** VibeForge multi-tenant medical SaaS (Peru, Ley 29733 PHI).
**Reviewer:** Senior Security Engineer (AI-assisted static audit).
**Commit state:** working tree at HEAD, migrations 001–102, API routes under `app/api/**`.

---

## Executive summary

- **Portal paciente has cross-tenant authorization gaps.** Several `/api/portal/*` endpoints use the admin client (service-role, bypasses RLS) and filter by the session's `patient_id` but do not re-validate the `organization_id` per request beyond cookie lookup; any bug that allows a session to outlive a patient transfer or that trusts client-supplied IDs goes directly to PHI. See F-01/F-02.
- **`clinical_attachments` and several PHI-adjacent tables never have RLS policies defined in migrations for INSERT/UPDATE outside of doctor constraints or are granted very broadly via `is_active = true` and tenant membership; patient_portal_tokens has RLS enabled but no policies (effective deny-all except service-role — intentional but dangerous if a route forgets admin client).**
- **Founder panel uses in-memory 2FA sessions (`lib/founder-auth.ts`)** — resets on each deploy/cold-start, survives across processes only by luck, and cannot be revoked. On Vercel (multi-lambda) this is also effectively broken.
- **Portal magic-link token is accepted over GET query-string** (`/api/portal/auth/verify?token=...`) — will be written to access logs and Referer headers; token also stored plain-text in DB (not hashed).
- **Rate limiting is in-memory only** (`lib/rate-limit.ts`) — per-process, so on serverless multi-instance deploy it provides ~zero protection on login, portal magic link, AI, or payment endpoints.

## Severity distribution

| P0 | P1 | P2 | P3 | INFO |
|----|----|----|----|------|
| 2  | 9  | 11 | 6  | 4    |

## Findings overview

| ID    | Sev | Area                  | File:Line                                                        | Description |
|-------|-----|-----------------------|------------------------------------------------------------------|-------------|
| F-01  | P0  | Portal paciente       | `app/api/portal/plans/route.ts:37-40`                            | `patient_payments` queried with admin client filtered only by `treatment_plan_id` — no `organization_id` filter — returns payments across orgs for any colliding plan_id. |
| F-02  | P0  | Portal paciente       | `app/api/portal/appointments/cancel/route.ts:80-83`              | UPDATE uses admin client with `.eq("id", appointment_id)` only; scope check earlier, but UPDATE lacks the org+patient guard → TOCTOU if session re-used. |
| F-03  | P1  | Portal auth           | `app/api/portal/auth/request-link/route.ts:108` + `verify/route.ts:30-46` | Magic-link token delivered via GET querystring and stored plaintext in DB. Leaks to access logs, browser history, Referer. |
| F-04  | P1  | Founder panel         | `lib/founder-auth.ts:11-15`                                      | In-memory 2FA session store — breaks in serverless / multi-instance deploys; no revocation; restart = everyone kicked or accepted inconsistently. |
| F-05  | P1  | API rate-limit        | `lib/rate-limit.ts:11`                                           | In-memory sliding-window limiter — per-process; on Vercel Fluid/multi-lambda, attackers scale linearly with invocations. Bypasses all AI/portal/auth limits. |
| F-06  | P1  | Clinical API          | `app/api/clinical-attachments/[id]/route.ts:44-68`               | GET by id has NO org-ownership check before signing URL. Any authed user of ANY org can signed-URL any attachment by enumerating IDs. |
| F-07  | P1  | Clinical API          | `app/api/patients/[id]/anthropometry/route.ts:20-25,129-132`     | GET/DELETE do not verify that `patient_id` or `entryId` belong to caller's org. Relies on RLS, but no UPDATE policy-path + ambiguous org scope. |
| F-08  | P1  | RLS gap               | `supabase/migrations/053_clinical_history_extensions.sql:123-130`| `clinical_attachments` — no UPDATE policy. Not acutely dangerous (no UPDATE calls today) but silently allows future updates only via service-role. |
| F-09  | P1  | Notifications         | `app/api/notifications/send/route.ts` / `send-patient/route.ts`  | No rate limit. Authenticated users can trigger arbitrary outbound email blasts per org (spam/phishing abuse). |
| F-10  | P1  | Founder                | `app/api/founder/stats/*` (all)                                 | Founder stats endpoints require only `is_founder` flag, NOT the 2FA session cookie from `lib/founder-auth.ts`. 2FA is effectively cosmetic. |
| F-11  | P1  | AI assistant          | `app/api/ai-assistant/route.ts:147-188, 395-424`                 | LLM-generated SQL validated by regex; CTE allowance + `dblink`/`pg_*` blocks in DB layer, but no **column-level** restriction. Any clinical/PII-bearing table reachable through RLS is fair game for arbitrary aggregation. |
| F-12  | P2  | Portal session        | `lib/portal-auth.ts:31-37`                                       | `sameSite: "lax"` + 30-day session + session token stored plain-text in DB. On compromise of DB read, sessions hijackable. |
| F-13  | P2  | Cookie secure flag    | `lib/portal-auth.ts:33` / `app/api/founder/totp/verify/route.ts:73` | `secure: process.env.NODE_ENV === "production"` — behind HTTPS-terminating proxy on staging/preview, cookie lacks Secure. |
| F-14  | P2  | Booking (public)      | `app/api/book/[slug]/route.ts` (all fetches)                     | `existing_appointments` returned to the public booking endpoint leaks doctor×office×time windows (enumeration of clinic schedule and throughput). |
| F-15  | P2  | Booking (public)      | `app/api/book/[slug]/create/route.ts:249-282`                    | DNI-based patient lookup allows anonymous DNI enumeration — attacker can submit booking with guessed DNI and infer registered patients (existingPatient re-use vs new creation). |
| F-16  | P2  | Clinical attachments  | `app/api/clinical-attachments/route.ts:13-27`                    | GET endpoint has no mandatory `patient_id` filter when called without query params — returns full org dump (RLS scoped but pagination missing). No pagination → DoS on clinics with thousands of attachments. |
| F-17  | P2  | File upload           | `app/api/clinical-attachments/route.ts:56-64,76-77`              | MIME check by `file.type` only (user-controlled); no magic-bytes sniff; storage path prefixed by `organization_id/patientId/Date.now()` — no extension allowlist, only a blocklist-by-absence. |
| F-18  | P2  | Treatment plans API   | `app/api/treatment-plans/[id]/route.ts:67-73`                    | Session update eq's `treatment_plan_id` but NOT `organization_id` on the `treatment_sessions` update. Admin bypass risk if session_id is forged from cross-org plan (partial — plan check above reduces risk). |
| F-19  | P2  | Webhook verification  | `app/api/mercadopago/webhook/route.ts:33-44`                     | `isTestMode = accessToken.startsWith("TEST-") \|\| startsWith("APP_USR-")` → `APP_USR-` is also the PRODUCTION prefix. Logic branch means missing webhook secret in prod silently disables signature verification. |
| F-20  | P2  | AI assistant          | `app/api/ai-assistant/route.ts:316-330`                          | AI gate limited to `['owner','admin']`. Good, but the SQL executes under the caller's RLS — non-admin members with SQL smuggled via the prompt could still read all org PHI. (Mitigated by role check, flagging the design tension.) |
| F-21  | P2  | Logs                  | `app/api/mercadopago/webhook/route.ts:184`, `app/api/ai-assistant/route.ts:453,508` | `console.log` writes payer email, full SQL (can include patient names/DNIs from prompts). Vercel log sinks are not HIPAA/Ley-29733-aware. |
| F-22  | P2  | Portal session reuse  | `lib/portal-auth.ts:42-56`                                       | `getPortalSession(slug?)` accepts optional slug — callers (e.g., cancel/profile) sometimes pass slug, others don't. Inconsistent binding to org on privileged operations. |
| F-23  | P3  | RLS                   | `supabase/migrations/093_patient_portal.sql:19-22`               | `patient_portal_tokens` has RLS ENABLED but no policies → deny-all (good). However no comment/guard prevents a future migration from adding `USING (true)`. Worth pinning with explicit deny-all policy. |
| F-24  | P3  | dangerouslySetInnerHTML | `app/(dashboard)/settings/email-settings-tab.tsx:1156`          | Preview renders `previewBodyHtml` — if this path ever renders server-side templates containing user input, XSS is possible; currently templated, but not sanitized via DOMPurify. |
| F-25  | P3  | CSP                   | `lib/supabase/middleware.ts:11-13`                               | `'unsafe-inline'` in `script-src` in prod (only `unsafe-eval` stripped). Medium-value since Next runtime doesn't need it; blocks recommended CSP nonce pattern. |
| F-26  | P3  | Middleware matcher    | `middleware.ts:9-11`                                             | Public-path allowlist in `lib/supabase/middleware.ts:75` treats `/api` as public — every API route relies on its own auth check. One missing check = full bypass. |
| F-27  | P3  | Session fixation      | `app/api/portal/auth/verify/route.ts:59-62`                      | Token invalidated by `used_at` update AFTER session creation. If insertion succeeds but update fails (rare), same link is reusable. |
| F-28  | P3  | Email templates HTML  | `app/api/notifications/send/route.ts:181-193`                    | HTML-escaping of variables is done — but template.body (plain) is not escaped before being re-passed, and `body_html` is treated as trusted author content. OK for now, but `email_templates.body_html` is a user-mutable stored-XSS sink if ever rendered in-app. |
| F-29  | INFO| Encryption            | `lib/encryption.ts:1-91`                                         | AES-256-GCM with random IV + authTag. Good primitive. Key is optional (dev fallback returns plaintext). |
| F-30  | INFO| Middleware            | `lib/supabase/middleware.ts:26-35`                               | Robust security headers (HSTS, X-Frame-Options:DENY, Referrer-Policy, Permissions-Policy). |
| F-31  | INFO| Payment webhook       | `app/api/mercadopago/webhook/route.ts:67-78`                     | Constant-time HMAC comparison. Correct. |
| F-32  | INFO| Auth callback         | `app/api/auth/callback/route.ts:8-10`                            | Open-redirect guarded by `startsWith('/') && !startsWith('//')`. Correct. |

---

## Findings (grouped)

### P0 — critical

#### F-01 — Portal `patient_payments` query missing organization_id filter (cross-tenant PHI leak)
- **Location:** `app/api/portal/plans/route.ts:37-40`
- **Description:** The portal plans endpoint uses the admin client (service role, bypasses RLS) and queries `patient_payments` with only `.in("treatment_plan_id", planIds)`. There is no `.eq("organization_id", session.organization_id)` filter. `treatment_plan_id` is a UUID and in practice collisions are near-zero, but defense-in-depth is broken: if a plan ID is ever reused by import, restore, or test data, this returns the other org's payment rows — dollar amounts and plan IDs — to an unauthenticated patient (portal session is not tied to an authenticated Supabase user).
- **Attack scenario:** Portal session of org A is issued; that org's active plan list contains plan X. A seeded/imported plan X exists in org B. The endpoint returns org-B payment rows commingled into `paidByPlan` and leaks their existence via the computed `paid` field.
- **Fix:**
  ```ts
  const { data: payments } = await supabase
    .from("patient_payments")
    .select("treatment_plan_id, amount")
    .eq("organization_id", session.organization_id) // add this
    .eq("patient_id", session.patient_id)           // and this
    .in("treatment_plan_id", planIds);
  ```

#### F-02 — Portal cancel UPDATE lacks org+patient constraints
- **Location:** `app/api/portal/appointments/cancel/route.ts:80-83`
- **Description:** The SELECT before the UPDATE correctly filters by `patient_id` and `organization_id`, but the UPDATE only filters by `id`:
  ```ts
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointment_id);
  ```
  Because this uses the admin client (RLS off), a single forged request with a valid portal session cookie plus a guessed UUID could cancel any org's appointment. The earlier lookup is defense-in-depth only and is subject to TOCTOU (race between the lookup and the update).
- **Attack scenario:** Attacker with valid portal session races a POST with a different `appointment_id` (the guard runs on the first request; then pivot). Or, simpler: modify the request after debugging the guard check.
- **Fix:** Repeat the scoping constraint on the UPDATE:
  ```ts
  .update({ status: "cancelled" })
  .eq("id", appointment_id)
  .eq("patient_id", session.patient_id)
  .eq("organization_id", session.organization_id);
  ```

### P1 — high

#### F-03 — Magic-link token delivered in URL and stored plaintext
- **Location:** `app/api/portal/auth/request-link/route.ts:108`, `app/api/portal/auth/verify/route.ts:30-46`, `supabase/migrations/093_patient_portal.sql:6-14`
- **Description:** `verifyUrl = ${origin}/portal/${slug}/verify?token=${token}` — tokens are sent as URL query-params, which leak via (a) Referer headers to any resource the verify page loads, (b) CDN/proxy/Vercel access logs, (c) browser history, (d) email-client link preview services. Tokens are also stored as plaintext in `patient_portal_tokens.token` — any DB read compromise replays all outstanding links.
- **Attack scenario:** Patient forwards the email; attacker opens the link → single-use but still valid until `used_at` is set. Or: a logging sidecar/SIEM captures the token; an operator later replays the login.
- **Fix:** (1) Deliver token to a one-shot POST endpoint that sets the cookie; the email link can hit an intermediate page that POSTs and strips the token from the URL on success. (2) Store `sha256(token)` in DB; compare hashes on verify.

#### F-04 — Founder 2FA sessions held in per-process in-memory Map
- **Location:** `lib/founder-auth.ts:11-59`
- **Description:** The `sessions` Map lives only in the current Node process. On Vercel (and any multi-instance runtime), each function instance has its own Map → a founder who 2FAs against instance A is "logged in" there but treated as unauth on instance B. The code will still reject because session lookups fail; however TTL is also unrevocable (no DB), and on deploys every session disappears. The cookie is issued but not validated by `/api/founder/*` routes (see F-10).
- **Attack scenario:** Deployment wipes all founder sessions silently. Worse, the founder route code paths that DO use the cookie (`FOUNDER_SESSION_COOKIE`) are inconsistent with those that only check `is_founder` on profile — if a founder's password is phished, an attacker without 2FA still reaches `/api/founder/*` routes that skip the 2FA cookie check.
- **Fix:** Persist 2FA sessions in a DB table (`founder_2fa_sessions(id, user_id, token_hash, expires_at, revoked_at)`) or a shared store (Redis). Require the cookie on *every* `app/api/founder/**` handler via a middleware helper.

#### F-05 — In-memory rate limiter (ineffective under serverless)
- **Location:** `lib/rate-limit.ts:11` (`const store = new Map(...)`)
- **Description:** Limits are enforced per Node process. On Vercel, each lambda invocation may run in a cold start or a different instance — attacker who parallelizes requests gets near-unlimited throughput on `portal-link`, `aiLimiter`, `paymentLimiter`, `bookingCreateLimiter`, `emailLimiter`. Affects: OTP/magic-link abuse (F-03), AI cost runaway, spam via `/api/notifications/send`, brute-forcing webhook secrets, booking storm.
- **Fix:** Use `@upstash/ratelimit` (Redis) or Supabase-backed token-bucket via RPC. Namespace keys by endpoint+identifier.

#### F-06 — Clinical attachments GET by id skips org-ownership check before creating signed URL
- **Location:** `app/api/clinical-attachments/[id]/route.ts:44-68`
- **Description:**
  ```ts
  const { data: attachment } = await supabase
    .from("clinical_attachments")
    .select("storage_path, file_name, file_type")
    .eq("id", id)
    .single();
  // ...
  const { data: signedUrl } = await supabase.storage
    .from("clinical-files")
    .createSignedUrl(attachment.storage_path, 300);
  ```
  Unlike DELETE on the same file, GET does not fetch `organization_id` or compare to the caller's membership. RLS would protect the SELECT — BUT the `createSignedUrl` call uses the user-authenticated client, so Storage RLS applies on the storage object; if storage RLS isn't locked to the org prefix (see `015a_storage_buckets.sql`), the URL is generated regardless of ownership.
- **Attack scenario:** Attacker enumerates attachment UUIDs (via timing or leaked log) and fetches the signed URL. Even if Supabase Storage RLS blocks a raw anon fetch, signed URLs bypass RLS by design for the path lifetime (5 min).
- **Fix:** Mirror the DELETE pattern — fetch `organization_id`, compare to user's membership, then generate signed URL.

#### F-07 — Patient anthropometry GET/DELETE don't verify org
- **Location:** `app/api/patients/[id]/anthropometry/route.ts:20-30, 109-138`
- **Description:** GET selects `patient_anthropometry WHERE patient_id = $1` — relies entirely on RLS. DELETE does the same with `entryId`. RLS policy on this table is `organization_id IN (get user orgs)` so cross-tenant is blocked, BUT within a user who belongs to multiple orgs (e.g., a doctor working across two clinics), the endpoint returns rows from both orgs mixed when queried under either org context. There's no explicit org check or scoping.
- **Fix:** Pull caller's active `organization_id` from an explicit context (cookie/header) and `.eq("organization_id", ...)`.

#### F-08 — `clinical_attachments` missing UPDATE policy
- **Location:** `supabase/migrations/053_clinical_history_extensions.sql:123-130`
- **Description:** Only SELECT/INSERT/DELETE policies. UPDATE is silently denied today (no operation performed), but (1) any service-role write can mutate, silently bypassing any future constraint, and (2) it diverges from the treatment_plans/clinical_notes pattern which has explicit UPDATE policies.
- **Fix:** Add `CREATE POLICY "clinical_attachments_update" ON clinical_attachments FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));` or explicitly deny.

#### F-09 — Notification endpoints lack rate limiting → outbound email abuse
- **Location:** `app/api/notifications/send/route.ts:25-55`, `app/api/notifications/send-patient/route.ts:22-65`
- **Description:** Either endpoint lets an authenticated member trigger a templated email to an arbitrary patient in their org. No rate-limit. A malicious or compromised doctor/reception account can enumerate all patients and blast emails — weaponized for phishing under the clinic's brand.
- **Fix:** `emailLimiter(user.id)` on both. Also enforce a per-org per-hour cap (e.g., 200 emails/hr).

#### F-10 — Founder routes trust `is_founder` flag only; 2FA cookie unchecked
- **Location:** `app/api/founder/route.ts:17-25`, `app/api/founder/stats/*`
- **Description:** `GET /api/founder` and all `/api/founder/stats/**` routes check `profile.is_founder` but not `FOUNDER_SESSION_COOKIE`. The 2FA setup/verify endpoints exist, but nothing gates platform-wide PHI/revenue data on them. 2FA is essentially advisory.
- **Fix:** Extract a `requireFounder2FA(request)` helper that verifies both `is_founder` and the 2FA cookie via `validateFounder2FASession`. Use it on all `/api/founder/**` routes except `totp/setup|verify|status`.

#### F-11 — AI assistant SQL validator allows broad SELECT over all org tables
- **Location:** `app/api/ai-assistant/route.ts:147-188`, `supabase/migrations/031_security_audit_fixes.sql:395-427`
- **Description:** The regex validator blocks DML, `pg_*`, `information_schema`, `auth.*`, stacked queries. It does NOT block `SELECT * FROM patients` style full-table reads. All SELECTs run under the caller's RLS, so within-org reads of any column including notes/DNI/phone/email are fair game. Access is gated to `owner`/`admin` (good) but:
  - Answer LLM receives the full result rows via `JSON.stringify(queryData, null, 2)` → exfiltrates PHI to Anthropic API by design.
  - Prompt injection via `message`/history can force the generator to emit queries the owner didn't intend.
- **Fix:** Maintain a column allowlist per table (exclude `notes`, `internal_notes`, free-text clinical fields, DNI, phone). Post-process results to redact. Add a BAA-scoped LLM endpoint or on-prem inference for PHI queries. Cap returned rows pre-LLM (code does `LIMIT 100` by convention but no enforcement).

### P2 — medium / hardening

#### F-12 — Portal session token stored plaintext; 30-day lifetime; lax sameSite
- **Location:** `lib/portal-auth.ts:22-37`, `supabase/migrations/093_patient_portal.sql:25-34`
- **Description:** Sessions are long-lived (30 days), `sameSite=lax`, and the token is stored plaintext in DB. Any DB read leak = full session hijack. Ley 29733 PHI implications.
- **Fix:** Hash (SHA-256) the token server-side before insert; validate by hash. Consider `sameSite=strict` (portal is first-party use). Shorten session to 7 days with sliding renewal.

#### F-13 — `secure` cookie flag gated on NODE_ENV (not on request.protocol)
- **Location:** `lib/portal-auth.ts:33`, `app/api/founder/totp/verify/route.ts:73`
- **Description:** `secure: process.env.NODE_ENV === "production"` omits Secure when deployed with `NODE_ENV=staging/preview` or when testing with a prod build over HTTP.
- **Fix:** `secure: req.nextUrl.protocol === "https:"`, or always `true` and gate dev with explicit override.

#### F-14 — Public booking endpoint leaks full scheduler state
- **Location:** `app/api/book/[slug]/route.ts:123-137`
- **Description:** The unauthenticated `/api/book/[slug]` response includes `existing_appointments` (doctor_id × office × date × time) and `schedule_blocks`. Even without patient PII, this is competitive intelligence (throughput, peak hours, staffing) and enables targeted denial-of-booking.
- **Fix:** Return only aggregated availability (taken/free boolean per slot) computed server-side; never raw appointment rows.

#### F-15 — Anonymous DNI enumeration via booking create
- **Location:** `app/api/book/[slug]/create/route.ts:249-282`
- **Description:** An anonymous request with a DNI either reuses an existing patient or creates a new one. Response is identical in both paths, BUT the server behavior differs observably (existing patient = update appointment with `patient_id`; new patient = insert). Timing + side effects (duplicate email to existing patient's on-file address) allow DNI enumeration to confirm who is registered.
- **Fix:** Decouple the booking submission from patient linkage — always create an anonymous appointment, run reconciliation server-side asynchronously. At minimum: do not differentiate timing or email behavior.

#### F-16 — `clinical_attachments` GET has no mandatory filter or pagination
- **Location:** `app/api/clinical-attachments/route.ts:13-27`
- **Description:** Without `patient_id` or `clinical_note_id`, the endpoint returns every attachment in the org (RLS bounded). On a clinic with thousands of files, this is a DoS vector and a PHI inventory dump in a single response.
- **Fix:** Require at least one of `patient_id`/`clinical_note_id`. Add `LIMIT` (e.g., 50) and cursor pagination.

#### F-17 — File upload relies on client-provided MIME type and filename extension
- **Location:** `app/api/clinical-attachments/route.ts:56-64, 76-77`
- **Description:** `file.type` is taken from the `FormData`, which is attacker-controlled. Storage path uses `file.name.split(".").pop()` without validation — a file named `a.php..pdf` yields `pdf` but the filename written to storage retains `.php..pdf`. Without Storage-level enforcement, a malicious upload could be served by a misconfigured host as an executable.
- **Fix:** Sniff magic bytes (use a library like `file-type`). Regenerate the filename server-side with a whitelisted extension from the sniffed type. Validate file size also pre-upload (client-side hints are insufficient).

#### F-18 — treatment_sessions update filters only by treatment_plan_id
- **Location:** `app/api/treatment-plans/[id]/route.ts:67-73`
- **Description:** The verifying query above confirms the plan belongs to the user's org, and treatment_sessions RLS would block cross-org, but the UPDATE omits `.eq("organization_id", ...)`. Keep defense-in-depth by adding it.
- **Fix:** `.eq("organization_id", membership.organization_id)` on the update.

#### F-19 — MP webhook test-mode detection treats production tokens as test
- **Location:** `app/api/mercadopago/webhook/route.ts:34-44`
- **Description:** `isTestMode = accessToken.startsWith("TEST-") || accessToken.startsWith("APP_USR-")`. `APP_USR-` is the PRODUCTION prefix for Mercado Pago marketplace tokens. If `MP_WEBHOOK_SECRET` is ever unset in production, the code logs a warning and ACCEPTS the webhook without signature verification — any actor who can reach the endpoint can forge subscription/payment updates.
- **Fix:** Remove `APP_USR-` from the test-mode check. Always require `MP_WEBHOOK_SECRET` in production regardless of token prefix; fail-closed on missing secret.

#### F-20 — AI assistant design: SQL runs under RLS with no column allowlist
- **Location:** `app/api/ai-assistant/route.ts:316-344`
- **Description:** Even if only owners/admins can invoke, the assistant can be tricked (prompt injection in `history`) into exfiltrating columns with free-text PHI (clinical notes internal_notes, patient notes) to Anthropic's API. There is no BAA-gated endpoint configured in code, and `console.log(executedSql)` at line 508 writes SQL that may embed PHI snippets from the user prompt to stdout/log sinks.
- **Fix:** Gate allowed tables to a strict business-metrics set; forbid `clinical_notes`, `prescriptions`, `clinical_attachments`, `clinical_note_versions`, etc. Scrub prompts before logging.

#### F-21 — PII/PHI adjacent data in server logs
- **Location:** `app/api/mercadopago/webhook/route.ts:184,234`; `app/api/ai-assistant/route.ts:453, 508`; `app/api/cron/reminders/route.ts:353`
- **Description:** Payer emails, patient emails, and full prompts/SQL strings land in `console.log`. On Vercel these flow to the log drain; unless the drain is under BAA/Ley-29733-compliant terms, this constitutes an incidental disclosure.
- **Fix:** Replace with structured logging that redacts/hashes identifiers; ship to a compliant sink (e.g., Logtail/Datadog under DPA covering Peru PHI).

#### F-22 — `getPortalSession(slug?)` inconsistent org binding
- **Location:** `lib/portal-auth.ts:42-77`, callers in `app/api/portal/**`
- **Description:** `slug` parameter is optional. Consumers sometimes pass it (cancel, plans, appointments) and sometimes not (profile PATCH). When omitted, the org binding comes purely from the cookie row — and the cookie row was set at verify time using `session.organization_id`. Risk is low but API shape invites misuse.
- **Fix:** Make `slug` required and compare to session on every call.

### P3 — low / best practice

#### F-23 — `patient_portal_tokens` RLS enabled with no policies
- **Location:** `supabase/migrations/093_patient_portal.sql:19-22`
- **Description:** Intentional deny-all (service role only) — but no explicit deny-all policy makes the posture brittle to future migrations. A single accidental `CREATE POLICY USING(true)` in a later migration would expose the whole token table.
- **Fix:** Add a comment + explicit `CREATE POLICY "deny_all" ON patient_portal_tokens FOR ALL USING (false) WITH CHECK (false);` as a tripwire.

#### F-24 — `dangerouslySetInnerHTML` renders user-editable email template body
- **Location:** `app/(dashboard)/settings/email-settings-tab.tsx:1156`
- **Description:** `previewBodyHtml` is built from user input in the email-template editor. Escaping is done inside the notification send path (F-28), but the preview page itself renders `body_html` raw. Only the authoring admin sees it, so severity is low — but self-XSS can be upgraded if a session cookie theft chain uses it.
- **Fix:** Sanitize via DOMPurify before render; or render the template server-side to a sanitized string first.

#### F-25 — CSP allows `'unsafe-inline'` in production script-src
- **Location:** `lib/supabase/middleware.ts:10-13`
- **Description:** Even in prod, `script-src 'self' 'unsafe-inline'`. This defeats CSP's core XSS mitigation. Next.js 15 supports strict-dynamic with nonces.
- **Fix:** Use `unsafe-inline` only as fallback after `strict-dynamic` + per-request nonce. Attach nonce to `<Script>` and inline runtime chunks.

#### F-26 — Middleware treats `/api` as public
- **Location:** `lib/supabase/middleware.ts:75`
- **Description:** `publicPaths` includes `/api`. Every API route is expected to self-authenticate. One forgotten `supabase.auth.getUser()` call = unauthenticated access to that route.
- **Fix:** Invert the default: require auth on `/api/*` except a named list (`/api/book/**`, `/api/mercadopago/webhook`, `/api/whatsapp/webhook`, `/api/portal/auth/request-link`, `/api/portal/auth/verify`, `/api/auth/**`, `/api/invite/*`, `/api/cron/**`).

#### F-27 — Token invalidation race in portal verify
- **Location:** `app/api/portal/auth/verify/route.ts:59-62`
- **Description:** `used_at` is set AFTER the session is created. If the process dies between session creation and the `used_at` update, the same token can be reused within its 15-minute window.
- **Fix:** UPDATE-then-check pattern: `UPDATE ... SET used_at = now() WHERE token = $1 AND used_at IS NULL RETURNING *;` then proceed only if a row was returned.

#### F-28 — email_templates.body_html is trusted author content
- **Location:** `app/api/notifications/send/route.ts:181-193`, `app/api/cron/reminders/route.ts:306-320`
- **Description:** Variables inserted into `body_html` are HTML-escaped (good). The outer template body is whatever an org admin wrote in the settings UI — that's fine as outbound email (MUAs sandbox), but if this field is ever rendered in-app it becomes a stored XSS sink.
- **Fix:** Keep a separate sanitized preview path; never render `body_html` in the main app beyond the settings preview.

### INFO — verified-good patterns

- **F-29 Encryption primitive** (`lib/encryption.ts`) — AES-256-GCM, random IV, auth tag, double-encrypt guard. Correct for at-rest secrets (WhatsApp tokens, TOTP secrets). Plain-text fallback for missing key is dev-only and logs nothing.
- **F-30 Security headers** (`lib/supabase/middleware.ts:26-35`) — HSTS (2-year, preload), X-Content-Type-Options, X-Frame-Options:DENY, Referrer-Policy, Permissions-Policy locked. Good baseline.
- **F-31 MP webhook signature** (`app/api/mercadopago/webhook/route.ts:67-78`) — Constant-time HMAC compare (`crypto.timingSafeEqual`), length pre-check. Correct. (See F-19 for the test-mode bypass caveat.)
- **F-32 Auth callback open-redirect guard** (`app/api/auth/callback/route.ts:8-10`) — Rejects both protocol-relative `//evil` and absolute URLs. Correct.
- **Helper RPC + RLS fixes** (`supabase/migrations/031_security_audit_fixes.sql`) — Prior audit findings (is_founder self-escalation via UPDATE, organization_invitations `USING(true)`, seed_email_templates callable by anyone) were remediated correctly. Good hygiene.
- **Core multi-tenant pattern** (`supabase/migrations/013_multi_tenant.sql:51-67`) — `get_user_org_ids()` + `is_org_admin()` as `SECURITY DEFINER STABLE`, used uniformly across policies. This is the right pattern.

---

## Checklist of verified-safe patterns

- CSRF via SameSite cookies (lax on portal, strict on founder 2FA) — acceptable for read-bound portals.
- All authenticated API routes read `user.id` from `supabase.auth.getUser()` rather than trusting body fields.
- `organization_id` is never accepted from the body in routes that were sampled (members, clinical-notes, treatment-plans, clinical-attachments, anthropometry, discount-codes/apply, notifications, portal/register).
- Zod schemas are consistently used for route bodies via `parseBody()` or inline `safeParse`.
- `middleware.ts` + `updateSession` enforce subscription/onboarding gating server-side on every protected page.
- Service-role (`createAdminClient`) usage is limited to defined flows (portal auth, webhook processing, admin user-lookup, signing 2FA TOTP); each reviewed call has an explicit prior auth check except the ones flagged above.
- `ai_readonly_query` is `SECURITY INVOKER` so the AI call still runs under the caller's RLS — correct design.
- `organization_invitations` lookup-by-token is done via a SECURITY DEFINER RPC (`get_invitation_by_token`), not a permissive RLS policy.
- Appointments/clinical_notes/patient_payments/treatment_plans RLS policies correctly use `organization_id IN (SELECT get_user_org_ids())` — no `USING (true)` found for these tables in the current migration set.

---

## Out-of-scope / further review needed

- **Supabase Storage bucket RLS** (`supabase/migrations/015a_storage_buckets.sql`) — I did not open this file. `clinical-files` bucket policies are critical for F-06; please confirm the storage.objects RLS restricts by `storage.foldername(name)[1] = organization_id::text`. If not, signed-URL generation is not the only risk; raw bucket download would also leak.
- **`app/api/scheduler/available-slots`**, `/api/email-templates/seed`, `/api/email/send-test`, `/api/whatsapp/**` routes — not individually reviewed; spot-check uses rate limiting and org-scoping before release.
- **Supabase Auth rate limits + CAPTCHA** on `/login`, `/register`, `/forgot-password` — not audited here; Supabase dashboard settings matter more than code.
- **npm audit** — not executed; run `npm audit --omit=dev --json | jq '.vulnerabilities | map_values(select(.severity=="high" or .severity=="critical"))'` and patch any high/critical in production deps.
- **Penetration tests** of the portal cancellation/magic-link flow and the founder 2FA cookie handoff — the static review above cannot observe race conditions.
- **Logging/DPA contract** — Vercel log retention, Sentry DSN scope (`sentry.server.config.ts`), and Resend terms — confirm Peru Ley 29733 processing locations (EU/US hosting, SCCs).
- **Backup encryption at rest** for Supabase managed backups — verify key-management and cross-border transfer terms.
- **TOTP secret encryption** (`lib/encryption.ts`) is correctly used, but `ENCRYPTION_KEY` rotation is undocumented — rotating without a migration path will brick 2FA for all founders.
- **`058_middleware_session_rpc.sql`** (`get_user_session_check`) was not reviewed — the middleware's subscription gate relies on it.

---

*End of report.*

