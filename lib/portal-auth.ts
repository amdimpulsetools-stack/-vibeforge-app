import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const COOKIE_NAME = "vf_portal_session";
const SESSION_DURATION_DAYS = 30;

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// SHA-256 hex of the raw token. Used for magic-link tokens so the DB row
// alone cannot be used to impersonate a patient if leaked. The raw token
// still travels by email + URL, which is standard for magic-link flows.
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createPortalSession(
  organizationId: string,
  email: string,
  patientId: string | null
) {
  const supabase = createAdminClient();
  const sessionToken = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await supabase.from("patient_portal_sessions").insert({
    organization_id: organizationId,
    patient_id: patientId,
    email,
    session_token: sessionToken,
    expires_at: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });

  return sessionToken;
}

export async function getPortalSession(slug?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const supabase = createAdminClient();

  let query = supabase
    .from("patient_portal_sessions")
    .select("id, organization_id, patient_id, email, expires_at")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  const { data: session } = await query;
  if (!session) return null;

  if (slug) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .eq("id", session.organization_id)
      .single();

    if (!org) return null;
  }

  supabase
    .from("patient_portal_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id)
    .then(() => {});

  return session;
}

export async function destroyPortalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return;

  const supabase = createAdminClient();
  await supabase
    .from("patient_portal_sessions")
    .delete()
    .eq("session_token", token);

  cookieStore.delete(COOKIE_NAME);
}

export async function linkPatientToSession(
  sessionId: string,
  patientId: string
) {
  const supabase = createAdminClient();
  await supabase
    .from("patient_portal_sessions")
    .update({ patient_id: patientId })
    .eq("id", sessionId);
}
