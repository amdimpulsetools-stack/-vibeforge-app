/**
 * Correos del módulo Caja.
 *
 * Misma mecánica que `lib/billing-emails.ts` — plantilla de texto plano,
 * `buildEmailHtml` para el envoltorio con el branding de `email_settings`,
 * `sendEmail` de `lib/resend.ts` para la entrega — y el mismo contrato de
 * error: NUNCA lanza. Un correo que no sale no puede tumbar el cron que lo
 * intentaba.
 *
 * Tres plantillas:
 *   1. daily_exceptions — el parte del día. Solo si hubo algo que contar.
 *   2. weekly_digest    — el resumen del lunes. Llegue cuadre o no.
 *   3. stale_shift      — una caja lleva ≥2 días sin cerrar.
 *
 * ══════════════════════════════════════════════════════════════════════
 * TONO — no es cosmética, es la diferencia entre un informe y una denuncia
 * ══════════════════════════════════════════════════════════════════════
 *
 * El sujeto de la frase es SIEMPRE la caja o el turno, nunca la persona:
 *
 *     ✓ "El turno 08:15–19:40 cerró con S/ 40 menos de lo esperado"
 *     ✗ "Ana tiene un faltante de S/ 40"
 *
 * Faltante y sobrante se redactan IDÉNTICO. Un sobrante también es un
 * descuadre —significa que algo no se registró— y tratarlo como buena
 * noticia mientras el faltante es una alarma enseña al equipo a preferir
 * que sobre, que es justo lo contrario del control que se busca.
 *
 * Verbo neutro: "cerró con diferencia". Nunca "descuadre", nunca "falta
 * dinero", nunca "irregularidad". El correo llega antes de que nadie haya
 * mirado nada; acusar en el asunto es acusar sin haber visto.
 *
 * Y el motivo que escribió la persona VIAJA SIEMPRE con la cifra. Es lo que
 * convierte el correo en un informe: el dueño lee "S/ 40 menos — se pagó un
 * taxi de la muestra y no se anotó" en vez de "S/ 40 menos" a secas y a
 * imaginar el resto.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";

export type CajaEmailKind = "daily_exceptions" | "weekly_digest" | "stale_shift";

export interface CajaEmailContext {
  supabase: SupabaseClient;
  organizationId: string;
  toEmail: string;
  orgName: string;
}

export interface CajaEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yenda.app";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "soporte@yenda.app";
const CAJA_URL = `${APP_URL}/caja`;

/* ────────────────────────────── formato ────────────────────────────── */

export function formatPEN(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `S/ ${Math.abs(n).toFixed(2)}`;
}

/** "-S/ 40.00" / "+S/ 12.00" / "S/ 0.00". */
export function formatSignedPEN(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  if (n === 0) return "S/ 0.00";
  return `${n < 0 ? "-" : "+"}${formatPEN(n)}`;
}

/**
 * "menos" / "más" de lo esperado. Las dos ramas dicen exactamente lo mismo
 * con el mismo número de palabras: ver la nota de tono de la cabecera.
 */
function moreOrLess(difference: number): string {
  return difference < 0 ? "menos" : "más";
}

/* ─────────────────────────── datos de entrada ───────────────────────── */

export interface CajaShiftDifference {
  /** "14/08 08:15–19:40". Se arma en el cron con la hora de Lima. */
  window: string;
  expected: number;
  counted: number;
  difference: number;
  /** Lo que escribió quien cerró. Puede faltar en cierres antiguos. */
  reason: string | null;
}

export interface CajaDailyPayload {
  differences: CajaShiftDifference[];
  /** Turnos que cerró alguien distinto de quien los abrió. */
  forceClosed: { window: string }[];
  /** Turnos que al cierre del día seguían abiertos. */
  stillOpen: { openedLabel: string }[];
  orphanCount: number;
  orphanAmount: number;
}

export interface CajaWeeklyPayload {
  /** "del 4 al 10 de agosto". */
  rangeLabel: string;
  shiftsClosed: number;
  /** Turnos cerrados con diferencia exactamente 0. */
  shiftsExact: number;
  expectedTotal: number;
  countedTotal: number;
  differenceTotal: number;
  orphanCount: number;
  forceClosedCount: number;
}

