import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Registro de ejecuciones de crons (tabla cron_runs, mig 204) — la fuente
 * del widget de frescura del Panel CEO/Health. Best-effort a propósito:
 * un fallo del log NUNCA debe tumbar el cron.
 *
 * Uso (con el admin client del propio cron):
 *   const runId = await startCronRun(admin, "billing-status");
 *   ... trabajo ...
 *   await finishCronRun(admin, runId, true, { trials_expired: 2 });
 */
export async function startCronRun(
  admin: SupabaseClient,
  cronName: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("cron_runs")
      .insert({ cron_name: cronName })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function finishCronRun(
  admin: SupabaseClient,
  runId: string | null,
  ok: boolean,
  summary: Record<string, unknown> | null = null,
): Promise<void> {
  if (!runId) return;
  try {
    await admin
      .from("cron_runs")
      .update({ finished_at: new Date().toISOString(), ok, summary })
      .eq("id", runId);
  } catch {
    // best-effort
  }
}
