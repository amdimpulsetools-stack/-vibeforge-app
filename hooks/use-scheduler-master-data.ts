"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Office, Doctor, Service, LookupValue, DoctorSchedule } from "@/types/admin";

interface SchedulerMasterData {
  offices: Office[];
  doctors: Doctor[];
  services: Service[];
  doctorServices: { doctor_id: string; service_id: string }[];
  doctorSchedules: Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time">[];
  lookupOrigins: LookupValue[];
  lookupPayments: LookupValue[];
  lookupResponsibles: { id: string; user_id?: string; label: string }[];
}

async function fetchMasterData(organizationId: string): Promise<SchedulerMasterData> {
  const supabase = createClient();
  const [
    officesRes,
    doctorsRes,
    servicesRes,
    doctorServicesRes,
    doctorSchedulesRes,
    originsRes,
    paymentsRes,
    receptionistMembersRes,
  ] = await Promise.all([
    supabase.from("offices").select("*").eq("is_active", true).order("display_order"),
    supabase.from("doctors").select("*").eq("is_active", true).order("full_name"),
    supabase.from("services").select("*").eq("is_active", true).order("name"),
    supabase.from("doctor_services").select("doctor_id, service_id"),
    supabase.from("doctor_schedules").select("doctor_id, day_of_week, start_time, end_time"),
    supabase
      .from("lookup_values")
      .select("*, lookup_categories!inner(slug)")
      .eq("lookup_categories.slug", "origin")
      .eq("is_active", true)
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .order("display_order"),
    supabase
      .from("lookup_values")
      .select("*, lookup_categories!inner(slug)")
      .eq("lookup_categories.slug", "payment_method")
      .eq("is_active", true)
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .order("display_order"),
    // Responsibles loaded via API (bypasses RLS issues with user_profiles)
    fetch("/api/members/responsibles").then((r) => r.json()).catch(() => []),
  ]);

  const lookupResponsibles = (receptionistMembersRes as { id: string; user_id?: string; label: string }[]) ?? [];

  return {
    offices: (officesRes.data as Office[]) ?? [],
    doctors: (doctorsRes.data as Doctor[]) ?? [],
    services: (servicesRes.data as Service[]) ?? [],
    doctorServices: (doctorServicesRes.data as { doctor_id: string; service_id: string }[]) ?? [],
    doctorSchedules: (doctorSchedulesRes.data as Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time">[]) ?? [],
    lookupOrigins: (originsRes.data as LookupValue[]) ?? [],
    lookupPayments: (paymentsRes.data as LookupValue[]) ?? [],
    lookupResponsibles,
  };
}

export function useSchedulerMasterData(organizationId: string | null) {
  return useQuery({
    queryKey: ["scheduler-master-data", organizationId],
    queryFn: () => fetchMasterData(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 min — doctors/services/offices rarely change
  });
}
