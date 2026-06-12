import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { generateBudgetPdf } from "@/lib/budget-pdf/generate";
import { getBudgetPdfSignedUrl } from "@/lib/budget-pdf/storage";
import {
  PATIENT_PDF_SIGNED_URL_TTL_SECONDS,
  sendBudgetEmailToPatient,
} from "@/lib/budget-pdf/send-email";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

export const runtime = "nodejs"; // generateBudgetPdf needs @react-pdf.

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/[id]/send
//
// Marks a budget as sent: fills `sent_at`, `sent_by_user_id`, and
// the new `sent_via` channel (mig 172). The metric "presupuestos
// enviados" used to count "staff clicked a button"; with channels
// it now counts real outbound contacts:
//
//   via=email     → Yenda sends the PDF link via Resend. The
//                   signed URL is minted with a 7-day TTL so the
//                   patient can reopen it from her inbox.
//   via=whatsapp  → no server-side send; the client receives
//                   `whatsapp_url` (wa.me prefilled message + link)
//                   and opens it in a new tab. Staff fires the
//                   message from the clinic's own WhatsApp.
//   via=other     → status-only stamp; the obstetra handled it by
//                   another medium (printed, in-person, relative).
//
// Constraints:
//   - Caller role: owner | admin | doctor | fertility advisor.
//     Receptionists are blocked.
//   - The budget must still be `acceptance_status = pending_acceptance`
//     AND `sent_at IS NULL`.
//   - For via=email: patient must have an email on file.
// ──────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  via: z.enum(["email", "whatsapp", "other"]),
});

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  is_fertility_advisor: boolean | null;
}

interface BudgetForSend {
  id: string;
  organization_id: string;
  acceptance_status: string;
  sent_at: string | null;
  patient_id: string;
  treatment_type: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Canal de envío inválido (email|whatsapp|other)" },
      { status: 400 },
    );
  }
  const via = parsed.data.via;

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_fertility_advisor")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const role = membership.role;
  const isAdvisor = Boolean(membership.is_fertility_advisor);
  const allowed =
    role === "owner" || role === "admin" || role === "doctor" || isAdvisor;
  if (!allowed) {
    return NextResponse.json(
      { error: "Sin permisos para enviar presupuestos" },
      { status: 403 },
    );
  }

  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const { data: existing } = await supabase
    .from("budget_records")
    .select("id, organization_id, acceptance_status, sent_at, patient_id, treatment_type")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .limit(1)
    .maybeSingle();
  const budget = (existing as BudgetForSend | null) ?? null;
  if (!budget) {
    return NextResponse.json(
      { error: "Presupuesto no encontrado" },
      { status: 404 },
    );
  }
  if (budget.acceptance_status !== "pending_acceptance") {
    return NextResponse.json(
      { error: "Este presupuesto ya tiene una decisión registrada" },
      { status: 409 },
    );
  }
  if (budget.sent_at !== null && budget.sent_at !== undefined) {
    return NextResponse.json(
      { error: "Este presupuesto ya fue enviado" },
      { status: 409 },
    );
  }

  // For via=email we need the patient's email BEFORE stamping the
  // row — otherwise we'd mark it sent and the email would silently
  // fail. Loaded via admin to bypass any RLS quirks on patients.
  const admin = createAdminClient();
  let patientEmail: string | null = null;
  let patientPhone: string | null = null;
  let patientFirstName: string | null = null;
  if (via === "email" || via === "whatsapp") {
    const { data: patient } = await admin
      .from("patients")
      .select("email, phone, first_name")
      .eq("id", budget.patient_id)
      .maybeSingle();
    patientEmail = (patient?.email as string | null) ?? null;
    patientPhone = (patient?.phone as string | null) ?? null;
    patientFirstName = (patient?.first_name as string | null) ?? null;

    if (via === "email" && !patientEmail) {
      return NextResponse.json(
        {
          error:
            "La paciente no tiene email registrado. Editá su ficha o elegí otro canal.",
        },
        { status: 422 },
      );
    }
    if (via === "whatsapp" && !patientPhone) {
      return NextResponse.json(
        {
          error:
            "La paciente no tiene teléfono registrado. Editá su ficha o elegí otro canal.",
        },
        { status: 422 },
      );
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("budget_records")
    .update({
      sent_at: now,
      sent_by_user_id: user.id,
      sent_via: via,
    })
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "No se pudo actualizar" },
      { status: 500 },
    );
  }

  // Render (or reuse) the PDF — needed para incrustar el link firmado
  // en email y whatsapp. Para via=other (impreso, en persona, familiar)
  // no se necesita: el staff ya entregó por otro medio. Saltearlo evita
  // arrastrar chromium en un caso de uso que no lo pide. Failures non-
  // fatales: el budget IS sent aunque el render falle.
  let signedUrl: string | null = null;
  let storagePath: string | null = null;
  let pdfError: string | null = null;
  if (via === "email" || via === "whatsapp") {
    try {
      const pdfResult = await generateBudgetPdf(supabase, admin, id);
      if (pdfResult.ok) {
        signedUrl = pdfResult.result.signedUrl;
        storagePath = pdfResult.result.storagePath;
      } else {
        pdfError = pdfResult.error;
      }
    } catch (e) {
      pdfError = e instanceof Error ? e.message : "PDF render failed";
    }
  }

  // Channel-specific delivery
  let emailSent = false;
  let emailError: string | null = null;
  let whatsappUrl: string | null = null;

  if (via === "email" && signedUrl && storagePath && patientEmail) {
    // Re-mint a long-lived signed URL for the email (the generator's
    // default URL is short-lived; the patient may open it days later).
    try {
      const longUrl = await getBudgetPdfSignedUrl(
        admin,
        storagePath,
        PATIENT_PDF_SIGNED_URL_TTL_SECONDS,
      );
      // Load org branding for the email header.
      const { data: org } = await admin
        .from("organizations")
        .select("name, legal_name, icon_url, logo_url")
        .eq("id", budget.organization_id)
        .maybeSingle();
      const clinicName =
        ((org?.legal_name as string | null) ??
          (org?.name as string | null) ??
          "Tu clínica") as string;
      const result = await sendBudgetEmailToPatient({
        patientEmail,
        patientGreeting: patientFirstName
          ? `Hola ${patientFirstName}`
          : "Hola",
        clinicName,
        clinicLogoUrl:
          ((org?.icon_url as string | null) ??
            (org?.logo_url as string | null)) ||
          null,
        treatmentLabel: budget.treatment_type,
        pdfSignedUrl: longUrl,
        vigencyDays: 90,
      });
      if (result.ok) {
        emailSent = true;
      } else {
        emailError = result.error ?? (result.skipped ? "email_not_configured" : "send_failed");
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : "email_send_failed";
    }
  }

  if (via === "whatsapp" && signedUrl && patientPhone) {
    // Build a wa.me link the client opens. The message is pre-filled;
    // staff edits/sends from their own WhatsApp so the conversation
    // history lives with the clinic, not with us.
    const cleanPhone = patientPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
    const greeting = patientFirstName ? `Hola ${patientFirstName}` : "Hola";
    const text = `${greeting}, te compartimos tu presupuesto del tratamiento ${budget.treatment_type}:\n\n${signedUrl}\n\nCualquier consulta estamos para ayudarte.`;
    whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  return NextResponse.json({
    data: updated,
    pdf_signed_url: signedUrl,
    pdf_error: pdfError,
    email_sent: emailSent,
    email_error: emailError,
    whatsapp_url: whatsappUrl,
  });
}
