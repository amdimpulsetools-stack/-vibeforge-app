import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SCHEDULER_CONFIG,
  getScheduleStartMinutes,
  getScheduleEndMinutes,
  sanitizeBreakTime,
  overlapsBreakTime,
} from "@/lib/scheduler-config";
import { resolveOrgTimezone, zonedNow } from "@/lib/org-time";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDateISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * GET /api/scheduler/available-slots
 *
 * Params:
 *   - doctor_id (required)
 *   - days (default 7, max 14)
 *   - start_date (YYYY-MM-DD, default today)
 *
 * Slot anchoring/stride come from the org's scheduler_settings (start/end
 * hour+minute and the smallest configured interval), NOT from a caller
 * param — so the offered slots always line up with the real reservable rows
 * of the scheduler grid. The doctor_schedules window is applied as an
 * INTERSECTION filter (a slot must fit fully inside both the org window and
 * that day's schedule). Slots that overlap existing non-cancelled
 * appointments or schedule_blocks, and past slots for today, are excluded.
 * The org interval is echoed back as `duration`. Runs only on demand
 * (lazy) — no cron, no polling.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }

  // Org scheduler config drives the slot anchor + stride so the offered
  // slots line up with the real reservable rows of the grid. Absent row →
  // DEFAULT_SCHEDULER_CONFIG (no crash). See app/api/appointments/[id]/
  // live-status/route.ts for the same maybeSingle() read pattern.
  // select("*") en vez de la lista: `break_time` (mig 254) puede no existir
  // aún y pedir una columna inexistente daría 400 en vez de "sin descanso".
  const [{ data: settingsRow }, { data: orgRow }] = await Promise.all([
    supabase
      .from("scheduler_settings")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("timezone")
      .eq("id", membership.organization_id)
      .maybeSingle(),
  ]);

  const settings = settingsRow as {
    start_hour: number | null;
    end_hour: number | null;
    start_minute: number | null;
    end_minute: number | null;
    intervals: unknown;
    break_time?: unknown;
  } | null;
  // Break Time por org (mig 254): antes vivía en el navegador y este
  // endpoint ofrecía las franjas del descanso.
  const breakTime = sanitizeBreakTime(settings?.break_time);
  // "Hoy" y "ahora" en el reloj de la clínica (Vercel corre en UTC: después
  // de las 19:00 Lima el servidor ya estaba en mañana y dejaba de descartar
  // las horas pasadas de hoy).
  const orgTz = resolveOrgTimezone((orgRow as { timezone?: string | null } | null)?.timezone);

  const orgConfig = {
    ...DEFAULT_SCHEDULER_CONFIG,
    startHour: settings?.start_hour ?? DEFAULT_SCHEDULER_CONFIG.startHour,
    endHour: settings?.end_hour ?? DEFAULT_SCHEDULER_CONFIG.endHour,
    startMinute: settings?.start_minute ?? DEFAULT_SCHEDULER_CONFIG.startMinute,
    endMinute: settings?.end_minute ?? DEFAULT_SCHEDULER_CONFIG.endMinute,
  };
  const orgStartMin = getScheduleStartMinutes(orgConfig);
  const orgEndMin = getScheduleEndMinutes(orgConfig);

  // Smallest configured interval — same normalization as dbRowToConfig in
  // lib/scheduler-config.ts (filter to allowed set, fallback 15).
  const sanitizedIntervals = (
    Array.isArray(settings?.intervals) ? settings.intervals : [15]
  ).filter((v: number) => [15, 20, 30, 45, 60].includes(v)) as number[];
  const interval =
    sanitizedIntervals.length > 0 ? Math.min(...sanitizedIntervals) : 15;

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctor_id");
  const days = Math.min(parseInt(searchParams.get("days") || "7", 10) || 7, 14);
  const startDateParam = searchParams.get("start_date");
  const orgNow = zonedNow(orgTz);
  const startDate = startDateParam
    ? new Date(startDateParam + "T00:00:00")
    : new Date(orgNow.getFullYear(), orgNow.getMonth(), orgNow.getDate());

  if (!doctorId) {
    return NextResponse.json({ error: "missing_doctor_id" }, { status: 400 });
  }

  // Doctor (RLS ensures same org)
  const { data: doctor, error: doctorError } = await supabase
    .from("doctors")
    .select("id, full_name")
    .eq("id", doctorId)
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .single();

  if (doctorError || !doctor) {
    return NextResponse.json({ error: "doctor_not_found" }, { status: 404 });
  }

  // Date range
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days - 1);
  const startStr = formatDateISO(startDate);
  const endStr = formatDateISO(endDate);

  // Doctor schedules (all offices, all days)
  const { data: schedules } = await supabase
    .from("doctor_schedules")
    .select("day_of_week, start_time, end_time, office_id")
    .eq("doctor_id", doctorId);

  // Appointments (non-cancelled) for this doctor in range
  const { data: appointments } = await supabase
    .from("appointments")
    .select("appointment_date, start_time, end_time, office_id")
    .eq("doctor_id", doctorId)
    .gte("appointment_date", startStr)
    .lte("appointment_date", endStr)
    .neq("status", "cancelled");

  // Schedule blocks for the org in range — solo vigentes (mig 254:
  // desbloquear = marca removed_at). Sin la mig, la columna no existe y se
  // repite la consulta sin el filtro.
  let blocksQuery = await supabase
    .from("schedule_blocks")
    .select("block_date, start_time, end_time, office_id, all_day")
    .eq("organization_id", membership.organization_id)
    .is("removed_at", null)
    .gte("block_date", startStr)
    .lte("block_date", endStr);
  if (blocksQuery.error) {
    blocksQuery = await supabase
      .from("schedule_blocks")
      .select("block_date, start_time, end_time, office_id, all_day")
      .eq("organization_id", membership.organization_id)
      .gte("block_date", startStr)
      .lte("block_date", endStr);
  }
  const blocks = blocksQuery.data;

  const todayStr = formatDateISO(orgNow);
  const nowMinutes = orgNow.getHours() * 60 + orgNow.getMinutes();

  type DayPayload = { date: string; dayOfWeek: number; slots: string[] };
  const daysOut: DayPayload[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = formatDateISO(d);
    const dow = d.getDay(); // 0=Sun..6=Sat

    const daySchedules = (schedules ?? []).filter((s) => s.day_of_week === dow);
    if (daySchedules.length === 0) {
      daysOut.push({ date: dateStr, dayOfWeek: dow, slots: [] });
      continue;
    }

    const dayAppts = (appointments ?? []).filter((a) => a.appointment_date === dateStr);
    const dayBlocks = (blocks ?? []).filter((b) => b.block_date === dateStr);

    // If any all-day block with no office filter → whole day blocked
    const fullyBlocked = dayBlocks.some((b) => b.all_day && !b.office_id);
    if (fullyBlocked) {
      daysOut.push({ date: dateStr, dayOfWeek: dow, slots: [] });
      continue;
    }

    const slotTimes = new Set<string>();

    for (const sch of daySchedules) {
      if (!sch.start_time || !sch.end_time) continue;
      const schStart = toMinutes(sch.start_time);
      const schEnd = toMinutes(sch.end_time);

      // Anchor + stride come from the org config; the doctor schedule is an
      // intersection filter (the slot must fit fully inside both windows).
      for (let cursor = orgStartMin; cursor + interval <= orgEndMin; cursor += interval) {
        if (cursor < schStart || cursor + interval > schEnd) continue;

        const slotStart = minutesToHHMM(cursor);
        const slotEndMin = cursor + interval;

        // Skip past slots for today
        if (dateStr === todayStr && cursor <= nowMinutes) continue;

        // Check overlap with appointments (doctor-level, any office)
        const overlapsAppt = dayAppts.some((a) => {
          const aStart = toMinutes(a.start_time);
          const aEnd = toMinutes(a.end_time);
          return cursor < aEnd && slotEndMin > aStart;
        });
        if (overlapsAppt) continue;

        // Check overlap with blocks. Office-specific blocks only affect that office.
        const overlapsBlock = dayBlocks.some((b) => {
          if (b.office_id && b.office_id !== sch.office_id) return false;
          if (b.all_day) return true;
          if (!b.start_time || !b.end_time) return false;
          const bStart = toMinutes(b.start_time);
          const bEnd = toMinutes(b.end_time);
          return cursor < bEnd && slotEndMin > bStart;
        });
        if (overlapsBlock) continue;

        // Break Time de la org (mig 254): misma regla que en la agenda.
        if (overlapsBreakTime(breakTime, dateStr, slotStart, minutesToHHMM(slotEndMin))) continue;

        slotTimes.add(slotStart);
      }
    }

    const sortedSlots = Array.from(slotTimes).sort();
    daysOut.push({ date: dateStr, dayOfWeek: dow, slots: sortedSlots });
  }

  return NextResponse.json({
    doctor: { id: doctor.id, full_name: doctor.full_name },
    duration: interval,
    days: daysOut,
  });
}
