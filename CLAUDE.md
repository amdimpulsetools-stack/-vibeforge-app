# VibeForge App — Project Context

## Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (Auth, Database, Storage)
- Tailwind CSS 4 + shadcn/ui
- React Hook Form + Zod
- TanStack React Query + React Table
- Lucide icons, Sonner toasts, Framer Motion

## Structure
- `app/(auth)/` — Login, register, forgot-password (public)
- `app/(dashboard)/` — Protected pages with sidebar layout
- `app/api/` — API routes
- `components/layout/` — Sidebar, topbar
- `components/ui/` — shadcn/ui components
- `lib/supabase/` — Client (browser), server, middleware
- `hooks/` — Custom React hooks
- `types/` — TypeScript types + Supabase generated types
- `supabase/migrations/` — SQL migrations

## Conventions
- Files: kebab-case. Components: PascalCase. DB: snake_case
- Server Components by default. "use client" only when needed
- Supabase clients from lib/supabase/ — NEVER create inline
- All tables MUST have RLS enabled
- Forms: React Hook Form + Zod validation
- Mutations: Server Actions for simple, API routes for complex
- Accent color: Emerald green (primary)
- Dark theme by default

## Money rules (HARD conventions — never rewrite these formulas)
- Un número, una fórmula: todo monto que aparezca en una pantalla nueva se
  IMPORTA de la fórmula existente, jamás se reescribe. Deuda/pendiente de
  paciente o cita: `lib/patient-debt.ts` (espejo del RPC get_patient_summary).
- Plata clínica y de farmacia nunca se mezclan: solo pagos con
  `COALESCE(source,'clinical')='clinical'` cancelan consultas o deuda
  clínica (mig 213/219/233). Las ventas del POS (source='pos') se muestran
  aparte, nunca dentro de un "pagado/pendiente" clínico.
- Regla de oro IGV: cobros SIEMPRE en bruto (con IGV, como se cobran);
  cualquier "ganancia/margen/utilidad/rentabilidad" SIEMPRE neta
  (÷1.18 según `igv_affectation`: 1=gravado, 8=exonerado, 9=inafecto).
  Compra digitada SIN IGV, venta CON IGV.
- Tratamientos (migs 242-245): un cobro vive en UN solo contenedor —
  cita XOR plan XOR tratamiento (CHECK en `patient_payments`). Los cobros
  de tratamiento son plata clínica (`source='clinical'`: cuentan en
  Ingresos, Caja y "Mis cobros") pero NO cancelan deuda de citas
  (`treatment_id IS NULL` en `get_patient_summary` + `lib/patient-debt.ts`).
  Dinero del tratamiento: `lib/treatments/money.ts` (espejo de
  `get_treatments_overview`). Pagos directos a terceros
  (`treatment_external_payments`) NO son cobro: cubren acordado, nada más.
  Se inserta siempre con el cliente del usuario (el trigger de Caja
  estampa turno/medio/autor); jamás con service role.
- "Hoy" civil = zona horaria de la org (`organizations.timezone`,
  `lib/org-time.ts` / `useOrgToday()`). Nunca `new Date()` ni
  `toISOString()` para fechas de negocio: Vercel corre en UTC.

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Build for production
- `npm run types` — Regenerate Supabase types
