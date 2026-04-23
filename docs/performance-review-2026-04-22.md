# Performance Review — 2026-04-22

Project: VibeForge (Next.js 15 + Supabase SaaS). Scope: app/(dashboard)/scheduler, app/(dashboard)/patients, app/(dashboard)/reports, app/api/portal, supabase/migrations. Focus: DB, React rendering, bundle, API routes.

---

## Executive summary

- **Scheduler hot-path uses `select("*, ...")`** on `appointments` with a JSON field and multiple 1:1 joins, producing fat rows; every slot-cell then runs 3 linear `appointments.find/some` sweeps — O(slots × appts) per render.
- **Patient drawer and patients page issue dozens of parallel queries that silently degrade to full-range scans**: `patient_payments.in(patient_id, [...])` and `appointments.in(patient_id, [...])` fan-outs with no column pruning or compound index on `(patient_id, status)`.
- **Portal + admin mis-citas page has classic N+1 patterns**: sequential awaits, several identical `.eq("organization_id", orgId)` calls in one handler, and `.select("*")` on large tables.
- **Bundle**: `framer-motion`/`motion` (both installed, ~8.5MB), `xlsx` (7.2MB), `jspdf` (29MB) and `recharts` (6.4MB) all reachable from client without dynamic import in several places; `lucide-react` at 29MB is safe only if tree-shaken — needs `optimizePackageImports`.
- **Indexes missing** on columns used repeatedly in `.gte/.lte/.eq/.order` filters: `appointments(organization_id, appointment_date, status)`, `patient_payments(patient_id, appointment_id)`, `schedule_blocks(organization_id, block_date)`, `clinical_notes(patient_id, created_at DESC)`, and several portal tables.

---

## Top 10 quick wins (ordered by impact/effort)

| # | Win | Impact | Effort | File:line |
|---|-----|--------|--------|-----------|
| 1 | Replace `select("*", ...)` on `appointments` with explicit columns in scheduler + reports (drops ~20 fat columns incl. text blobs) | High | XS | `app/(dashboard)/scheduler/page.tsx:185`, `app/(dashboard)/reports/page.tsx:56` |
| 2 | Add composite index `schedule_blocks(organization_id, block_date)` — only single `block_date` index exists today | High | XS | `supabase/migrations/009_schedule_blocks.sql:14` |
| 3 | Index `clinical_notes(patient_id, created_at DESC)` and `clinical_notes(appointment_id)` (already exists) — patient drawer clinical tab will do a filesort | Med | XS | `supabase/migrations/050_clinical_notes.sql:116` |
| 4 | Memoize scheduler `appointments.find/some` lookups with precomputed Map keyed by `date|office|time` — current cost is O(slots × office × appts) per render | High | S | `app/(dashboard)/scheduler/day-view.tsx:29,63,77,216-459` |
| 5 | Memoize `DayView`/`WeekView` via `React.memo` + move `hexToPastel/hexToDark` color cache outside re-renders | Med | XS | `app/(dashboard)/scheduler/day-view.tsx:98-112` |
| 6 | Dynamic import chart components in reports/dashboard (recharts is ~300KB gzip, currently eagerly imported by every dashboard page) | High | S | `app/(dashboard)/reports/financial-report.tsx:20`, `dashboard/admin-dashboard.tsx:23` |
| 7 | Remove dual `framer-motion` + `motion` packages; unify on one; lazy-load portal motion usage | Med | XS | `package.json:44,46`; `app/portal/[slug]/mis-citas/page.tsx:36` |
| 8 | Collapse treatment-plan context fetch in appointment sidebar: 4 sequential awaits → single RPC or Promise.all | Med | S | `app/(dashboard)/scheduler/appointment-sidebar.tsx:319-381` |
| 9 | Patient drawer: fetch clinical notes in the Promise.all alongside appointments+payments; remove second round-trip | Med | XS | `app/(dashboard)/patients/patient-drawer.tsx:136-178` |
| 10 | Cron reminders route: per-org metadata (template/settings/org/portal/clinicPhone/waConfig) uses 6 sequential awaits — merge to Promise.all (~500ms saving per org per run) | Med | S | `app/api/cron/reminders/route.ts:152-225` |

---

## Findings

### P0 — blocking or highly visible slowdowns