export interface CajaStalePayload {
  days: number;
  /** "el 13/08 a las 08:15". */
  openedLabel: string;
}

/* ──────────────────────────── plantillas ────────────────────────────── */

/**
 * El párrafo que acompaña SIEMPRE al primer descuadre del correo.
 *
 * Existe porque el correo llega a alguien que acaba de leer que falta
 * dinero en su clínica y todavía no ha hablado con nadie. Sin esta línea,
 * la reacción por defecto es la sospecha; con ella, la reacción por defecto
 * es preguntar. La segunda frase es la que de verdad hace el trabajo: pone
 * la urgencia en la MEMORIA, no en la culpa.
 */
const DIFFERENCE_DISCLAIMER = `Una diferencia, por sí sola, no significa que falte dinero. Casi siempre es un cobro que entró sin registrarse, un vuelto mal dado o una salida de efectivo que nadie anotó. Lo que sí conviene es revisarla hoy, mientras quien estuvo en el mostrador todavía recuerda el día.`;

function renderDaily(
  orgName: string,
  p: CajaDailyPayload,
): { subject: string; body: string } {
  const blocks: string[] = [];
  let items = 0;

  if (p.differences.length > 0) {
    items += p.differences.length;
    const lines: string[] = [
      p.differences.length === 1
        ? "UN TURNO CERRÓ CON DIFERENCIA"
        : `${p.differences.length} TURNOS CERRARON CON DIFERENCIA`,
      "",
    ];

    p.differences.forEach((d, i) => {
      lines.push(
        `• Turno ${d.window}`,
        `  Esperado ${formatPEN(d.expected)} · contado ${formatPEN(d.counted)}`,
        `  Diferencia ${formatSignedPEN(d.difference)} — ${formatPEN(
          d.difference,
        )} ${moreOrLess(d.difference)} de lo esperado`,
        `  Motivo que se escribió al cerrar: ${
          d.reason?.trim() || "(no se registró ninguno)"
        }`,
      );
      // El párrafo va tras el PRIMER descuadre, no al final: quien lee de
      // arriba abajo lo encuentra antes de haber sacado conclusiones.
      if (i === 0) lines.push("", DIFFERENCE_DISCLAIMER);
      lines.push("");
    });

    blocks.push(lines.join("\n").trimEnd());
  }

  if (p.forceClosed.length > 0) {
    items += p.forceClosed.length;
    blocks.push(
      [
        p.forceClosed.length === 1
          ? "UNA CAJA LA CERRÓ UNA PERSONA DISTINTA DE QUIEN LA ABRIÓ"
          : "CAJAS QUE CERRÓ UNA PERSONA DISTINTA DE QUIEN LAS ABRIÓ",
        "",
        ...p.forceClosed.map((f) => `• Turno ${f.window}`),
        "",
        "Es normal cuando alguien termina su jornada sin cerrar y un administrador cuenta el cajón por esa persona. Queda registrado para que el arqueo tenga siempre un responsable identificable.",
      ].join("\n"),
    );
  }

  if (p.stillOpen.length > 0) {
    items += p.stillOpen.length;
    blocks.push(
      [
        p.stillOpen.length === 1
          ? "UNA CAJA SIGUE ABIERTA"
          : `${p.stillOpen.length} CAJAS SIGUEN ABIERTAS`,
        "",
        ...p.stillOpen.map((s) => `• Abierta ${s.openedLabel}`),
        "",
        "Mientras el turno siga abierto, cada cobro nuevo se suma a él. El conteo de hoy solo se puede reconstruir si se cierra hoy.",
      ].join("\n"),
    );
  }

  if (p.orphanCount > 0) {
    items += p.orphanCount;
    blocks.push(
      [
        p.orphanCount === 1
          ? "UN COBRO ENTRÓ FUERA DE TURNO"
          : `${p.orphanCount} COBROS ENTRARON FUERA DE TURNO`,
        "",
        `Suman ${formatPEN(
          p.orphanAmount,
        )}. Son cobros que se registraron sin ninguna caja abierta: el dinero está en el sistema, pero no pertenece a ningún arqueo. Se atribuyen a un turno desde Caja › Fuera de turno.`,
        "",
        "Casi siempre significa que ese día se empezó a cobrar antes de abrir la caja.",
      ].join("\n"),
    );
  }

  const subject = `Caja de hoy — ${items} ${
    items === 1 ? "cosa para revisar" : "cosas para revisar"
  }`;

  const body = [
    `Hola ${orgName},`,
    "",
    "Esto es lo que quedó pendiente de mirar en la caja de hoy.",
    "",
    blocks.join("\n\n———\n\n"),
    "",
    "———",
    "",
    `Revisa el detalle turno por turno aquí: ${CAJA_URL}`,
    "",
    "Los días que todo cuadra no recibes este correo.",
    "",
    "— Equipo Yenda",
  ].join("\n");

  return { subject, body };
}

