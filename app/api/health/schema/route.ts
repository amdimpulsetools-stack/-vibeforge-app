import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/followups/org-scope";
import { generalLimiter } from "@/lib/rate-limit";
// Módulo puro (sin "use client" ni imports): la constante se importa tal
// cual, así este chequeo nunca se desincroniza de la Caja.
import { PAYMENT_COLUMNS as CAJA_PAYMENT_COLUMNS } from "@/app/(dashboard)/caja/types";

/**
 * GET /api/health/schema[?org_id=<uuid>] — chequeo de salud EN VIVO del
 * esquema tal como lo ve PostgREST. Solo owner/admin de la org activa.
 *
 * Por qué existe (incidente 30-sep-2026): la mig 273 agregó una segunda FK
 * patient_payments → appointments; PostgREST dejó de poder resolver el embed
 * `patient_payments(amount)` de la agenda (PGRST201), la consulta falló y la
 * agenda se vio en blanco. Las pruebas de migraciones (Postgres local) no lo
 * detectan porque no pasan por PostgREST. Este endpoint sí: corre las
 * lecturas más calientes del producto, con sus selects REALES, contra la
 * base viva.
 *
 * Cómo: cada consulta va con `.limit(0)`. PostgREST igual resuelve los
 * embeds (PGRST200/201 salen antes de tocar SQL) y Postgres igual valida
 * columnas y filtros (42703…), pero no devuelve ni una fila: cero datos de
 * pacientes, costo mínimo. Los ids de los filtros son el UUID nulo y las
 * fechas un literal fijo: solo importa que el filtro sea válido.
 *
 * Respuesta: SIEMPRE 200 con `{ ok, checked_at, results }` (es un
 * diagnóstico: que algo falle es información, no un error del endpoint).
 * 401/403/429 solo para quien no puede verlo.
 *
 * Mantener sincronizado: los selects que viven en componentes cliente o en
 * otros route.ts no se pueden importar (un route.ts no admite exports
 * arbitrarios; tocar esos archivos está fuera de este cambio) y van
 * COPIADOS con su origen. Si cambias el select original, cámbialo aquí.
 * Un chequeo que falla aquí pero la pantalla anda = copia desincronizada.
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const ANY_DATE = "2000-01-01";
const CHECK_TIMEOUT_MS = 10_000;
const MAX_TEXT = 500;

type SupaClient = Awaited<ReturnType<typeof createClient>>;

interface PgErrorLike {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}

interface SchemaCheck {
  name: string;
  /** Archivo (e identificador) de donde sale el select. */
  source: string;
  run: (supabase: SupaClient, orgId: string) => PromiseLike<{ error: PgErrorLike | null }>;
  /**
   * Columna de una migración que puede no estar aplicada todavía: si el
   * error es "esta columna no existe", el chequeo sale ok con una nota (la
   * pantalla tiene respaldo sin ella); cualquier OTRO error sí falla.
   */
  optionalColumn?: { column: string; migration: string };
}

interface CheckResult {
  name: string;
  source: string;
  ok: boolean;
  code?: string;
  message?: string;
  hint?: string;
}

// ── Selects copiados (mantener sincronizados) ─────────────────────────────
// Tipados como `string` a propósito: con un literal, el parser de tipos de
// supabase-js recorre el select entero (TS2589 con los largos).

// Copiado de app/(dashboard)/scheduler/page.tsx:413 (`apptColumns`, variante
// completa serviceColor/modality/prescriptions = true), mantener sincronizado.
// La página tiene cascada de respaldo: si aquí falla por `modality`/`color`,
// la agenda estará degradada, no en blanco; si falla por un embed, la agenda
// cae entera (así fue el incidente).
const AGENDA_SELECT: string =
  "id, patient_id, patient_name, patient_phone, doctor_id, office_id, service_id, appointment_date, start_time, end_time, status, origin, payment_method, responsible, responsible_user_id, notes, meeting_url, modality, price_snapshot, discount_amount, discount_reason, discount_code_id, treatment_session_id, einvoice_id, organization_id, created_at, updated_at, edited_at, edited_by_name, arrived_at, consultation_started_at, consultation_ended_at, doctors(id, full_name, color, default_meeting_url), offices(id, name), services(id, name, duration_minutes, base_price, color), patients(is_recurring, dni, birth_date), patient_payments!patient_payments_appointment_id_fkey(amount), prescriptions(id)";