#### F-1 · Scheduler fat payload: `select("*, ...")` on `appointments` hot path
- Location: `app/(dashboard)/scheduler/page.tsx:185`
- Problem: The scheduler re-fetches on every date change with `select("*, doctors(...), offices(...), services(...), patients(is_recurring)")`. The `*` pulls ~25 columns including `notes` (text), `cancel_reason`, `internal_notes`, `meeting_url`, `discount_reason`, `discount_code_id`, `patient_name/phone`, `created_at/updated_at`, `responsible`, etc. For a busy clinic with 200+ appts/week, payload size dominates TTFB.
- Impact: ~60-70% payload reduction; measurable on mobile/slow network. Also reduces JSON parse time in client.
- Fix: enumerate the ~10 fields actually used by DayView/WeekView (`id, appointment_date, start_time, end_time, status, patient_id, patient_name, doctor_id, office_id, service_id, price_snapshot, discount_amount, meeting_url, organization_id`).
- Effort: XS.

#### F-2 · DayView O(slots × offices × appointments) cell computation per render
- Location: `app/(dashboard)/scheduler/day-view.tsx:216-459` (the `TIME_SLOTS.map` × `offices.map` loop)
- Problem: Each of ~60 slots × N offices runs `getAppointmentForSlot` (`appointments.find`) + `isSlotOccupied` (`appointments.some`) + `getBlockForSlot` (`blocks.find`). Three full linear scans per cell — for a 3-office day with 40 appts that is ~21,600 comparisons every time state changes (drag, context-menu, clock tick).
- Impact: Dropped frames during drag; measurable input lag on large calendars.
- Fix: Build once per render: `Map<officeId, Map<time, appt>>` and `Map<officeId, Map<time, {status}>>` with start/end ranges; walk once in O(appts), then cell lookup is O(1). Wrap the function in `useMemo` keyed on `appointments`.
- Effort: S.

#### F-3 · WeekView filter inside nested loop (similar pattern, 7-day amplification)
- Location: `app/(dashboard)/scheduler/week-view.tsx:235-250`
- Problem: Inside `TIME_SLOTS × weekDays` the code runs `appointments.filter((a) => a.appointment_date === dateStr && ...)` and `appointments.some((a) => ...)` inline. With ~60 slots × 7 days × 150 appts that is ~63,000 comparisons per render.
- Impact: Week view drag-to-select and scroll are noticeably janky with >100 appointments.
- Fix: precompute `apptsByDay = new Map<string, Appointment[]>()` once before the loop, then filter within the much smaller per-day array (or build a `(day, startTime)` key map).
- Effort: S.

#### F-4 · Scheduler refreshes both `blocks` and `appointments` on every state dep change
- Location: `app/(dashboard)/scheduler/page.tsx:229-232`
- Problem: `useEffect` depends on both `fetchAppointments` and `fetchBlocks`; both reference `getDateRange` (a `useCallback`). Any date/view change re-runs both in parallel, which is fine, but there is no deduping — rapid date clicks trigger overlapping requests and race conditions that can show stale data.
- Impact: Under fast clicking (arrow keys, next-day), ~2-3 parallel fetches fire per second.
- Fix: Use React Query (`useQuery`) for appointments + blocks, keyed on `(orgId, startDate, endDate)`. Gets automatic dedupe, cancellation, cache, and works with the scheduler-master-data pattern already in place.
- Effort: M.

#### F-5 · `fetchConsentContext` runs two sequential queries on every sidebar open
- Location: `app/(dashboard)/scheduler/appointment-sidebar.tsx:169-198`
- Problem: `fetchConsentContext` does a serial `services.select(requires_consent)` then `clinical_attachments.select(...)`. Most services don't require consent, so the second call is wasted for the majority of appointments.
- Impact: +1 round trip (~50-100 ms) per sidebar open in the common case.
- Fix: early-return when `service_id` is absent OR move `requires_consent` onto the `services(...)` join already done by the parent scheduler `select`.
- Effort: XS.

#### F-6 · AppointmentSidebar: treatment-plan context uses 4 sequential Supabase calls
- Location: `app/(dashboard)/scheduler/appointment-sidebar.tsx:319-381`
- Problem: Sequential `treatment_sessions → treatment_plans → patient_payments → treatment_sessions (completed) → treatment_plan_items`. Five awaits × ~50 ms = ~250 ms per appointment open (when linked to a plan). No `Promise.all`.
- Impact: Noticeable lag opening any plan-linked appointment.
- Fix: create a single RPC `get_plan_balance(plan_id)` that returns `{ plan, total_budget, paid, consumed }` in one round trip, OR wrap in `Promise.all` after the first two lookups. Index `patient_payments(treatment_plan_id)` already exists (099).
- Effort: S.

