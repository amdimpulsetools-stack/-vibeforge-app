import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCronRun, finishCronRun } from "@/lib/cron-runs";
import { notifyOrgMembers } from "@/lib/live-notifications/notify";
import {
  alreadyNotified,
  recordNotice,
  resolveCajaEmailContext,
  sendCajaDailyExceptionsEmail,
  sendCajaStaleShiftEmail,
  sendCajaWeeklyDigestEmail,
  formatPEN,
  formatSignedPEN,
  type CajaShiftDifference,
} from "@/lib/caja-emails";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/caja-sweep
 *
 * Vercel Cron — 01:30 UTC = 20:30 hora de Lima, todos los días. La hora no
 * es arbitraria: es después de que cierra la clínica y antes de que nadie se
 * haya ido a dormir. Un aviso de caja a las 3 de la mañana se lee al día
 * siguiente, cuando ya no se puede preguntar nada a quien estuvo en el
 * mostrador.
 *
 * Cuatro barridos por organización con módulo Caja activo (= con fila en
 * `cash_settings`; ver el invariante 2 de la mig 214):
 *
 *   1. Turnos que siguen abiertos → campanita DIRIGIDA a quien lo abrió.
 *      A partir del 2.º día, además, correo al dueño.
 *   2. Cobros que entraron sin turno → campanita a dirección y recepción.
 *   3. Parte del día por correo, SOLO si hubo alguna excepción.
 *   4. Resumen semanal por correo, solo los lunes.
 *
 * ── Por qué esto es un cron y no un trigger ────────────────────────────
 * Los tres primeros avisan de cosas que NO PASARON: una caja que nadie
 * cerró, un cobro que nadie ató a un turno. Lo que no pasa no dispara
 * ningún handler; hace falta alguien que mire el reloj.
 *
 * ── Deduplicación ──────────────────────────────────────────────────────
 * Todo aviso pasa por `ops_notice_log` (mig 220) ANTES de emitirse. Un cron
 * reintentado por Vercel, un redeploy o una invocación manual no pueden
 * mandar el mismo correo dos veces: el aviso repetido es precisamente lo
 * que enseña al dueño a ignorar la bandeja donde le decimos que falta
 * dinero.
 *
 * ── Zona horaria ───────────────────────────────────────────────────────
 * Perú es UTC-5 fijo, sin horario de verano. "Hoy" es el día de LIMA, no el
 * de UTC — y a las 20:30 de Lima el reloj UTC ya está en el día siguiente,
 * así que usar `toISOString().slice(0,10)` a secas daría siempre el día
 * equivocado.
 *
 * Auth: CRON_SECRET en cabecera Bearer, igual que billing-status.
 */

const LIMA_OFFSET_MS = 5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** Fecha de pared en Lima ("YYYY-MM-DD") para un instante dado. */
function limaDateStr(at: Date): string {
  return new Date(at.getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante UTC en que empieza ese día de Lima (00:00 Lima = 05:00 UTC). */
function limaDayStart(dateStr: string): Date {
  return new Date(
    new Date(`${dateStr}T00:00:00.000Z`).getTime() + LIMA_OFFSET_MS,
  );
}

/** "14/08 09:15". */
function limaStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() - LIMA_OFFSET_MS);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(
    d.getUTCMinutes(),
  )}`;
}

/** "14/08 09:15–19:40" — la ventana del turno, que es el SUJETO de todo
 *  aviso de caja. Ver la nota de tono en lib/caja-emails.ts. */
function shiftWindow(openedAt: string, closedAt: string | null): string {
  const open = limaStamp(openedAt);
  if (!closedAt) return open;
  return `${open}–${limaStamp(closedAt).slice(6)}`;
}

/** Días completos que lleva abierto, en días de Lima. */
function daysOpen(openedAt: string, todayStr: string): number {
  const a = Date.parse(`${limaDateStr(new Date(openedAt))}T00:00:00Z`);
  const b = Date.parse(`${todayStr}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** Semana ISO ("2026-W33") del día de Lima dado. */
