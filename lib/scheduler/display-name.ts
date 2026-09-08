import "server-only";
import type { createClient } from "@/lib/supabase/server";

/**
 * Nombre visible de un usuario para estampar en snapshots (`created_by_name`,
 * `removed_by_name`, `edited_by_name`): perfil → metadata de auth → email.
 */
export async function resolveDisplayName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const fromProfile = (profile as { full_name?: string | null } | null)?.full_name?.trim();
  if (fromProfile) return fromProfile;
  return (
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    null
  );
}