#### F-7 · Patient drawer clinical tab: separate HTTP fetch despite identical origin
- Location: `app/(dashboard)/patients/patient-drawer.tsx:162-178`
- Problem: On clicking "Clinical" tab the drawer does `fetch("/api/clinical-notes?patient_id=...")` — but `fetchHistory` at line 138 already pulls appointments via direct Supabase. Now the user pays for: TCP/TLS (if first fetch), auth middleware re-run, SSR auth cookie parsing, JSON round trip.
- Impact: ~200 ms extra on tab switch that could be eliminated.
- Fix: either (a) include clinical notes in the initial `Promise.all` like appointments/payments, or (b) migrate the clinical-notes call to direct Supabase on the client (RLS allows it) — the API route adds no validation that client-side doesn't have.
- Effort: XS.

#### F-8 · Cron reminders: per-org metadata is 6 sequential awaits
- Location: `app/api/cron/reminders/route.ts:152-225`
- Problem: For each org in the batch the code serially awaits: `email_templates`, `email_settings`, `organizations`, `booking_settings`, `global_variables`, `whatsapp_config`. These are all independent.
- Impact: If cron processes 50 orgs, this is ~50 × 5 × 50 ms = 12.5 s of unnecessary wait time per run. May hit cron timeout on Vercel (10 s for hobby, 60 s for Pro).
- Fix: wrap in `Promise.all` and reuse the destructured results. Or create `get_reminder_context(p_org_id, p_slug)` RPC.
- Effort: S.

#### F-9 · Portal `/api/portal/appointments` uses `.or(date.lt OR status.in)` without matching index
- Location: `app/api/portal/appointments/route.ts:42`
- Problem: `.or(`appointment_date.lt.${today},status.in.(completed,cancelled,no_show)`)` combined with `.eq("patient_id", ...).eq("organization_id", ...)` — the `.or()` prevents the planner from using the composite `(organization_id, appointment_date)` index efficiently; Postgres falls back to bitmap OR or seq scan. For patients with many historical appointments this scales poorly.
- Impact: Low per-patient but grows with history; list-limit of 50 caps blast radius.
- Fix: compose two queries and merge client-side, or rewrite as `.lt("appointment_date", today)` and do the completed/cancelled filter via `.in("status", [...])` as a second OR branch (Supabase does not support UNION ALL cleanly — consider an RPC `get_portal_past_appointments`).
- Effort: S.

### P1 — user-visible lag under realistic load

#### F-10 · Reports page fetches `appointments.*` plus all patients + all payments in a single client-side shotgun
- Location: `app/(dashboard)/reports/page.tsx:49-77`
- Problem: All four reports share one fetch that pulls `appointments.*` with 3 joins, `patient_payments`, `patients` for the entire `dateFrom..dateTo` range — regardless of which tab is active. 90-day range for an established clinic easily returns 2000+ rows × 25 columns in the client.
- Impact: Report initial render is 3-8 s on realistic data; every date-range change re-fetches all three.
- Fix: (a) make each report own its query (tab-scoped fetch); (b) select only the columns each report uses; (c) push aggregation to a single RPC `get_financial_report(dateFrom, dateTo)` returning pre-aggregated series instead of raw rows. RPCs for retention already do this (lines 151-163) — extend the pattern.
- Effort: M.

#### F-11 · Patients page: `ilike` on 4 columns without trigram index
- Location: `app/(dashboard)/patients/page.tsx:148-151`
- Problem: Search uses `first_name.ilike.%q%,last_name.ilike.%q%,dni.ilike.%q%,phone.ilike.%q%`. Single-column btree indexes on `(last_name, first_name)` and `dni`, `phone` (from migration 008) help for prefix searches, but `%q%` forces a seq scan on every column.
- Impact: With 10k+ patients, search debounce still incurs 500 ms+ per keystroke.
- Fix: enable `pg_trgm` extension and add `GIN (first_name gin_trgm_ops), (last_name ...), (dni ...), (phone ...)` OR use Postgres full-text search on a generated `tsvector` column.
- Effort: S.

#### F-12 · Patients page: extra data N+1 at the UI layer
- Location: `app/(dashboard)/patients/page.tsx:185-215`
- Problem: When debt or service filter is enabled, `fetchExtraData` fetches appointments + payments for the 25 visible patients. That's fine, but the results are then `.filter((a) => a.patient_id === id)` in a loop (line 207-208) over every patient — O(patients × appts) Array scans.
- Impact: Minor for 25 patients but compounds if PAGE_SIZE is later raised.
- Fix: group once with `Map<patient_id, []>`; insert into map in single pass.
- Effort: XS.

