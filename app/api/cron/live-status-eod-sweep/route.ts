import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/live-status-eod-sweep
 *
 * Vercel Cron — daily at 07:00 UTC (02:00 Lima). Part G of the live
 * appointment status feature (mig 170).
 *
 * Closes "orphan" consultations: rows where someone marked "iniciar
 * consulta" but nobody (and no auto-close) ever ended it, and the
 * appointment's date is already in the past. Without this sweep an
 * orphan would survive across days and the next `start_consultation`
 * for that doctor would stamp it with a nonsensical
 * `auto_next_started` close time days later.
 *
 * Close timestamp = the appointment's scheduled end (`appointment_date
 * + end_time`, America/Lima offset) — the best available estimate of
 * when the visit actually ended. Example: cita 16:00–16:30, doctor
 * marked start at 16:05 and forgot to end → the sweep stamps 16:30.
 * Using the sweep's own run time (≈midnight) would poison the
 * "average consultation duration" reports with 8-hour visits.
 *
 * Edge case: consultation started AFTER the scheduled end (heavy
 * delays). Scheduled end would predate the start — instead we stamp
 * started_at + 30 minutes so duration stays positive and plausible.
 *
 * Marked with consultation_closed_reason = 'auto_eod' so reports can
 * separate real durations from estimated ones.
 */

interface OrphanRow {
  id: string;
  appointment_date: string;
  end_time: string;
  consultation_started_at: string;
}

// Peru has no DST; the fixed -05:00 offset is safe. If Yenda ever
// expands to DST countries this needs a per-org timezone column.
const LIMA_UTC_OFFSET = "-05:00";

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

  // "Yesterday or older" in Lima time. The cron runs at 02:00 Lima,
  // so everything dated before today-Lima is a finished business day.
  const limaNow = new Date(Date.now() - 5 * 3600 * 1000);
  const todayLima = limaNow.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, end_time, consultation_started_at")
    .not("consultation_started_at", "is", null)
    .is("consultation_ended_at", null)
    .lt("appointment_date", todayLima)
    // Safety valve: never sweep more than 500 rows per run. The
    // steady state is a handful per day across all orgs.
    .limit(500);

  if (error) {
    console.error("[live-status-eod] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as OrphanRow[] | null) ?? [];
  let closed = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const scheduledEnd = new Date(
      `${row.appointment_date}T${row.end_time}${LIMA_UTC_OFFSET}`,
    );
    const startedAt = new Date(row.consultation_started_at);
    const endedAt =
      scheduledEnd > startedAt
        ? scheduledEnd
        : new Date(startedAt.getTime() + 30 * 60 * 1000);

    const { error: updErr } = await supabase
      .from("appointments")
      .update({
        consultation_ended_at: endedAt.toISOString(),
        consultation_closed_reason: "auto_eod",
      })
      .eq("id", row.id)
      // Re-check it's still open — a manual close between SELECT and
      // UPDATE must win over the estimate.
      .is("consultation_ended_at", null);

    if (updErr) {
      failures.push(row.id);
      console.error(`[live-status-eod] failed to close ${row.id}:`, updErr);
    } else {
      closed++;
    }
  }

  console.log(
    `[live-status-eod] swept ${rows.length} orphan(s): ${closed} closed, ${failures.length} failed`,
  );
  return NextResponse.json({
    scanned: rows.length,
    closed,
    failed: failures.length,
  });
}
