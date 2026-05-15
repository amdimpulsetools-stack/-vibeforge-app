import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Clinical access audit log helper.
//
// Compliance: NTS 139 (telesalud) + Ley 29733 (Protección de
// Datos Personales). Every read/write/export of sensitive
// medical data goes through this helper.
//
// Design principles:
//   1. NEVER throw. The audit log failing must not break the
//      request that triggered it. We swallow errors and log
//      to console for visibility.
//   2. NEVER block. Inserts run inside `after()` so the
//      response is sent first and the DB write happens in the
//      tail of the lambda execution.
//   3. Service-role only. RLS on clinical_access_log blocks
//      INSERTs from any other client, which prevents a leaked
//      JWT from forging audit entries.
// ============================================================

export type ClinicalResourceType =
  | "patient"
  | "clinical_note"
  | "prescription"
  | "attachment"
  | "lab_result"
  | "treatment_plan"
  | "medical_history"
  | "appointment"
  | "ai_query"
  | "other";

export type ClinicalAction =
  | "view"
  | "list"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "print"
  | "download";

export interface LogClinicalAccessArgs {
  organizationId: string;
  userId: string;
  resourceType: ClinicalResourceType;
  action: ClinicalAction;
  // Patient whose data was accessed. Null for org-wide actions
  // (eg. listing all patients on the search screen).
  patientId?: string | null;
  // Specific row id of the resource within the patient.
  // Null for list/collection actions.
  resourceId?: string | null;
  // Free-form context — filename for downloads, query for
  // searches, batch count for batch creates. Keep it small.
  metadata?: Record<string, unknown>;
}

/**
 * Records a single clinical-data access event. Runs in the
 * background via `after()` — the request that called this
 * function returns to the user immediately.
 *
 * Call this from API route handlers AFTER the access-control
 * check has passed and BEFORE you return the response. The
 * placement matters: we want to log SUCCESSFUL accesses (the
 * compliance question is "who saw this data?", not "who
 * attempted to see it?"). Failed attempts are noise.
 *
 * Throws never. Failures are logged to console.error so they
 * still show up in Vercel logs for investigation.
 */
export function logClinicalAccess(args: LogClinicalAccessArgs): void {
  after(async () => {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      // headers() is async since Next 15. Inside after() the
      // request context is still alive so this works. If we
      // were called from outside a request (eg. a cron job),
      // the call throws and we just leave ip/userAgent null.
      const h = await headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        null;
      userAgent = h.get("user-agent") || null;
    } catch {
      // No request context — leave forensic fields null.
    }

    try {
      const admin = createAdminClient();
      const { error } = await admin.from("clinical_access_log").insert({
        organization_id: args.organizationId,
        user_id: args.userId,
        patient_id: args.patientId ?? null,
        resource_id: args.resourceId ?? null,
        resource_type: args.resourceType,
        action: args.action,
        ip_address: ip,
        user_agent: userAgent,
        metadata: args.metadata ?? {},
      });
      if (error) {
        console.error("[audit] insert failed", error.message, {
          resource: args.resourceType,
          action: args.action,
        });
      }
    } catch (err) {
      console.error("[audit] unexpected error", err);
    }
  });
}

/**
 * Convenience wrapper for routes that process many rows in
 * one request (eg. batch prescription create). Logs ONE row
 * with `metadata.batch_count` instead of N rows — keeps the
 * audit table from exploding under high write rates while
 * still recording the access.
 */
export function logClinicalBatchAccess(
  args: Omit<LogClinicalAccessArgs, "resourceId"> & { batchCount: number },
): void {
  logClinicalAccess({
    organizationId: args.organizationId,
    userId: args.userId,
    resourceType: args.resourceType,
    action: args.action,
    patientId: args.patientId,
    resourceId: null,
    metadata: { ...(args.metadata ?? {}), batch_count: args.batchCount },
  });
}