#### F-13 · Patient drawer: fetches entire appointment+payment history with no pagination
- Location: `app/(dashboard)/patients/patient-drawer.tsx:136-155`
- Problem: `appointments.select(...).eq("patient_id", ...)` pulls the patient's full lifetime history on every open. For long-retention patients this can be 100+ rows each time drawer is opened.
- Impact: Large drawer open delay for repeat patients; blocks other tabs.
- Fix: initial fetch: limit to most-recent 20 appointments + 20 payments; "Show all" button re-fetches rest.
- Effort: S.

#### F-14 · Clinical notes on patient drawer: no index on `(patient_id, created_at DESC)`
- Location: `app/api/clinical-notes/route.ts:56` (ordered by `created_at DESC`)
- Problem: Only `idx_clinical_notes_patient` (migration 050:116) — not a composite with `created_at`. Each list fetch does an index scan + sort.
- Impact: minor now, grows with per-patient note count.
- Fix: `CREATE INDEX idx_clinical_notes_patient_created ON clinical_notes(patient_id, created_at DESC);`
- Effort: XS.

#### F-15 · DayView `now` state updates every 60 s — triggers whole tree re-render
- Location: `app/(dashboard)/scheduler/day-view.tsx:148-152`
- Problem: `setInterval(() => setNow(new Date()), 60_000)` lives in the DayView component itself; every minute the entire slot grid re-computes (see F-2).
- Impact: every 60 s the user sees a ~200 ms hitch on large schedules.
- Fix: lift the time indicator into its own memoized `TimeLine` child component. Or use `useSyncExternalStore` + CSS `top` transform so only the line itself re-renders.
- Effort: S.

#### F-16 · `schedulerConfig` re-fetched by both DayView AND WeekView (each mount)
- Location: `app/(dashboard)/scheduler/day-view.tsx:136-138`, `week-view.tsx:78-80`
- Problem: Both views independently call `fetchSchedulerConfig().then(setSchedulerConfig)` on mount. Switching between day/week re-fetches. Nothing caches this at the page level.
- Impact: 1 extra DB call every view switch; minor but eliminable.
- Fix: lift config to the scheduler `page.tsx`, include in `useSchedulerMasterData` hook (same query-cache pattern).
- Effort: XS.

#### F-17 · Dashboard daily series: raw `appointment_date` pull can be a single aggregated RPC
- Location: `app/(dashboard)/dashboard/page.tsx:207-220`
- Problem: After running `get_admin_dashboard_stats`, a separate query pulls 30 days of individual `appointment_date` rows just to count by day. For busy clinics this is 500-1500 rows and a Map reduce on the server component.
- Impact: adds ~100-300 ms to TTFB of the dashboard.
- Fix: add `series_last_30d` (array of `{date, count}`) into the existing `get_admin_dashboard_stats` RPC return payload — it already does dozens of aggregates.
- Effort: S.

#### F-18 · Scheduler payments fetch is second round-trip after appointments
- Location: `app/(dashboard)/scheduler/page.tsx:199-209`
- Problem: After fetching appointments, a second serial query `patient_payments.in("appointment_id", apptIds)` loads totals. This is effectively a fan-out with `in(...)` that may contain 100+ IDs; Supabase caps at ~1000 but the planner does an index-only scan per ID.
- Impact: ~80-150 ms added latency per date change.
- Fix: push totals into the initial fetch via a view/RPC, e.g. `get_scheduler_day(p_org, p_start, p_end)` returning appointments + `paid_total` as a single `LATERAL` join. Or compute client-side from `price_snapshot - paid_total` via an aggregated Postgres query using `jsonb_object_agg`.
- Effort: M.

#### F-19 · Patients page: initial render runs 3 fetches (patients + services + lookup_values) without Promise.all batching
- Location: `app/(dashboard)/patients/page.tsx:87-107`
- Problem: `services` and `lookup_values` are fetched via separate `supabase.from(...)` calls chained with `.then()` — they are independent but not wrapped, so React reconciles twice. `patients` is fetched by `fetchPatients`.
- Impact: 2 extra renders + small waterfall.
- Fix: single `useEffect` with `Promise.all([services, origins])` and single `setState`.
- Effort: XS.

