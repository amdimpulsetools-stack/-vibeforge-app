import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const doctorId = request.nextUrl.searchParams.get("doctor_id");
  const priorityFilter = request.nextUrl.searchParams.get("priority");

  // Fetch unresolved followups with follow_up_date set
  let query = supabase
    .from("clinical_followups")
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .eq("is_resolved", false)
    .not("follow_up_date", "is", null)
    .order("follow_up_date", { ascending: true });

  if (doctorId) query = query.eq("doctor_id", doctorId);
  if (priorityFilter) query = query.eq("priority", priorityFilter);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const items = (data ?? [])
    .filter((item) => {
      // If contacted less than 3 days ago, hide from dashboard
      if (item.last_contacted_at) {
        const contactedAt = new Date(item.last_contacted_at);
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        if (contactedAt > threeDaysAgo) return false;
      }
      return true;
    })
    .map((item) => {
      const followUpDate = new Date(item.follow_up_date + "T00:00:00");
      const diffTime = followUpDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let urgency: "overdue" | "this_week" | "upcoming";
      if (daysDiff < 0) {
        urgency = "overdue";
      } else if (daysDiff <= 7) {
        urgency = "this_week";
      } else {
        urgency = "upcoming";
      }

      return { ...item, urgency, days_diff: daysDiff };
    })
    // Show all future followups (no cutoff limit)
    .filter((item) => item.days_diff <= 365);

  const overdue = items.filter((i) => i.urgency === "overdue");
  const thisWeek = items.filter((i) => i.urgency === "this_week");
  const upcoming = items.filter((i) => i.urgency === "upcoming");

  return NextResponse.json({
    data: { overdue, this_week: thisWeek, upcoming },
    counts: {
      overdue: overdue.length,
      this_week: thisWeek.length,
      upcoming: upcoming.length,
      total: items.length,
    },
  });
}
