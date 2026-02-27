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
      const data = planRes.data as { plan: PlanInfo; subscription: SubscriptionInfo };
      setPlan(data.plan);
      setSubscription(data.subscription);
    } else {
      setPlan(null);
      setSubscription(null);
    }

    if (usageRes.data) {
      setUsage(usageRes.data as OrgUsage);
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
    return (plan[key] as number | null) ?? null;
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
