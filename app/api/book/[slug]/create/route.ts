import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { buildEmailHtml } from "@/lib/email-template";
import nodemailer from "nodemailer";
import { z } from "zod";

export const runtime = "nodejs";

const bookingCreateLimiter = rateLimit({ max: 5, windowMs: 60 * 1000 });

const bookingSchema = z.object({
  patient_first_name: z.string().min(2).max(100),
  patient_last_name: z.string().min(2).max(100),
  patient_phone: z.string().max(20).optional().or(z.literal("")),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_dni: z.string().max(20).optional().or(z.literal("")),
  doctor_id: z.string().uuid(),
  service_id: z.string().uuid(),
  office_id: z.string().uuid(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional().or(z.literal("")),
});

/**
 * POST /api/book/[slug]/create
 *
 * Public endpoint — creates an appointment from the booking page.
 * No authentication required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = bookingCreateLimiter(`book-create:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en unos minutos." },
      { status: 429 }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const supabase = createAdminClient();

  // 1. Fetch organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!org) {
    return NextResponse.json(
      { error: "Organización no encontrada" },
      { status: 404 }
    );
  }

  // 2. Verify booking is enabled
  const { data: bookingSettings } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_enabled", true)
    .single();

  if (!bookingSettings) {
    return NextResponse.json(
      { error: "Reserva en línea no habilitada" },
      { status: 403 }
    );
  }

  // 3. Validate appointment date is within allowed range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appointmentDate = new Date(data.appointment_date + "T12:00:00");

  if (appointmentDate < today) {
    return NextResponse.json(
      { error: "No se puede reservar en una fecha pasada" },
      { status: 400 }
    );
  }

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + bookingSettings.max_advance_days);
  if (appointmentDate > maxDate) {
    return NextResponse.json(
      { error: `Solo puedes reservar hasta ${bookingSettings.max_advance_days} días de anticipación` },
      { status: 400 }
    );
  }

  // 4. Validate minimum lead time
  const appointmentDateTime = new Date(
    `${data.appointment_date}T${data.start_time}:00`
  );
  const hoursUntilAppointment =
    (appointmentDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilAppointment < bookingSettings.min_lead_hours) {
    return NextResponse.json(
      {
        error: `Debes reservar con al menos ${bookingSettings.min_lead_hours} horas de anticipación`,
      },
      { status: 400 }
    );
  }

  // 5. Validate required fields based on settings
  if (bookingSettings.require_email && !data.patient_email) {
    return NextResponse.json(
      { error: "El email es obligatorio" },
      { status: 400 }
    );
  }
  if (bookingSettings.require_phone && !data.patient_phone) {
    return NextResponse.json(
      { error: "El teléfono es obligatorio" },
      { status: 400 }
    );
  }
  if (bookingSettings.require_dni && !data.patient_dni) {
    return NextResponse.json(
      { error: "El documento de identidad es obligatorio" },
      { status: 400 }
    );
  }

  // 6. Verify doctor exists and is active
  const { data: doctor } = await supabase
    .from("doctors")
    .select("id, full_name")
    .eq("id", data.doctor_id)
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .single();

  if (!doctor) {
    return NextResponse.json(
      { error: "Doctor no disponible" },
      { status: 400 }
    );
  }

  // 7. Verify service exists
  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_minutes, base_price")
    .eq("id", data.service_id)
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .single();

  if (!service) {
    return NextResponse.json(
      { error: "Servicio no disponible" },
      { status: 400 }
    );
  }

  // 8. Calculate end time
  const [h, m] = data.start_time.split(":").map(Number);
  const totalMinutes = h * 60 + m + service.duration_minutes;
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

  // 9. Check doctor schedule for the day
  const appointmentDow = new Date(data.appointment_date + "T12:00:00").getDay();
  const { data: doctorSchedule } = await supabase
    .from("doctor_schedules")
    .select("start_time, end_time")
    .eq("doctor_id", data.doctor_id)
    .eq("day_of_week", appointmentDow)
    .single();

  if (!doctorSchedule) {
    return NextResponse.json(
      { error: "El doctor no atiende en este día" },
      { status: 400 }
    );
  }

  // 10. Check for conflicts
  const { data: conflicts } = await supabase
    .from("appointments")
    .select("id")
    .eq("organization_id", org.id)
    .eq("appointment_date", data.appointment_date)
    .in("status", ["scheduled", "confirmed"])
    .or(
      `and(doctor_id.eq.${data.doctor_id},start_time.lt.${endTime},end_time.gt.${data.start_time}),and(office_id.eq.${data.office_id},start_time.lt.${endTime},end_time.gt.${data.start_time})`
    )
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "Este horario ya no está disponible. Intenta con otro horario." },
      { status: 409 }
    );
  }

  // 11. Find or create patient
  let patientId: string | null = null;
  const fullName = `${data.patient_first_name.trim()} ${data.patient_last_name.trim()}`.trim();

  if (data.patient_dni) {
    // Search by DNI
    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id")
      .eq("organization_id", org.id)
      .eq("dni", data.patient_dni.trim())
      .single();

    if (existingPatient) {
      patientId = existingPatient.id;
    }
  }

  if (!patientId) {
    // Create new patient
    const { data: newPatient } = await supabase
      .from("patients")
      .insert({
        first_name: data.patient_first_name.trim(),
        last_name: data.patient_last_name.trim(),
        phone: data.patient_phone || null,
        email: data.patient_email || null,
        dni: data.patient_dni || null,
        origin: "Reserva en línea",
        organization_id: org.id,
      })
      .select("id")
      .single();

    if (newPatient) {
      patientId = newPatient.id;
    }
  }

  // 12. Create appointment
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .insert({
      patient_name: fullName,
      patient_phone: data.patient_phone || null,
      patient_id: patientId,
      doctor_id: data.doctor_id,
      office_id: data.office_id,
      service_id: data.service_id,
      appointment_date: data.appointment_date,
      start_time: data.start_time,
      end_time: endTime,
      status: "scheduled",
      origin: "Reserva en línea",
      notes: data.notes || null,
      price_snapshot: Number(service.base_price),
      organization_id: org.id,
    })
    .select("id")
    .single();

  if (apptError) {
    console.error("[Public Booking] Error creating appointment:", apptError);
    return NextResponse.json(
      { error: "Error al crear la cita" },
      { status: 500 }
    );
  }

  // 13. Send confirmation email (fire-and-forget)
  if (data.patient_email) {
    sendBookingConfirmationEmail(
      supabase,
      org.id,
      org.name,
      appointment.id,
      data.patient_email,
      fullName,
      doctor.full_name,
      service.name,
      data.appointment_date,
      data.start_time
    ).catch((err) =>
      console.error("[Public Booking] Email error:", err)
    );
  }

  return NextResponse.json({
    success: true,
    appointment_id: appointment.id,
    message: "Cita reservada exitosamente",
  });
}

/**
 * Sends a booking confirmation email to the patient.
 */
async function sendBookingConfirmationEmail(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  orgName: string,
  appointmentId: string,
  patientEmail: string,
  patientName: string,
  doctorName: string,
  serviceName: string,
  date: string,
  time: string
) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) return;

  // Fetch email template
  const { data: template } = await supabase
    .from("email_templates")
    .select("*")
    .eq("organization_id", orgId)
    .eq("slug", "appointment_confirmation")
    .eq("is_enabled", true)
    .single();

  if (!template) return;

  // Fetch email settings
  const { data: emailSettings } = await supabase
    .from("email_settings")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  // Fetch clinic phone
  const { data: clinicPhoneVar } = await supabase
    .from("global_variables")
    .select("current_value")
    .eq("organization_id", orgId)
    .eq("key", "clinic_phone")
    .single();

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString(
    "es-PE",
    { weekday: "long", day: "2-digit", month: "long", year: "numeric" }
  );

  const variables: Record<string, string> = {
    "{{paciente_nombre}}": patientName,
    "{{doctor_nombre}}": doctorName,
    "{{fecha_cita}}": formattedDate,
    "{{hora_cita}}": time,
    "{{servicio}}": serviceName,
    "{{clinica_nombre}}": orgName,
    "{{clinica_telefono}}": clinicPhoneVar?.current_value || "",
    "{{consultorio}}": "",
    "{{link_cancelar}}": "",
    "{{link_reagendar}}": "",
    "{{link_reunion}}": "",
  };

  let subject = template.subject;
  let emailBody = template.body;

  for (const [key, value] of Object.entries(variables)) {
    subject = subject.replaceAll(key, value);
    emailBody = emailBody.replaceAll(key, value);
  }

  const brandColor = emailSettings?.brand_color || "#10b981";
  const logoUrl = emailSettings?.email_logo_url || null;
  const clinicName = orgName || emailSettings?.sender_name || "VibeForge";

  const html = buildEmailHtml({
    body: emailBody,
    brandColor,
    logoUrl,
    clinicName,
  });

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  const fromAddress = process.env.SMTP_FROM || smtpUser;
  const fromName = emailSettings?.sender_name || clinicName;
  const replyTo = emailSettings?.reply_to_email || undefined;

  await transporter.sendMail({
    from: `${fromName} <${fromAddress}>`,
    replyTo,
    to: patientEmail,
    subject,
    html,
  });

  transporter.close();
}