#### F-20 · `availableTags` recomputed from full patient list in useMemo
- Location: `app/(dashboard)/patients/page.tsx:224-228`
- Problem: `patients.forEach((p) => p.patient_tags.forEach(...))` runs on every patients array change; for 25 items OK, but the tag set should come from a `organization_tags` master view (unique tags in org), not by scraping current page.
- Impact: Filter dropdown misses tags on patients not in current page (bug) + recomputes.
- Fix: add `select distinct tag from patient_tags where organization_id = ?` RPC, cached.
- Effort: S.

#### F-21 · Marketing/operational/financial reports import recharts eagerly
- Location: `app/(dashboard)/reports/financial-report.tsx:20`, `marketing-report.tsx:26`, `operational-report.tsx:24`, `retention-report.tsx:24`, `dashboard/admin-dashboard.tsx:23`
- Problem: Five components statically import recharts (BarChart, AreaChart, PieChart). Next will code-split by route group, but the reports route loads all four reports because they're all imported from `page.tsx:22-25` regardless of active tab.
- Impact: ~300 KB gzipped JS loaded before any report is displayed.
- Fix: dynamic-import each report: `const FinancialReport = dynamic(() => import('./financial-report').then(m => m.FinancialReport))`.
- Effort: XS.

#### F-22 · Portal mis-citas page is 2,448 lines, single client bundle
- Location: `app/portal/[slug]/mis-citas/page.tsx:1-2448`
- Problem: A 2.4k-line client component loaded on patient portal mobile. Imports `framer-motion` statically at line 36. This is the most latency-sensitive public surface.
- Impact: Slow First Contentful Paint and high TBT on mobile.
- Fix: split into server-component shell + smaller client islands; lazy-load the profile edit / new-booking forms; remove `motion` in favor of CSS transitions for simple fades.
- Effort: L.

### P2 — scalability concerns (not visible today but will bite)

#### F-23 · No `optimizePackageImports` for lucide-react (29 MB in node_modules)
- Location: `next.config.ts:4-14`
- Problem: `lucide-react` is imported by 72+ files in the dashboard. Next 15 auto-barrel-optimizes this starting with 14.1, but the project has no explicit `experimental.optimizePackageImports: ['lucide-react']` safeguard. Missed named imports (which we observed none of) would pull the full barrel.
- Impact: Currently tree-shaken correctly, but silent regressions possible on package upgrades.
- Fix: add `experimental: { optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'] }` to `next.config.ts`.
- Effort: XS.

#### F-24 · Two animation libraries installed: `framer-motion` (11.14) + `motion` (12.38)
- Location: `package.json:44-46`
- Problem: Both installed, both bundled if reached. `framer-motion` used in `doctor-dashboard.tsx` and `mis-citas/page.tsx`. `motion` is unused in app code but still shipped.
- Impact: Bundle duplication — ~150 KB minified of motion internals in client.
- Fix: `npm uninstall motion`; keep `framer-motion` only (or migrate to CSS animations).
- Effort: XS.

#### F-25 · Appointments query on scheduler lacks `organization_id` predicate at query layer
- Location: `app/(dashboard)/scheduler/page.tsx:183-189`
- Problem: The scheduler `select()` does not add `.eq("organization_id", organizationId)` — it relies entirely on RLS. That works, but Postgres may use `idx_appointments_date` (single col) instead of the composite `idx_appointments_org_date` (057:8) without the org predicate in the query.
- Impact: potentially a full-date-range scan across multiple orgs' indexes before RLS filter. Depends on planner; worth adding `.eq("organization_id", organizationId)` explicitly for index-selectivity clarity.
- Fix: add the `.eq` everywhere hot-path Supabase queries hit multi-org tables.
- Effort: XS.

#### F-26 · Admin doctor detail page: 4 separate fetches, full `select("*")`
- Location: `app/(dashboard)/admin/doctors/[id]/page.tsx:54-58`
- Problem: `doctors.*`, `services.*`, `doctor_schedules.*`, `offices.*` — all `*`. Not critical data but consistently pulls text blobs (bio, color, etc.) unnecessarily.
- Impact: per-page minor; pattern to fix globally.
- Fix: enumerate columns.
- Effort: XS.