// Copiado de app/(dashboard)/scheduler/history/page.tsx:147 (`columns` con
// withModality = true), mantener sincronizado.
const HISTORY_SELECT: string =
  "id, appointment_date, start_time, end_time, patient_name, status, price_snapshot, meeting_url, modality, doctors(id, full_name, color), offices(id, name), services(id, name, duration_minutes, base_price)";

// Copiado de app/(dashboard)/scheduler/appointment-sidebar.tsx:883
// (`fetchPayments`), mantener sincronizado.
const SIDEBAR_PAYMENTS_SELECT: string =
  "id, appointment_id, patient_id, amount, payment_method, payment_date, notes, source, treatment_id, organization_id, created_at";

// Copiado de app/(dashboard)/scheduler/appointment-sidebar.tsx:866
// (`fetchAppointmentEinvoices`), mantener sincronizado.
const SIDEBAR_EINVOICES_SELECT: string = "id, total, status";

// Copiado de app/(dashboard)/scheduler/appointment-sidebar.tsx:897 y :904
// (deuda del paciente en `fetchPayments`, fórmula de lib/patient-debt.ts),
// mantener sincronizado.
const SIDEBAR_DEBT_APPTS_SELECT: string = "id, appointment_date, price_snapshot, discount_amount, status, services(name, base_price)";
const SIDEBAR_DEBT_PAYMENTS_SELECT: string = "amount, source, treatment_id";

// Copiado de app/api/clinical-followups/dashboard/route.ts:265-287
// (`SELECT_WITH_DETAILS` = `FOLLOWUP_COLUMNS` + embeds), mantener sincronizado.
const FOLLOWUPS_SELECT: string =
  "id, organization_id, patient_id, doctor_id, status, source, rule_key, " +
  "follow_up_date, expected_by, closed_at, attempt_count, max_attempts, " +
  "priority, reason, snooze_until, first_contact_at, last_contacted_at, " +
  "target_category_canonical, closure_reason, created_at, updated_at, " +
  "appointment_id, source_type, source_id" +
  ", doctors(id, full_name), patients(first_name, last_name, phone), budget_records!budget_records_followup_id_fkey(id, treatment_type, amount, sent_by_user_id, sent_at)";

// Copiado de app/(dashboard)/patients/patient-drawer.tsx:332 (`selectAppts`
// con withModality = true), mantener sincronizado.
const PATIENT_APPTS_SELECT: string =
  "id, appointment_date, start_time, end_time, status, patient_id, notes, meeting_url, modality, doctors(id, full_name, color), services(id, name, base_price), offices(id, name)";

// Copiado de app/(dashboard)/patients/patient-drawer.tsx:350 (pagos del
// historial), mantener sincronizado.
const PATIENT_PAYMENTS_SELECT: string =
  "id, patient_id, appointment_id, amount, payment_method, payment_date, notes, organization_id, created_at, sale_id, treatment_id, revenue_bucket, external_receipt_ref";

// Copiado de app/(dashboard)/patients/patient-drawer.tsx:404-407
// (tratamientos, addon fertilidad), mantener sincronizado.
const PATIENT_TREATMENTS_SELECT: string =
  "id, title, treatment_type, status, outcome, expected_total, started_at, closed_at, " +
  "doctors(full_name), patient_payments(amount, source, revenue_bucket), " +
  "treatment_external_payments(amount)";

// Copiado de app/api/live-notifications/emit/route.ts:108 (evento
// payment_registered; el otro lado del par del incidente), mantener
// sincronizado.
const PAYMENT_NOTIFICATION_SELECT: string =
  "id, amount, appointment_id, patients(first_name, last_name), appointments!patient_payments_appointment_id_fkey(appointment_date, patient_name)";