function renderWeekly(
  orgName: string,
  p: CajaWeeklyPayload,
): { subject: string; body: string } {
  const bullets = [
    `• Turnos cerrados: ${p.shiftsClosed}`,
    `• Esperado: ${formatPEN(p.expectedTotal)}`,
    `• Contado: ${formatPEN(p.countedTotal)}`,
    `• Diferencia acumulada: ${formatSignedPEN(p.differenceTotal)}`,
    `• Cobros fuera de turno: ${p.orphanCount}`,
    `• Cierres por alguien distinto de quien abrió: ${p.forceClosedCount}`,
  ];

  // La semana limpia se celebra explícitamente y con nombre y apellido de
  // quién lo hizo. Un sistema que solo escribe cuando algo va mal acaba
  // siendo, para quien está en el mostrador, un sistema que la vigila.
  const cleanWeek =
    p.shiftsClosed > 0 &&
    p.shiftsExact === p.shiftsClosed &&
    p.orphanCount === 0;

  const closing = cleanWeek
    ? [
        "",
        `${p.shiftsClosed} de ${p.shiftsClosed} turnos cuadraron al centavo. Eso no pasa solo: es que tu equipo está contando bien.`,
      ]
    : [];

  return {
    subject: `Resumen de caja — semana ${p.rangeLabel}`,
    body: [
      `Hola ${orgName},`,
      "",
      `Así cerró la caja la semana ${p.rangeLabel}:`,
      "",
      ...bullets,
      ...closing,
      "",
      `El detalle turno por turno está en ${CAJA_URL}`,
      "",
      "— Equipo Yenda",
    ].join("\n"),
  };
}

function renderStale(
  orgName: string,
  p: CajaStalePayload,
): { subject: string; body: string } {
  return {
    subject: `Una caja de ${orgName} lleva ${p.days} ${
      p.days === 1 ? "día" : "días"
    } sin cerrar`,
    body: [
      `Hola ${orgName},`,
      "",
      `Hay un turno de caja abierto desde ${p.openedLabel} — ${p.days} ${
        p.days === 1 ? "día" : "días"
      } sin cerrar.`,
      "",
      "Lo que esto significa en la práctica: mientras el turno siga abierto, cada cobro nuevo se suma a ÉL. No es que el dinero se pierda —los cobros están todos registrados—, es que el arqueo deja de poder responder la pregunta que existe para responder: cuánto efectivo hubo que contar al final de cada día. Cerrado a los tres días, el conteo cubre tres días juntos y ya no se puede repartir entre ellos.",
      "",
      "Para cerrarlo:",
      "",
      "1. Entra a Caja y cuenta el efectivo que hay hoy en el cajón, fondo incluido.",
      "2. Escribe esa cifra en Cerrar caja. La diferencia se calcula sola.",
      "3. Si sale diferencia, escribe en una línea lo que recuerdes de esos días. Un motivo aproximado vale mucho más que ninguno.",
      "",
      `Cerrar caja: ${CAJA_URL}`,
      "",
      "Si esto pasa seguido, casi siempre es que la configuración no encaja con cómo trabaja la clínica: si el cajón es uno solo y lo comparten varias personas, la caja debería ser una por clínica y no una por persona. Se cambia en Caja › Ajustes, o escríbenos a " +
        SUPPORT_EMAIL +
        " y lo vemos contigo.",
      "",
      "— Equipo Yenda",
    ].join("\n"),
  };
}

