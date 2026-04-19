import { createClient } from "@/lib/supabase/server";
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
 *   - duration (default 30, allowed 15/20/30/45/60)
 *   - start_date (YYYY-MM-DD, default today)
 *
 * Returns slots that are free given doctor_schedules, existing
 * non-cancelled appointments and schedule_blocks. Past slots for today
 * are excluded. Runs only on demand (lazy) — no cron, no polling.
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

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctor_id");
  const days = Math.min(parseInt(searchParams.get("days") || "7", 10) || 7, 14);
  const duration = [15, 20, 30, 45, 60].includes(
    parseInt(searchParams.get("duration") || "30", 10)
  )
    ? parseInt(searchParams.get("duration") || "30", 10)
    : 30;
  const startDateParam = searchParams.get("start_date");
  const startDate = startDateParam ? new Date(startDateParam + "T00:00:00") : new Date();

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

  // Schedule blocks for the org in range
  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("block_date, start_time, end_time, office_id, all_day")
    .eq("organization_id", membership.organization_id)
    .gte("block_date", startStr)
    .lte("block_date", endStr);

  const now = new Date();
  const todayStr = formatDateISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

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

      let cursor = schStart;
      while (cursor + duration <= schEnd) {
        const slotStart = minutesToHHMM(cursor);
        const slotEndMin = cursor + duration;

        // Skip past slots for today
        if (dateStr === todayStr && cursor <= nowMinutes) {
          cursor += duration;
          continue;
        }

        // Check overlap with appointments (doctor-level, any office)
        const overlapsAppt = dayAppts.some((a) => {
          const aStart = toMinutes(a.start_time);
          const aEnd = toMinutes(a.end_time);
          return cursor < aEnd && slotEndMin > aStart;
        });
        if (overlapsAppt) {
          cursor += duration;
          continue;
        }

        // Check overlap with blocks. Office-specific blocks only affect that office.
        const overlapsBlock = dayBlocks.some((b) => {
          if (b.office_id && b.office_id !== sch.office_id) return false;
          if (b.all_day) return true;
          if (!b.start_time || !b.end_time) return false;
          const bStart = toMinutes(b.start_time);
          const bEnd = toMinutes(b.end_time);
          return cursor < bEnd && slotEndMin > bStart;
        });
        if (overlapsBlock) {
          cursor += duration;
          continue;
        }

        slotTimes.add(slotStart);
        cursor += duration;
      }
    }

    const sortedSlots = Array.from(slotTimes).sort();
    daysOut.push({ date: dateStr, dayOfWeek: dow, slots: sortedSlots });
  }

  return NextResponse.json({
    doctor: { id: doctor.id, full_name: doctor.full_name },
    duration,
    days: daysOut,
  });
}
