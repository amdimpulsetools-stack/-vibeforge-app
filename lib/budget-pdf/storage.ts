/**
 * Storage helpers for the `budget-pdfs` bucket (mig 141).
 *
 * Path convention: `${orgId}/${budgetId}.pdf`. The first folder is the
 * org_id so the RLS path-based policy can scope reads/writes by org.
 *
 * Callers SHOULD pass an admin client (service-role) for upload/delete
 * because:
 *   - The cron uses a service-role client by definition.
 *   - The API routes load org membership separately and we want a
 *     deterministic upload (no per-request RLS variance).
 *
 * The signed-URL helper accepts a regular (user-session) client because
 * Supabase signs against whatever client you pass in; using the user
 * session keeps signed URLs auditable per-user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const BUDGET_PDFS_BUCKET = "budget-pdfs";

/**
 * Builds the canonical storage path for a budget's PDF.
 * Exposed so callers can use it as the local source-of-truth and
 * tests can construct expected paths without reaching into Supabase.
 */
export function buildBudgetPdfPath(orgId: string, budgetId: string): string {
  return `${orgId}/${budgetId}.pdf`;
}

export async function uploadBudgetPdf(
  supabaseAdmin: SupabaseClient,
  orgId: string,
  budgetId: string,
  pdfBuffer: Buffer,
): Promise<{ path: string; sizeBytes: number }> {
  const path = buildBudgetPdfPath(orgId, budgetId);
  const { error } = await supabaseAdmin.storage
    .from(BUDGET_PDFS_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: true,
    });
  if (error) {
    throw new Error(`uploadBudgetPdf failed: ${error.message}`);
  }
  return { path, sizeBytes: pdfBuffer.byteLength };
}

export async function getBudgetPdfSignedUrl(
  supabaseClient: SupabaseClient,
  storagePath: string,
  expiresIn: number = 3600,
): Promise<string> {
  const { data, error } = await supabaseClient.storage
    .from(BUDGET_PDFS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(
      `getBudgetPdfSignedUrl failed: ${error?.message ?? "no signed URL"}`,
    );
  }
  return data.signedUrl;
}

export async function deleteBudgetPdf(
  supabaseAdmin: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(BUDGET_PDFS_BUCKET)
    .remove([storagePath]);
  if (error) {
    throw new Error(`deleteBudgetPdf failed: ${error.message}`);
  }
}