#### F-27 · Scheduler history page: `select("*, doctors(*), services(*), offices(*)")` with `count: exact`
- Location: `app/(dashboard)/scheduler/history/page.tsx:73`
- Problem: Uses `count: "exact"`, forcing Postgres to run the same query twice (once for count, once for data). On `appointments` which can be millions of rows per org, exact count is expensive.
- Impact: slow page load on large orgs once history pagination gains traction.
- Fix: switch to `count: "estimated"` (uses pg_stat) or `count: "planned"`; or show "X+ results" UI without total.
- Effort: XS.

#### F-28 · Middleware session RPC hits DB on every request
- Location: `supabase/migrations/058_middleware_session_rpc.sql`, referenced from `middleware.ts`
- Problem: Middleware RPC appears to run per request (every nav, every image, every asset that goes through middleware matchers). Unless cached via a short-TTL cookie/token, this is 1 DB round-trip per request for auth gate.
- Impact: Baseline latency floor of 30-80 ms on every dashboard page.
- Fix: verify middleware matcher excludes `/_next/static`, `/api/ping`, images; consider caching the session lookup result in an encrypted cookie for 60 s.
- Effort: M.

#### F-29 · `lookup_values` joined with `!inner(slug)` in 4+ places
- Location: `app/(dashboard)/patients/page.tsx:97`, `hooks/use-scheduler-master-data.ts:36,44`
- Problem: `!inner(lookup_categories.slug)` enforces a join. No compound index on `(category_id, organization_id, is_active)`; every lookup does a hash join.
- Impact: Minor for small lookup tables; could show up in profiling.
- Fix: add `CREATE INDEX idx_lookup_values_cat_org ON lookup_values(lookup_category_id, organization_id, is_active);` (or equivalent to the FK column name).
- Effort: XS.

#### F-30 · Booking settings re-fetched per sidebar open
- Location: `app/(dashboard)/scheduler/appointment-sidebar.tsx:96-111`
- Problem: Every time a user clicks a different appointment, the sidebar re-fetches `booking_settings.discounts_enabled` for the same org.
- Impact: N clicks → N identical queries.
- Fix: move to React Query keyed by `org_id` with infinite stale time or read via the organization provider context that already knows org settings.
- Effort: XS.

#### F-31 · Patient drawer: `handlePatientUpdated` does a re-fetch of the single patient after `fetchPatients(0)` already refetched the list
- Location: `app/(dashboard)/patients/page.tsx:304-320`
- Problem: After the list refresh, a separate single-row fetch duplicates data that is already in the refreshed list.
- Impact: Small; one extra round trip on every save.
- Fix: find the patient in the fresh list instead of refetching.
- Effort: XS.

#### F-32 · `schedule_blocks` RLS: `using (true)` + missing org index
- Location: `supabase/migrations/009_schedule_blocks.sql:19-23,14-15`
- Problem: Table has indexes on `block_date` and `office_id` only. RLS policy is literally `using (true)` so cross-org leakage is possible (security review territory) but also no `organization_id` index even though the column appears to exist from later migrations.
- Impact: All-orgs scan then filter on client. Scales poorly as tenancy grows.
- Fix: `CREATE INDEX idx_schedule_blocks_org_date ON schedule_blocks(organization_id, block_date);`
- Effort: XS.

### P3 — micro-optimizations

#### F-33 · Scheduler header is passed entire `appointments` array but only uses length
- Location: `app/(dashboard)/scheduler/page.tsx:414`
- Problem: `SchedulerHeader` receives `appointments={appointments}` — if it only uses `length` or a count, this causes re-render on every appointment change.
- Impact: minor; depends on header internals.
- Fix: pass `appointmentCount={appointments.length}` instead.
- Effort: XS.

#### F-34 · `hexToPastel` / `hexToDark` not memoized, re-runs per cell
- Location: `app/(dashboard)/scheduler/day-view.tsx:98-112`, `week-view.tsx:28-42`
- Problem: Helper parses hex 6 chars per cell per render (~200 calls on busy day).
- Impact: microseconds; cumulative noticeable during drag.
- Fix: memoize with `Map<hex, {pastel, dark}>` outside component.
- Effort: XS.

#### F-35 · `calculateAge` called inline in `.map` of patient list
- Location: `app/(dashboard)/patients/page.tsx:723-731`
- Problem: For each visible patient, `calculateAge(patient.birth_date)` runs on every render including scroll + any state change.
- Impact: negligible at 25 rows; grows if PAGE_SIZE increases.
- Fix: compute once per patient in a `useMemo` over `patients`.
- Effort: XS.

