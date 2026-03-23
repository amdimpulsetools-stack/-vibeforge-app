"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";

export interface PlanInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
  max_members: number | null;
  max_doctors: number | null;
  max_offices: number | null;
  max_patients: number | null;
  max_appointments_per_month: number | null;
  max_storage_mb: number | null;
  max_admins: number | null;
  max_receptionists: number | null;
  max_doctor_members: number | null;
  addon_price_per_office: number | null;
  addon_price_per_member: number | null;
  target_audience: string | null;
  feature_reports: boolean;
  feature_export: boolean;
  feature_custom_roles: boolean;
  feature_api_access: boolean;
  feature_priority_support: boolean;
  feature_ai_assistant: boolean;
  max_ai_queries: number | null;
}

export interface SubscriptionInfo {
  id: string;
  status: "active" | "trialing" | "past_due" | "cancelled" | "expired";
  started_at: string;
  expires_at: string | null;
  trial_ends_at: string | null;
}

export interface OrgUsage {
  members: number;
  doctors: number;
  offices: number;
  patients: number;
  appointments_this_month: number;
  admins: number;
  receptionists: number;
  doctor_members: number;
  extra_offices: number;
  extra_members: number;
}

interface UsePlanReturn {
  plan: PlanInfo | null;
  subscription: SubscriptionInfo | null;
  usage: OrgUsage | null;
  loading: boolean;
  /** true if org has no active subscription */
  needsPlan: boolean;
  /** Days until trial/subscription expires (null if no expiry) */
  daysRemaining: number | null;
  /** Check if a specific resource is near limit (>= 80%) */
  isNearLimit: (resource: keyof OrgUsage) => boolean;
  /** Check if a specific resource is at limit */
  isAtLimit: (resource: keyof OrgUsage) => boolean;
  /** Get limit for a resource (null = unlimited) */
  getLimit: (resource: keyof OrgUsage) => number | null;
  /** Refetch plan & usage data */
  refetch: () => void;
}

const RESOURCE_TO_PLAN_KEY: Partial<Record<keyof OrgUsage, keyof PlanInfo>> = {
  members: "max_members",
  doctors: "max_doctors",
  offices: "max_offices",
  patients: "max_patients",
  appointments_this_month: "max_appointments_per_month",
  admins: "max_admins",
  receptionists: "max_receptionists",
  doctor_members: "max_doctor_members",
};

export function usePlan(): UsePlanReturn {
  const { organizationId, loading: orgLoading } = useOrganization();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;

    const supabase = createClient();

    const [planRes, usageRes] = await Promise.all([
      supabase.rpc("get_org_plan", { org_id: organizationId }),
      supabase.rpc("get_org_usage", { org_id: organizationId }),
    ]);



    if (planRes.data) {
      // RPC returns flat JSON — map to PlanInfo + SubscriptionInfo
      const d = planRes.data as Record<string, unknown>;
      setPlan({
        id: d.plan_id as string,
        slug: d.plan_slug as string,
        name: d.plan_name as string,
        description: (d.description as string) ?? null,
        price_monthly: d.price_monthly as number,
        max_members: (d.max_members as number) ?? null,
        max_doctors: (d.max_doctors as number) ?? null,
        max_offices: (d.max_offices as number) ?? null,
        max_patients: (d.max_patients as number) ?? null,
        max_appointments_per_month: (d.max_appointments_per_month as number) ?? null,
        max_storage_mb: (d.max_storage_mb as number) ?? null,
        max_admins: (d.max_admins as number) ?? null,
        max_receptionists: (d.max_receptionists as number) ?? null,
        max_doctor_members: (d.max_doctor_members as number) ?? null,
        addon_price_per_office: (d.addon_price_per_office as number) ?? null,
        addon_price_per_member: (d.addon_price_per_member as number) ?? null,
        target_audience: (d.target_audience as string) ?? null,
        feature_reports: !!d.feature_reports,
        feature_export: !!d.feature_export,
        feature_custom_roles: !!d.feature_custom_roles,
        feature_api_access: !!d.feature_api_access,
        feature_priority_support: !!d.feature_priority_support,
        feature_ai_assistant: !!d.feature_ai_assistant,
        max_ai_queries: (d.max_ai_queries as number) ?? null,
      });
      setSubscription({
        id: d.subscription_id as string ?? d.plan_id as string,
        status: d.subscription_status as SubscriptionInfo["status"],
        started_at: d.started_at as string,
        expires_at: (d.expires_at as string) ?? (d.trial_ends_at as string) ?? null,
        trial_ends_at: (d.trial_ends_at as string) ?? null,
      });
    } else {
      setPlan(null);
      setSubscription(null);
    }

    if (usageRes.data) {
      // RPC returns monthly_appointments, map to appointments_this_month
      const u = usageRes.data as Record<string, unknown>;

      // extra_offices / extra_members: prefer direct fields from RPC (migration 063+),
      // fall back to parsing addons array (migration 031 format)
      let extraOffices = (u.extra_offices as number) ?? 0;
      let extraMembers = (u.extra_members as number) ?? 0;
      if (!extraOffices && !extraMembers && Array.isArray(u.addons)) {
        const addons = u.addons as { addon_type: string; quantity: number }[];
        extraOffices = addons
          .filter((a) => a.addon_type === "extra_office")
          .reduce((sum, a) => sum + (a.quantity ?? 0), 0);
        extraMembers = addons
          .filter((a) => a.addon_type === "extra_member")
          .reduce((sum, a) => sum + (a.quantity ?? 0), 0);
      }

      setUsage({
        members: (u.members as number) ?? 0,
        doctors: (u.doctors as number) ?? 0,
        offices: (u.offices as number) ?? 0,
        patients: (u.patients as number) ?? 0,
        appointments_this_month: (u.monthly_appointments as number) ?? (u.appointments_this_month as number) ?? 0,
        admins: (u.admins as number) ?? 0,
        receptionists: (u.receptionists as number) ?? 0,
        doctor_members: (u.doctor_members as number) ?? 0,
        extra_offices: extraOffices,
        extra_members: extraMembers,
      });
    }

    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (orgLoading) return;
    if (!organizationId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [organizationId, orgLoading, fetchData]);

  const needsPlan = !loading && !subscription;

  const daysRemaining = (() => {
    if (!subscription) return null;
    const endDate = subscription.trial_ends_at || subscription.expires_at;
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const getLimit = (resource: keyof OrgUsage): number | null => {
    if (!plan) return null;
    const key = RESOURCE_TO_PLAN_KEY[resource];
    if (!key) return null;
    const base = (plan[key] as number | null) ?? null;
    if (base === null) return null; // unlimited
    // Add purchased addon slots to the effective limit
    if (resource === "offices" && usage) return base + usage.extra_offices;
    if (resource === "members" && usage) return base + usage.extra_members;
    if (resource === "doctors" && usage) return base + usage.extra_members;
    if (resource === "doctor_members" && usage) return base + usage.extra_members;
    return base;
  };

  const isNearLimit = (resource: keyof OrgUsage): boolean => {
    if (!plan || !usage) return false;
    const limit = getLimit(resource);
    if (limit === null) return false; // unlimited
    return usage[resource] >= limit * 0.8;
  };

  const isAtLimit = (resource: keyof OrgUsage): boolean => {
    if (!plan || !usage) return false;
    const limit = getLimit(resource);
    if (limit === null) return false; // unlimited
    return usage[resource] >= limit;
  };

  return {
    plan,
    subscription,
    usage,
    loading,
    needsPlan,
    daysRemaining,
    isNearLimit,
    isAtLimit,
    getLimit,
    refetch: fetchData,
  };
}
