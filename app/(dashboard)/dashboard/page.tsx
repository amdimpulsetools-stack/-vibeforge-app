import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get membership + role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/login");

  const role = membership.role as "owner" | "admin" | "member";

  // Receptionist (member) → redirect straight to scheduler
  if (role === "member") {
    redirect("/scheduler");
  }

  // Admin / Owner → fetch real stats
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  )
    .toISOString()
    .split("T")[0];
  const lastMonthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 1,
    1
  )
    .toISOString()
    .split("T")[0];

  const [
    patientsRes,
    doctorsRes,
    todayApptsRes,
    thisMonthRes,
    lastMonthRes,
    todayListRes,
  ] = await Promise.all([
    // Total patients
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true }),
    // Active doctors
    supabase
      .from("doctors")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    // Today's appointment count
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("appointment_date", today),
    // This month's appointment count
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", monthStart),
    // Last month's appointment count
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", lastMonthStart)
      .lt("appointment_date", monthStart),
    // Today's appointments with relations (for the list)
    supabase
      .from("appointments")
      .select(
        "id, patient_name, start_time, end_time, status, doctors(full_name, color), offices(name), services(name)"
      )
      .eq("appointment_date", today)
      .order("start_time", { ascending: true })
      .limit(20),
  ]);

  const totalPatients = patientsRes.count ?? 0;
  const activeDoctors = doctorsRes.count ?? 0;
  const todayAppts = todayApptsRes.count ?? 0;
  const thisMonthAppts = thisMonthRes.count ?? 0;
  const lastMonthAppts = lastMonthRes.count ?? 0;

  // Calculate growth percentage
  const growth =
    lastMonthAppts > 0
      ? Math.round(((thisMonthAppts - lastMonthAppts) / lastMonthAppts) * 100)
      : thisMonthAppts > 0
        ? 100
        : 0;

  return (
    <AdminDashboard
      userName={user.user_metadata?.full_name || user.email || ""}
      stats={{
        totalPatients,
        activeDoctors,
        todayAppts,
        thisMonthAppts,
        growth,
      }}
      todayAppointments={(todayListRes.data ?? []) as any}
    />
  );
}