#### F-36 · `scheduler-config` localStorage read inside `useMemo` with `[]` dep
- Location: `app/(dashboard)/scheduler/page.tsx:98`
- Problem: `useMemo(() => loadSchedulerConfig(), [])` runs on client on first render before any effect — fine — but it's not wrapped in SSR-safe guard. If the provider ever renders on server it crashes.
- Impact: latent bug risk; no current runtime hit.
- Fix: ensure `loadSchedulerConfig` returns `DEFAULT_SCHEDULER_CONFIG` when `typeof window === 'undefined'`.
- Effort: XS.

#### F-37 · `AiReportProvider` wraps all 4 reports; each tab change remounts children
- Location: `app/(dashboard)/reports/page.tsx:107-210`
- Problem: Tab switching unmounts previous report + remounts new one. Since fetching is in `page.tsx` and passed down, this is OK, but `RetentionReport` runs its own 5-parallel RPC fetch in `useEffect` on mount every time user visits the tab.
- Impact: toggling between tabs re-runs 5 RPCs every time.
- Fix: hoist retention data to `page.tsx` or keep tab content mounted + hidden via CSS; or use React Query for the retention RPCs to dedupe.
- Effort: S.

#### F-38 · `supabase.from("notifications").insert(...)` fired from sidebar without await
- Location: `app/(dashboard)/scheduler/appointment-sidebar.tsx:416-425,534`
- Problem: Fire-and-forget insert. If it fails (network, RLS), user never sees error but the UI claims success. Also doubles as load on the DB for every payment/status transition.
- Impact: performance OK, but hard to observe failures.
- Fix: await + toast failure; or move to a queued notifications table written by DB trigger.
- Effort: S.

#### F-39 · `fetchSchedulerConfig` runs `.then(setSchedulerConfig).catch(() => {})`
- Location: `app/(dashboard)/scheduler/day-view.tsx:137`, `week-view.tsx:79`
- Problem: Dual render: first render uses localStorage defaults, second render after the network response. Triggers a second pass across the grid.
- Impact: measurable +1 reconcile on scheduler mount.
- Fix: skip network sync on mount if localStorage version is fresh (<5 min); use stale-while-revalidate.
- Effort: XS.

#### F-40 · Portal page hits 3 separate API routes on load (session, appointments, plans)
- Location: `app/portal/[slug]/mis-citas/page.tsx:226-229`
- Problem: 3 round-trips through Next API → Supabase-admin → DB. Each has cold-start cost.
- Impact: initial TTFB on portal ~300-500 ms vs single server-component render.
- Fix: convert the portal page to a Server Component that assembles everything server-side with one Supabase call batch; avoid extra API hops.
- Effort: L.

---

## Database indexes to add (single SQL block)

```sql
-- ═══════════════════════════════════════════════════════════════════
-- Performance review 2026-04-22 — missing indexes
-- Apply as: supabase/migrations/103_perf_indexes_2026_04_22.sql
-- ═══════════════════════════════════════════════════════════════════

-- F-2/F-32: scheduler blocks use (org, block_date) but only block_date exists
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_org_date
  ON schedule_blocks (organization_id, block_date);

-- F-14: patient drawer clinical tab sorts by created_at DESC per patient
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_created
  ON clinical_notes (patient_id, created_at DESC);

-- F-11: patient search ilike on 4 columns — requires pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_first_trgm
  ON patients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_last_trgm
  ON patients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_dni_trgm
  ON patients USING gin (dni gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm
  ON patients USING gin (phone gin_trgm_ops);

-- F-29: lookup_values joined with !inner(slug) on 4+ places
-- (adjust column name to actual FK column in your schema)
CREATE INDEX IF NOT EXISTS idx_lookup_values_cat_org_active
  ON lookup_values (lookup_category_id, organization_id, is_active);

-- F-18 (supporting): speed up payment totals fan-out in scheduler
-- idx_patient_payments_appointment already exists (008:113) — verify planner uses it
-- Add a covering index to avoid heap fetch:
CREATE INDEX IF NOT EXISTS idx_patient_payments_appt_amt
  ON patient_payments (appointment_id) INCLUDE (amount);

-- Reminder logs: cron query is .in(appointment_id, [...]).eq(template_slug,...).eq(channel,...).eq(status,...)
-- Current index is just on appointment_id
CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup
  ON reminder_logs (appointment_id, template_slug, channel, status);

-- Notifications: admin dashboard / topbar fetches recent notifications for org, ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_org_created
  ON notifications (organization_id, created_at DESC);

-- Patient portal sessions: cleanup + lookup by patient over time
CREATE INDEX IF NOT EXISTS idx_portal_sessions_patient_exp
  ON patient_portal_sessions (patient_id, expires_at DESC);

-- Clinical attachments: patient drawer lists by (patient_id) ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_clinical_attachments_patient_created
  ON clinical_attachments (patient_id, created_at DESC);
```