// ── Chequeos: mismos filtros/orden que el original, con `.limit(0)` ───────
const CHECKS: SchemaCheck[] = [
  {
    name: "agenda_citas",
    source: "app/(dashboard)/scheduler/page.tsx (apptColumns)",
    run: (s) =>
      s
        .from("appointments")
        .select(AGENDA_SELECT)
        .gte("appointment_date", ANY_DATE)
        .lte("appointment_date", ANY_DATE)
        .neq("status", "cancelled")
        .eq("prescriptions.is_active", true)
        .order("start_time")
        .limit(0),
  },
  {
    // Primera variante de la cascada de la agenda desde la mig 274: la
    // misma de arriba + `hold_expires_at` (pre-reserva).
    name: "agenda_citas_pre_reserva",
    source: "app/(dashboard)/scheduler/page.tsx (apptColumns, hold = true)",
    optionalColumn: { column: "hold_expires_at", migration: "mig 274" },
    run: (s) =>
      s
        .from("appointments")
        .select(AGENDA_SELECT + ", hold_expires_at")
        .gte("appointment_date", ANY_DATE)
        .lte("appointment_date", ANY_DATE)
        .neq("status", "cancelled")
        .eq("prescriptions.is_active", true)
        .order("start_time")
        .limit(0),
  },
  {
    name: "historial_citas",
    source: "app/(dashboard)/scheduler/history/page.tsx (buildQuery)",
    run: (s) =>
      s
        .from("appointments")
        .select(HISTORY_SELECT)
        .gte("appointment_date", ANY_DATE)
        .lte("appointment_date", ANY_DATE)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(0),
  },
  {
    name: "ficha_cita_pagos",
    source: "app/(dashboard)/scheduler/appointment-sidebar.tsx (fetchPayments)",
    run: (s) =>
      s
        .from("patient_payments")
        .select(SIDEBAR_PAYMENTS_SELECT)
        .eq("appointment_id", NIL_UUID)
        .order("payment_date", { ascending: true })
        .limit(0),
  },
  {
    name: "ficha_cita_comprobantes",
    source: "app/(dashboard)/scheduler/appointment-sidebar.tsx (fetchAppointmentEinvoices)",
    run: (s) =>
      s
        .from("einvoices")
        .select(SIDEBAR_EINVOICES_SELECT)
        .eq("appointment_id", NIL_UUID)
        .order("issued_at", { ascending: true })
        .limit(0),
  },
  {
    name: "ficha_cita_deuda_citas",
    source: "app/(dashboard)/scheduler/appointment-sidebar.tsx (fetchPayments, deuda)",
    run: (s) =>
      s
        .from("appointments")
        .select(SIDEBAR_DEBT_APPTS_SELECT)
        .eq("patient_id", NIL_UUID)
        .neq("status", "cancelled")
        .limit(0),
  },
  {
    name: "ficha_cita_deuda_pagos",
    source: "app/(dashboard)/scheduler/appointment-sidebar.tsx (fetchPayments, deuda)",
    run: (s) =>
      s
        .from("patient_payments")
        .select(SIDEBAR_DEBT_PAYMENTS_SELECT)
        .eq("patient_id", NIL_UUID)
        .limit(0),
  },
  {
    name: "caja_cobros",
    source: "app/(dashboard)/caja/page.tsx (loadShiftDetail, PAYMENT_COLUMNS)",
    run: (s) =>
      s
        .from("patient_payments")
        .select(CAJA_PAYMENT_COLUMNS)
        .eq("cash_shift_id", NIL_UUID)
        .order("created_at", { ascending: false })
        .limit(0),
  },
  {
    name: "seguimientos_bandeja",
    source: "app/api/clinical-followups/dashboard/route.ts (SELECT_WITH_DETAILS)",
    run: (s, orgId) =>
      s
        .from("clinical_followups")
        .select(FOLLOWUPS_SELECT)
        .eq("organization_id", orgId)
        .order("last_contacted_at", { ascending: true, nullsFirst: true })
        .order("expected_by", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(0),
  },
  {
    name: "paciente_citas",
    source: "app/(dashboard)/patients/patient-drawer.tsx (selectAppts)",
    run: (s) =>
      s
        .from("appointments")
        .select(PATIENT_APPTS_SELECT)
        .eq("patient_id", NIL_UUID)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(0),
  },
  {
    name: "paciente_pagos",
    source: "app/(dashboard)/patients/patient-drawer.tsx (patient-history)",
    run: (s) =>
      s
        .from("patient_payments")
        .select(PATIENT_PAYMENTS_SELECT)
        .eq("patient_id", NIL_UUID)
        .order("payment_date", { ascending: false })
        .limit(0),
  },
  {
    name: "paciente_tratamientos",
    source: "app/(dashboard)/patients/patient-drawer.tsx (patient-treatments)",
    run: (s) =>
      s
        .from("treatments")
        .select(PATIENT_TREATMENTS_SELECT)
        .eq("patient_id", NIL_UUID)
        .order("started_at", { ascending: false })
        .limit(0),
  },
  {
    name: "notificacion_cobro",
    source: "app/api/live-notifications/emit/route.ts (payment_registered)",
    run: (s, orgId) =>
      s
        .from("patient_payments")
        .select(PAYMENT_NOTIFICATION_SELECT)
        .eq("id", NIL_UUID)
        .eq("organization_id", orgId)
        .limit(0),
  },
];

function clip(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t;
}

async function runCheck(
  check: SchemaCheck,
  supabase: SupaClient,
  orgId: string
): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<{ error: PgErrorLike }>((resolve) => {
      timer = setTimeout(
        () =>
          resolve({
            error: {
              code: "TIMEOUT",
              message: `Sin respuesta en ${CHECK_TIMEOUT_MS / 1000} s`,
            },
          }),
        CHECK_TIMEOUT_MS
      );
    });
    const { error } = await Promise.race([
      Promise.resolve(check.run(supabase, orgId)),
      timeout,
    ]);
    if (!error) return { name: check.name, source: check.source, ok: true };
    const opt = check.optionalColumn;
    if (
      opt &&
      (error.code === "42703" || error.code === "PGRST204") &&
      new RegExp(opt.column, "i").test(error.message ?? "")
    ) {
      return {
        name: check.name,
        source: check.source,
        ok: true,
        message: `${opt.column} aún no existe (${opt.migration} sin aplicar): la pantalla usa su respaldo.`,
      };
    }
    // Solo metadatos del error de PostgREST (código, mensaje, hint): con
    // `.limit(0)` no hay filas, y `details` se omite a propósito.
    return {
      name: check.name,
      source: check.source,
      ok: false,
      code: clip(error.code),
      message: clip(error.message) ?? "Error sin mensaje",
      hint: clip(error.hint),
    };
  } catch (err) {
    return {
      name: check.name,
      source: check.source,
      ok: false,
      code: "EXCEPTION",
      message: clip(err instanceof Error ? err.message : String(err)) ?? "Excepción",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "No autorizado" }, 401);

  const rl = generalLimiter(user.id);
  if (!rl.success) return json({ error: "Demasiadas solicitudes" }, 429);

  const rawOrgId = request.nextUrl.searchParams.get("org_id");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) {
    return json({ error: "org_id inválido" }, 400);
  }

  // Org activa (el cliente la manda en ?org_id=; sin ella, primera
  // membresía activa) + rol owner/admin en ESA org — mismo patrón que
  // PUT /api/organization-followup-settings.
  const org = await resolveActiveOrg(supabase, user.id, rawOrgId);
  if (org.error) {
    org.error.headers.set("Cache-Control", "no-store");
    return org.error;
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", org.organizationId)
    .eq("is_active", true)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return json({ error: "Solo el dueño o un administrador" }, 403);
  }

  const results = await Promise.all(
    CHECKS.map((check) => runCheck(check, supabase, org.organizationId))
  );

  return json({
    ok: results.every((r) => r.ok),
    // Instante técnico del chequeo (no es una fecha de negocio).
    checked_at: new Date().toISOString(),
    results,
  });
}