/* ───────────────────────────── envío ────────────────────────────────── */

async function sendCajaEmail(
  ctx: CajaEmailContext,
  kind: CajaEmailKind,
  rendered: { subject: string; body: string },
): Promise<CajaEmailResult> {
  if (!isEmailConfigured()) return { ok: false, skipped: true };
  if (!ctx.toEmail) return { ok: false, error: "no_recipient" };

  try {
    const { data: emailSettings } = await ctx.supabase
      .from("email_settings")
      .select("sender_name, reply_to_email, brand_color, email_logo_url")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    const html = buildEmailHtml({
      body: rendered.body,
      brandColor: emailSettings?.brand_color || "#10b981",
      logoUrl: emailSettings?.email_logo_url || null,
      clinicName: ctx.orgName,
    });

    const result = await sendEmail({
      to: ctx.toEmail,
      subject: rendered.subject,
      html,
      fromName: "Yenda",
      replyTo: emailSettings?.reply_to_email || SUPPORT_EMAIL,
      tags: [{ name: "caja_kind", value: kind }],
    });

    if (!result.ok) {
      return result.skipped
        ? { ok: false, skipped: true }
        : { ok: false, error: result.error };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[caja-emails:${kind}] falló:`, msg);
    return { ok: false, error: msg };
  }
}

export async function sendCajaDailyExceptionsEmail(
  ctx: CajaEmailContext,
  payload: CajaDailyPayload,
): Promise<CajaEmailResult> {
  return sendCajaEmail(
    ctx,
    "daily_exceptions",
    renderDaily(ctx.orgName, payload),
  );
}

export async function sendCajaWeeklyDigestEmail(
  ctx: CajaEmailContext,
  payload: CajaWeeklyPayload,
): Promise<CajaEmailResult> {
  return sendCajaEmail(ctx, "weekly_digest", renderWeekly(ctx.orgName, payload));
}

export async function sendCajaStaleShiftEmail(
  ctx: CajaEmailContext,
  payload: CajaStalePayload,
): Promise<CajaEmailResult> {
  return sendCajaEmail(ctx, "stale_shift", renderStale(ctx.orgName, payload));
}

/**
 * Destinatario: el owner de la organización. Mismo camino que usa
 * `resolveBillingEmailContext` cuando no hay mp_payer_email — la caja no
 * tiene un "correo de facturación" propio, y quien tiene que enterarse de
 * que falta dinero es quien responde por él.
 *
 * Devuelve null si no se puede resolver; el cron salta esa org en silencio.
 */
export async function resolveCajaEmailContext(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CajaEmailContext | null> {
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return null;

  const { data: owner } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("id", owner.user_id)
    .maybeSingle();

  const toEmail = (profile?.email as string | undefined) ?? "";
  if (!toEmail) return null;

  return {
    supabase,
    organizationId,
    toEmail,
    orgName: (org.name as string | null) ?? "tu clínica",
  };
}

/* ─────────────────── deduplicación (ops_notice_log) ─────────────────── */
/*
 * Viven aquí y no en un helper propio porque sus dos únicos consumidores
 * son estas plantillas y el cron que las dispara. Son genéricos por dentro:
 * si un segundo módulo los necesita, se mueven sin cambiarles la firma.
 */

/** ¿Ya se emitió este aviso? Ante un error de lectura devuelve `true`:
 *  callar de más es mejor que mandar el mismo correo dos veces. */
export async function alreadyNotified(
  admin: SupabaseClient,
  organizationId: string,
  noticeKey: string,
  subjectId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("ops_notice_log")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("notice_key", noticeKey)
      .eq("subject_id", subjectId)
      .limit(1)
      .maybeSingle();
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
  }
}

/** Deja constancia. Best-effort: el UNIQUE de la mig 220 es la red real. */
export async function recordNotice(
  admin: SupabaseClient,
  organizationId: string,
  noticeKey: string,
  subjectId: string,
  meta: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await admin.from("ops_notice_log").insert({
      organization_id: organizationId,
      notice_key: noticeKey,
      subject_id: subjectId,
      meta,
    });
  } catch {
    // best-effort
  }
}