function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "del 4 al 10 de agosto". */
function rangeLabel(fromStr: string, toStr: string): string {
  const a = new Date(`${fromStr}T00:00:00Z`);
  const b = new Date(`${toStr}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const left = sameMonth
    ? `${a.getUTCDate()}`
    : `${a.getUTCDate()} de ${MONTHS_ES[a.getUTCMonth()]}`;
  return `del ${left} al ${b.getUTCDate()} de ${MONTHS_ES[b.getUTCMonth()]}`;
}

interface CashSettingsRow {
  organization_id: string;
  activated_at: string;
  difference_tolerance: number | string;
  difference_alert_threshold: number | string;
  notify_daily_exceptions: boolean;
  notify_weekly_digest: boolean;
  notify_stale_shift: boolean;
}

interface ShiftRow {
  id: string;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  status: string;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference_cash: number | string | null;
  force_closed: boolean;
  difference_reason: string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    cronSecret.length < 32 ||
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const runId = await startCronRun(supabase, "caja-sweep");
  const now = new Date();
  const today = limaDateStr(now);
  const dayStart = limaDayStart(today).toISOString();
  const dayEnd = new Date(limaDayStart(today).getTime() + DAY_MS).toISOString();
  // getUTCDay() sobre el día de Lima: 1 = lunes.
  const isMonday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;

  let staleNotified = 0;
  let staleEmailed = 0;
  let orphanNotified = 0;
  let dailyEmailed = 0;
  let weeklyEmailed = 0;
  let orgsScanned = 0;

  const { data: settingsRows } = await supabase
    .from("cash_settings")
    .select(
      "organization_id, activated_at, difference_tolerance, difference_alert_threshold, notify_daily_exceptions, notify_weekly_digest, notify_stale_shift",
    );

  // Addon apagado = módulo en pausa. La fila de cash_settings sobrevive a
  // la desactivación a propósito (la config vuelve intacta al reactivar),
  // así que NO alcanza como interruptor: sin este filtro, una org que
  // desactivó Caja seguía recibiendo el aviso nocturno de "Cobros fuera
  // de turno" (bug real, org de Patricia 2026-08-20; mig 226 hace el
  // mismo corte en el trigger caja_stamp_payment).
  const { data: cajaAddonRows } = await supabase
    .from("organization_addons")
    .select("organization_id")
    .eq("addon_key", "caja")
    .eq("enabled", true);
  const cajaEnabledOrgs = new Set(
    (cajaAddonRows ?? []).map((r) => r.organization_id as string),
  );

  for (const settings of (settingsRows ?? []) as CashSettingsRow[]) {
    const orgId = settings.organization_id;
    if (!cajaEnabledOrgs.has(orgId)) continue;
    orgsScanned++;

    // Umbral de AVISO: el mayor de los dos. Por debajo de la tolerancia no
    // hay incidente; por debajo del umbral de aviso el dueño pidió no
    // enterarse. Ver mig 220 (d).
    const alertThreshold = Math.max(
      num(settings.difference_tolerance),
      num(settings.difference_alert_threshold),
    );

    // ── 1. Turnos que siguen abiertos ────────────────────────────
    const { data: openShifts } = await supabase
      .from("cash_shifts")
      .select(
        "id, opened_at, opened_by, closed_at, status, expected_cash, counted_cash, difference_cash, force_closed, difference_reason",
      )
      .eq("organization_id", orgId)
      .eq("status", "open")
      .lt("opened_at", dayEnd)
      .order("opened_at", { ascending: true });

    const stillOpen = (openShifts ?? []) as ShiftRow[];

    for (const shift of stillOpen) {
      const days = daysOpen(shift.opened_at, today);

      // La campanita se repite CADA DÍA mientras siga abierta —por eso el
      // subject_id lleva la fecha—, pero una sola vez por día.
      const bellKey = `${shift.id}:${today}`;
      if (!(await alreadyNotified(supabase, orgId, "cash_shift_stale", bellKey))) {
        // DIRIGIDA a quien la abrió: el destinatario no se elige por su rol
        // en la organización sino por su papel en el hecho (mig 220).
        const res = await notifyOrgMembers(supabase, {
          organizationId: orgId,
          event: "cash_shift_stale",
          title: "Tu caja sigue abierta",
          body:
            days >= 1
              ? `El turno que abriste el ${limaStamp(shift.opened_at)} sigue abierto (${days} ${days === 1 ? "día" : "días"}). Mientras siga así, cada cobro nuevo se suma a él.`
              : `El turno que abriste a las ${limaStamp(shift.opened_at).slice(6)} sigue abierto. Cuenta el cajón y ciérralo antes de irte.`,
          actionUrl: "/caja",
          targetUserId: shift.opened_by,
        });
        if (res.ok) {
          await recordNotice(supabase, orgId, "cash_shift_stale", bellKey, {
            shift_id: shift.id,
            days_open: days,
            recipients: res.recipients,
          });
          staleNotified++;
        }
      }

      // A partir del 2.º día deja de ser un olvido y pasa a ser un problema
      // de datos: el conteo por día ya no se puede reconstruir. Ahí entra el
      // dueño, por correo.
      if (days >= 2 && settings.notify_stale_shift) {
        const mailKey = `${shift.id}:${today}`;
        if (!(await alreadyNotified(supabase, orgId, "caja_stale_shift_email", mailKey))) {
          const ctx = await resolveCajaEmailContext(supabase, orgId);
          if (ctx) {
            const sent = await sendCajaStaleShiftEmail(ctx, {
              days,
              openedLabel: `el ${limaStamp(shift.opened_at).slice(0, 5)} a las ${limaStamp(shift.opened_at).slice(6)}`,
            });
            if (sent.ok) {
              await recordNotice(supabase, orgId, "caja_stale_shift_email", mailKey, {
                shift_id: shift.id,
                days_open: days,
                to: ctx.toEmail,
              });
              staleEmailed++;
            }
          }
        }
      }
    }

    // ── 2. Cobros fuera de turno ─────────────────────────────────
    // `activated_at` es la frontera del módulo (mig 214): los cobros
    // anteriores nunca tuvieron turno y no son una excepción de nada.
    // `source='clinical'` deja fuera las ventas del POS de Farmacia, que
    // llevan su propio circuito.
    const { data: orphans } = await supabase
      .from("patient_payments")
      .select("id, amount")
      .eq("organization_id", orgId)
      .is("cash_shift_id", null)
      .eq("source", "clinical")
      .gte("created_at", settings.activated_at)
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd);

    const orphanCount = (orphans ?? []).length;
    const orphanAmount = (orphans ?? []).reduce(
      (acc, p) => acc + num((p as { amount: number | string }).amount),
      0,
    );

    if (orphanCount > 0) {
      if (!(await alreadyNotified(supabase, orgId, "cash_orphan_payments", today))) {
        const res = await notifyOrgMembers(supabase, {
          organizationId: orgId,
          event: "cash_orphan_payments",
          title: "Cobros fuera de turno",
          body: `${orphanCount} ${orphanCount === 1 ? "cobro entró" : "cobros entraron"} hoy sin caja abierta (${formatPEN(orphanAmount)}). Se atribuyen a un turno desde Caja › Fuera de turno.`,
          actionUrl: "/caja",
        });
        if (res.ok) {
          await recordNotice(supabase, orgId, "cash_orphan_payments", today, {
            count: orphanCount,
            amount: orphanAmount,
            recipients: res.recipients,
          });
          orphanNotified++;
        }
      }
    }

    // ── 3. Parte del día ─────────────────────────────────────────
    if (settings.notify_daily_exceptions) {
      const { data: closedToday } = await supabase
        .from("cash_shifts")
        .select(
          "id, opened_at, opened_by, closed_at, status, expected_cash, counted_cash, difference_cash, force_closed, difference_reason",
        )
        .eq("organization_id", orgId)
        .eq("status", "closed")
        .gte("closed_at", dayStart)
        .lt("closed_at", dayEnd)
        .order("closed_at", { ascending: true });

      const closed = (closedToday ?? []) as ShiftRow[];

      const differences: CajaShiftDifference[] = closed
        .filter((s) => Math.abs(num(s.difference_cash)) > alertThreshold)
        .map((s) => ({
          window: shiftWindow(s.opened_at, s.closed_at),
          expected: num(s.expected_cash),
          counted: num(s.counted_cash),
          difference: num(s.difference_cash),
          reason: s.difference_reason,
        }));

      const forceClosed = closed
        .filter((s) => s.force_closed)
        .map((s) => ({ window: shiftWindow(s.opened_at, s.closed_at) }));

      const openLabels = stillOpen.map((s) => ({
        openedLabel: `desde el ${limaStamp(s.opened_at)}`,
      }));

      const hasException =
        differences.length > 0 ||
        forceClosed.length > 0 ||
        openLabels.length > 0 ||
        orphanCount > 0;

      // LA REGLA DEL CORREO: si no hay excepción, no hay correo. Un parte
      // diario que llega los 30 días del mes es un parte que no se abre el
      // día 31, que es justo el día que traía algo.
      if (hasException) {
        if (!(await alreadyNotified(supabase, orgId, "caja_daily_exceptions", today))) {
          const ctx = await resolveCajaEmailContext(supabase, orgId);
          if (ctx) {
            const sent = await sendCajaDailyExceptionsEmail(ctx, {
              differences,
              forceClosed,
              stillOpen: openLabels,
              orphanCount,
              orphanAmount,
            });
            if (sent.ok) {
              await recordNotice(supabase, orgId, "caja_daily_exceptions", today, {
                differences: differences.length,
                force_closed: forceClosed.length,
                still_open: openLabels.length,
                orphans: orphanCount,
                to: ctx.toEmail,
              });
              dailyEmailed++;
            }
          }
        }
      }
    }

    // ── 4. Resumen semanal (lunes) ───────────────────────────────
    if (isMonday && settings.notify_weekly_digest) {
      const weekStart = new Date(
        new Date(`${today}T00:00:00Z`).getTime() - 7 * DAY_MS,
      );
      const weekStartStr = weekStart.toISOString().slice(0, 10);
      const weekEndStr = new Date(weekStart.getTime() + 6 * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const weekKey = isoWeekKey(weekStartStr);

      if (!(await alreadyNotified(supabase, orgId, "caja_weekly_digest", weekKey))) {
        const fromIso = limaDayStart(weekStartStr).toISOString();
        const toIso = limaDayStart(today).toISOString();

        const { data: weekShifts } = await supabase
          .from("cash_shifts")
          .select(
            "id, opened_at, opened_by, closed_at, status, expected_cash, counted_cash, difference_cash, force_closed, difference_reason",
          )
          .eq("organization_id", orgId)
          .eq("status", "closed")
          .gte("closed_at", fromIso)
          .lt("closed_at", toIso);

        const shifts = (weekShifts ?? []) as ShiftRow[];

        const { data: weekOrphans } = await supabase
          .from("patient_payments")
          .select("id")
          .eq("organization_id", orgId)
          .is("cash_shift_id", null)
          .eq("source", "clinical")
          .gte("created_at", settings.activated_at)
          .gte("created_at", fromIso)
          .lt("created_at", toIso);

        const ctx = await resolveCajaEmailContext(supabase, orgId);
        if (ctx) {
          const sent = await sendCajaWeeklyDigestEmail(ctx, {
            rangeLabel: rangeLabel(weekStartStr, weekEndStr),
            shiftsClosed: shifts.length,
            shiftsExact: shifts.filter((s) => num(s.difference_cash) === 0).length,
            expectedTotal: shifts.reduce((a, s) => a + num(s.expected_cash), 0),
            countedTotal: shifts.reduce((a, s) => a + num(s.counted_cash), 0),
            differenceTotal: shifts.reduce((a, s) => a + num(s.difference_cash), 0),
            orphanCount: (weekOrphans ?? []).length,
            forceClosedCount: shifts.filter((s) => s.force_closed).length,
          });
          if (sent.ok) {
            await recordNotice(supabase, orgId, "caja_weekly_digest", weekKey, {
              shifts: shifts.length,
              difference_total: formatSignedPEN(
                shifts.reduce((a, s) => a + num(s.difference_cash), 0),
              ),
              to: ctx.toEmail,
            });
            weeklyEmailed++;
          }
        }
      }
    }
  }

  const summary = {
    orgs_scanned: orgsScanned,
    stale_notified: staleNotified,
    stale_emailed: staleEmailed,
    orphan_notified: orphanNotified,
    daily_emailed: dailyEmailed,
    weekly_emailed: weeklyEmailed,
  };
  await finishCronRun(supabase, runId, true, summary);

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    lima_date: today,
    ...summary,
  });
}