Run these in a single migration, then `ANALYZE` the affected tables.

---

## Bundle analysis summary

Top offenders from `du -sh node_modules/*`:

| Package | Size | Ship risk | Notes |
|---------|------|-----------|-------|
| `@next` + `next` | 410 MB combined | server-only | fine |
| `@sentry/nextjs` | 40 MB | partial client | some client tracing ships; verify via bundle analyzer |
| `lucide-react` | 29 MB source | safe (tree-shaken) | add to `optimizePackageImports` to be certain |
| `jspdf` | 29 MB | client | used only in `lib/report-export.ts`; ensure dynamic-imported |
| `date-fns` | 24 MB source | safe | ESM tree-shake works; confirm no full-barrel imports |
| `motion` | 8.5 MB | client | **unused** — remove per F-24 |
| `xlsx` | 7.2 MB | client | used in `lib/report-export.ts`; dynamic-import only when user clicks Export |
| `@tanstack` | 7 MB | client | React Query + Table; normal |
| `recharts` | 6.4 MB | client (large) | static imports in 7 files; dynamic-import per F-21 |
| `framer-motion` | – | client | used minimally; replace simple fades with CSS |

Actions:
- Install `@next/bundle-analyzer` and run in CI; fail PR if `app/(dashboard)` first-load JS exceeds threshold.
- Verify `jspdf` / `html2canvas` / `xlsx` chunks split out of main page bundles — they should be in async chunks only loaded when the Export button is clicked.
- Replace `motion` import on `portal/[slug]/mis-citas/page.tsx` with either CSS transitions for simple fades, or keep framer-motion but uninstall the duplicate `motion` package.

---

## Verified-good patterns (short list)

- **`useSchedulerMasterData` hook** (`hooks/use-scheduler-master-data.ts`) — excellent use of React Query with 5-min staleTime + correctly batched Promise.all for ~8 independent master-data queries.
- **Scheduler modal/sidebar dynamic imports** (`scheduler/page.tsx:35-58`) — all 6 modals lazy-loaded with a single shared `ModalLoader`. Good pattern, replicate everywhere.
- **Settings tabs dynamic imports** (`settings/page.tsx:56-63`) — 8 tabs lazy via `next/dynamic`.
- **Debounced patient search** (`patients/page.tsx:110-113`) — 300 ms debounce with `setTimeout` is standard, correct.
- **Dashboard RPC consolidation** (`get_admin_dashboard_stats`, migrations 047/060) — replaced what would have been ~15 aggregate queries with a single SQL function. Pattern to replicate for financial/marketing reports (F-10).
- **Composite indexes migration 057** — demonstrates the team understands the problem; just needs to be extended (F-2, F-14, F-32).
- **Extra data on-demand** (`patients/page.tsx:185-215`) — appointments/payments fan-out only when debt/service filter is active is a smart optimization.
- **`runtime = "nodejs"` on portal routes** — correct for Supabase admin client usage.
- **Rate limiting** (`app/api/book/[slug]/route.ts:7`, etc.) — booking, register-invited, portal auth all have limiters; AI assistant has per-user quota.

---

## Additional observations (deferred)

- No `generateMetadata` / static caching on public marketing pages (producto, base-conocimientos, blog). Likely already SSG via App Router defaults — verify.
- The `lib/scheduler-config.ts` pattern (localStorage + background DB sync) is used in 2 places and causes dual renders. Consider unifying behind a single hook.
- Several `.maybeSingle()` / `.single()` calls used where returning many rows is guaranteed (e.g. `booking_settings` per org). These are correct but the error channel is unusual when the row is missing — add defensive logging.
- `sentry.client.config.ts` likely instruments fetch globally; confirm `tracesSampleRate` is not 1.0 in production.
- `jspdf-autotable` pulled at 29MB of jspdf; confirm it is in a split chunk. If not, dynamic-import `lib/report-export.ts` at the call site.
- Consider Vercel `Cache-Control: s-maxage` headers for portal public metadata (org name, logo, settings) — these change rarely and can be served from edge.
- `middleware.ts` — not reviewed in depth; verify matcher excludes static assets and public routes to avoid hitting the session RPC on asset requests.

