import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { TERMS_VERSION } from "@/lib/constants";

const bodySchema = z.object({
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar los Términos y la Política de Privacidad" }),
  }),
  // Optional override; defaults to the server's current TERMS_VERSION so
  // a stale client cannot record acceptance for an arbitrary version.
  termsVersion: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const version = parsed.data.termsVersion || TERMS_VERSION;
  const acceptedAt = new Date().toISOString();

  const { error } = await supabase
    .from("user_profiles")
    .update({
      accepted_terms_at: acceptedAt,
      accepted_terms_version: version,
      accepted_privacy_at: acceptedAt,
      accepted_privacy_version: version,
    })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to record terms acceptance:", error.message);
    return NextResponse.json({ error: "Failed to save acceptance" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
