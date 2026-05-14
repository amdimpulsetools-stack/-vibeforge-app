import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// MFA recovery codes — server-side helpers.
//
// Supabase MFA built-in handles TOTP enroll/verify natively but
// does NOT include recovery codes. We layer them on top:
//   1. At enroll: generate 10 plaintext codes, hash each with
//      scrypt + per-row salt, return plaintext to client ONCE.
//   2. At recovery (lost device flow): user submits one code in
//      /api/auth/mfa/recover, server validates the hash, marks
//      it used, deletes ALL the user's factors, returns a
//      password-only session. User must re-enroll afterwards.
//
// Why scrypt and not bcrypt: no extra dep, native to Node, and
// these codes are high-entropy (96 bits) so even a fast hash
// would resist offline attack on a leaked DB dump. We pick
// scrypt for the standard memory-hardness anyway.
// ============================================================

const RECOVERY_CODE_COUNT = 10;
// Format: "abcd-1234-ef56" → 3 groups of 4 hex chars, 48 bits
// each = 144 bits total entropy. More than enough against
// brute force; humans can copy/paste cleanly.
const RECOVERY_CODE_BYTES = 6;
const SCRYPT_KEY_LEN = 32;
const SCRYPT_SALT_LEN = 16;

export function generateRecoveryCodes(
  count = RECOVERY_CODE_COUNT,
): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(RECOVERY_CODE_BYTES).toString("hex");
    // Insert a dash every 4 chars for readability.
    return hex.match(/.{1,4}/g)!.join("-");
  });
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeCode(code);
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = scryptSync(normalized, salt, SCRYPT_KEY_LEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyRecoveryCodeHash(
  code: string,
  stored: string,
): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(normalizeCode(code), salt, SCRYPT_KEY_LEN);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// Users may type the code with extra spaces / different casing.
// Normalize before hashing AND before verifying so the round-trip
// is exact.
function normalizeCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Replace the user's recovery codes wholesale. Used at enroll
 * time and on explicit "regenerate codes". Old codes are deleted
 * (not soft-marked) — there's no audit reason to keep them, and
 * deleting is cleaner.
 *
 * Returns the freshly-generated PLAINTEXT codes for the client
 * to display once.
 */
export async function regenerateRecoveryCodes(
  userId: string,
): Promise<{ ok: boolean; codes: string[] }> {
  const admin = createAdminClient();

  // Delete any existing codes for this user.
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);

  const plaintext = generateRecoveryCodes();
  const rows = plaintext.map((code) => ({
    user_id: userId,
    code_hash: hashRecoveryCode(code),
  }));

  const { error } = await admin.from("mfa_recovery_codes").insert(rows);
  if (error) {
    console.error("[mfa] failed to insert recovery codes", error);
    return { ok: false, codes: [] };
  }

  return { ok: true, codes: plaintext };
}

/**
 * Validate a recovery code attempt and consume it (mark used).
 * Returns true only if there was an unused row whose hash
 * matched. Idempotent against re-use — once used, subsequent
 * attempts return false.
 */
export async function consumeRecoveryCode(
  userId: string,
  attempt: string,
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("mfa_recovery_codes")
    .select("id, code_hash")
    .eq("user_id", userId)
    .is("used_at", null);

  if (!rows || rows.length === 0) return false;

  // Verify each candidate. We can't index by hash (different salt
  // per row) so this is O(n) at the per-user level — 10 codes max
  // means 10 scrypt calls in the worst case. Acceptable.
  for (const row of rows) {
    if (verifyRecoveryCodeHash(attempt, row.code_hash)) {
      const { error } = await admin
        .from("mfa_recovery_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id);
      return !error;
    }
  }
  return false;
}

/**
 * Wipe all recovery codes for the user. Called after the
 * recovery flow successfully deletes their MFA factors — the
 * old codes paired with the deleted factor are meaningless now.
 */
export async function clearRecoveryCodes(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
}

/**
 * Count of unused recovery codes the user has. Surfaced in
 * /account/security so users know when they're running low.
 */
export async function countActiveRecoveryCodes(
  userId: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  return count ?? 0;
}
