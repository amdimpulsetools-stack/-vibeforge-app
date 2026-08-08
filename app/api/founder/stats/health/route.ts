import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export const runtime = "nodejs";

/**
 * GET /api/founder/stats/health — operación técnica REAL.
 *
 * La versión anterior devolvía estados decorativos hardcodeados
 * ("dbStatus: healthy", "webhookStatus: ok", 70 migraciones) que la página
 * mostraba como si fueran verificaciones (auditoría 2026-08-08). Ahora todo
 * sale de la base:
 *   · última corrida por cron (cron_runs, mig 204) + alerta si un cron
 *     diario lleva >36h sin correr — los no instrumentados se listan como
 *     "sin registro" y el de fertilidad como pausado deliberadamente
 *   · comprobantes SUNAT rechazados/error últimos 7d
 *   · WhatsApps y recordatorios de email fallidos últimos 7d
 *   · actividad reciente de billing (billing_events = evidencia indirecta
 *     del webhook MP)
 *   · tickets abiertos con antigüedad
 */

const DAY_MS = 24 * 3600 * 1000;

// Crons diarios que DEBERÍAN correr (Cron Bridge). El de fertilidad está
// pausado a propósito desde la auditoría 2026-07-21 (backlog de seguimientos
// viejos que dispararía mensajes incoherentes a pacientes) — se muestra como
// "pausado", no como falla.
const EXPECTED_CRONS = [
  { name: "billing-status", label: "Billing (trials, gracia, cobros)" },
  { name: "reminders", label: "Recordatorios de citas" },
  { name: "daily-summary", label: "Resumen diario" },
  { name: "sheets-mirror", label: "Espejo Google Sheets" },
  { name: "live-status-eod-sweep", label: "Cierre de estados en vivo" },
  { name: "account-deletion-process", label: "Eliminación de cuentas" },
];
const PAUSED_CRONS = [
  {
    name: "fertility-followup-contact",
    label: "Contacto automático de seguimientos (fertilidad)",
    reason:
      "Pausado deliberadamente (2026-07-21): requiere triage del backlog con la asesora antes de reactivar.",
  },
];

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY_MS).toISOString();

  const [
    cronRunsRes,
    einvBadRes,
    waFailedRes,
    remindersFailedRes,
    billingEventsRes,
    ticketsOpenRes,
  ] = await Promise.all([
    admin
      .from("cron_runs")
      .select("cron_name, started_at, finished_at, ok, summary")
      .order("started_at", { ascending: false })
      .limit(100),
    admin
      .from("einvoices")
      .select("organization_id, status, issued_at")
      .in("status", ["rejected", "error"])
      .gte("issued_at", d7),
    admin
      .from("whatsapp_message_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("sent_at", d7),
    admin
      .from("reminder_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("sent_at", d7),
    admin
      .from("billing_events")
      .select("event_type, organization_id, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("support_tickets")
      .select("subject, created_at, priority")
      .in("status", ["open", "waiting"])
      .order("created_at", { ascending: true }),
  ]);

  // Última corrida por cron
  const lastRunByName = new Map<
    string,
    { started_at: string; finished_at: string | null; ok: boolean | null }
  >();
  for (const r of cronRunsRes.data ?? []) {
    if (!lastRunByName.has(r.cron_name)) lastRunByName.set(r.cron_name, r);
  }

  const crons = EXPECTED_CRONS.map((c) => {
    const last = lastRunByName.get(c.name);
    const hoursSince = last
      ? Math.floor((now - Date.parse(last.started_at)) / 3600000)
      : null;
    return {
      ...c,
      status: !last
        ? ("sin_registro" as const) // aún no instrumentado o nunca corrió desde mig 204
        : last.ok === false
          ? ("error" as const)
          : hoursSince !== null && hoursSince > 36
            ? ("atrasado" as const)
            : ("ok" as const),
      last_run: last?.started_at ?? null,
      hours_since: hoursSince,
    };
  });

  return NextResponse.json({
    crons,
    paused_crons: PAUSED_CRONS,
    einvoices_bad_7d: (einvBadRes.data ?? []).length,
    whatsapp_failed_7d: waFailedRes.count ?? 0,
    email_reminders_failed_7d: remindersFailedRes.count ?? 0,
    recent_billing_events: billingEventsRes.data ?? [],
    open_tickets: (ticketsOpenRes.data ?? []).map((t) => ({
      subject: t.subject,
      created_at: t.created_at,
      priority: t.priority,
      hours_open: Math.floor((now - Date.parse(t.created_at)) / 3600000),
    })),
    generated_at: new Date(now).toISOString(),
  });
}
