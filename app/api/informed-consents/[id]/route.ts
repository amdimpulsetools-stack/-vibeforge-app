import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import type { InformedConsentRecord } from "@/types/informed-consent";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data, error } = await supabase
    .from("informed_consents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const row = data as InformedConsentRecord;
  logClinicalAccess({
    organizationId: row.organization_id,
    userId: user.id,
    resourceType: "attachment",
    action: "view",
    patientId: row.patient_id,
    resourceId: row.id,
    metadata: { kind: "informed_consent" },
  });

  return NextResponse.json({ data: row });
}

// Intentionally NO DELETE handler. Informed consents are append-only.
// Voiding is a planned tier-2 feature (voided_at + voided_reason).
