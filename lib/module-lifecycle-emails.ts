import "server-only";

/**
 * Correos del CICLO DE VIDA de los módulos de pago (Caja S/39, Almacén
 * S/39, Captación S/99 — Farmacia viaja dentro del addon 'almacen').
 *
 * Mismo molde que `lib/billing-emails.ts`: destinatario resuelto desde la
 * org (owner con su fallback), `sendEmail` de lib/resend.ts, wrapper
 * `buildEmailHtml` con el branding de `email_settings`, y registro del
 * envío — aquí en `ops_notice_log` (mig 220), que además es la tabla de
 * dedupe: UNIQUE (organization_id, notice_key, subject_id).
 *
 * Cinco piezas:
 *   a) sendModuleWelcomeEmail       — al activar (owner + admins)
 *   b) sendModuleDeactivatedEmail   — al desactivar (owner)
 *   c) sendModuleAdoptionEmail      — consejo de uso (owner), 3 variantes
 *   d) notifyFounderModuleActivated / notifyFounderModuleDeactivated
 *   e) notifyFounderAdoptionDigest  — un solo correo por barrido del cron
 *
 * TODO es best-effort: ninguna de estas funciones lanza. Un correo que no
 * sale jamás puede tumbar la activación, la baja ni el cron que lo emite.
 *
 * ── Decisiones de producto que el código respeta ─────────────────────
 * · Los correos (a) y (b) son COMPROBANTES de una decisión del usuario:
 *   no llevan interruptor en Ajustes, igual que un recibo.
 * · Los correos (c) NO ofrecen dar de baja el módulo. Ofrecen ayuda y
 *   abren la puerta a responder. Nunca insinúan cancelar.
 * · Máximo 2 correos de adopción por módulo en toda la vida de la org
 *   (se cuenta en ops_notice_log). El tercero deja de ser ayuda.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailHtml } from "@/lib/email-template";
import { sendEmail, isEmailConfigured } from "@/lib/resend";
import { resolveFounderEmail } from "@/lib/support-emails";
import { formatPen } from "@/lib/billing/module-pricing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yenda.app";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "soporte@yenda.app";
const FOUNDER_CEO_URL = `${APP_URL}/founder-dashboard/ceo`;

/** Módulos con copy propio. 'farmacia' no tiene addon: viaja en 'almacen'. */
export type ModuleKey = "caja" | "almacen" | "farmacia" | "captacion";

export type AdoptionState = "sin_configurar" | "sin_estrenar" | "abandonado";

/** Tope de vida: nunca más de 2 correos de adopción por módulo y org. */
export const MAX_ADOPTION_EMAILS_PER_MODULE = 2;

interface ModuleCopy {
  /** Nombre comercial tal cual lo ve la clínica en el sidebar. */
  label: string;
  /** Ruta de la sección dentro del panel. */
  path: string;
  /** Una línea sobre qué resuelve el módulo. */
  tagline: string;
  /** Los TRES pasos. El 1 es siempre el que la gente olvida. */
  steps: [string, string, string];
  /** Párrafo que desactiva el miedo típico del módulo. */
  reassurance?: string;
  /** Qué se conserva si lo desactivan (detalle por módulo). */
  keeps: string;
  /** Cómo se llama la actividad del módulo en el reporte al founder. */
  activityNoun: string;
}

const MODULE_COPY: Record<ModuleKey, ModuleCopy> = {
  caja: {
    label: "Caja",
    path: "/caja",
    tagline:
      "cierra el día cuadrado: cada cobro queda dentro de un turno con su arqueo firmado.",
    steps: [
      `Configura cómo trabaja tu caja en ${APP_URL}/caja — si cada persona lleva su cajón o hay uno solo para toda la clínica, con cuánto sencillo se abre y cuánta diferencia consideras normal al cerrar.
   OJO CON ESTE PASO: hasta que guardes esa configuración el módulo NO VINCULA NADA. Es el que más se olvida — el módulo queda instalado pero inerte, y los cobros del día siguen sin turno.`,
      "Mañana, al empezar el día y antes del primer cobro, abre la caja. Toma 30 segundos.",
      "Antes de irse, ciérrala contando el efectivo. El primer cierre es el que engancha: es cuando ves, por primera vez, si lo que hay en el cajón es lo que debería haber.",
    ],
    reassurance:
      'Una tranquilidad: cobrar nunca depende de la caja. Si un día nadie la abre, se sigue cobrando igual y esos cobros quedan en una bandeja de "fuera de turno" para asignarlos después. El módulo ordena; no bloquea.',
    keeps:
      "los turnos cerrados con su arqueo firmado, los movimientos de efectivo y el historial de cierres",
    activityNoun: "turnos",
  },
  almacen: {
    label: "Almacén",
    path: "/almacen",
    tagline:
      "saber qué hay, qué se está yendo y qué te está costando, sin contar cajas a mano.",
    steps: [
      `Carga LOS 20 PRODUCTOS QUE MÁS MUEVES en ${APP_URL}/almacen. No los 300. Querer subir el catálogo completo el primer día es la razón nº1 por la que este módulo se abandona: se vuelve un proyecto de tarde entera y nunca se termina. Con 20 productos ya te sirve mañana.`,
      "Registra el saldo inicial de cada uno — lo que hay hoy en el estante, contado una sola vez.",
      "Mañana registra una salida real (lo que uses en una consulta) y mira el kardex: ahí ves el movimiento, el saldo nuevo y cuánto costó.",
    ],
    keeps:
      "los productos, los lotes, todos los movimientos y el kardex completo con sus costos congelados",
    activityNoun: "movimientos",
  },
  farmacia: {
    label: "Farmacia",
    path: "/farmacia",
    tagline:
      "vender en el mostrador descontando del mismo kardex, con un correlativo que sí es presentable.",
    steps: [
      `Revisa los precios de venta en ${APP_URL}/almacen antes de vender nada. Es el paso que se salta todo el mundo y el que te hace vender a un precio viejo toda la primera semana.`,
      "Haz una venta de prueba con algo barato, para ver el flujo completo sin miedo.",
      "Confírmala y mira el correlativo. Ese número es tu talonario: se asigna al confirmar (nunca al abrir el carrito), así que la serie no tiene huecos.",
    ],
    keeps: "las ventas confirmadas con su correlativo y el descargo de stock que hicieron",
    activityNoun: "ventas",
  },
  captacion: {
    label: "Captación",
    path: "/captacion",
    tagline:
      "saber qué anuncio te trae pacientes de verdad — no clics: pacientes que agendan, asisten y pagan.",
    steps: [
      `Conecta WhatsApp en ${APP_URL}/settings?tab=integraciones. Este es el paso oculto: sin WhatsApp conectado el módulo NO CAPTURA NADA — los mensajes que entran por tus anuncios no llegan a Yenda y el embudo se queda vacío para siempre.`,
      "Publica (o enlaza) un anuncio de click-to-WhatsApp. Cada conversación que entre por ahí queda marcada con el anuncio que la trajo.",
      `Mañana entra a ${APP_URL}/captacion y responde primero a los "sin responder". Ahí mismo ves, por anuncio, cuántos agendaron, cuántos asistieron y cuánto facturaron.`,
    ],
    keeps:
      "las conversaciones, la atribución de cada paciente a su anuncio y el histórico del embudo",
    activityNoun: "conversaciones con origen en un anuncio",
  },
};

export function getModuleCopy(key: string): ModuleCopy | null {
  return MODULE_COPY[key as ModuleKey] ?? null;
}

/** Módulos que este archivo sabe acompañar. Lo demás no genera correo. */
export function isLifecycleModule(key: string): key is ModuleKey {
  return key in MODULE_COPY;
}

function numbered(steps: readonly string[]): string {
  return steps.map((s, i) => `${i + 1}) ${s}`).join("\n\n");
}

/* ═══════════════════ Destinatarios y registro ═══════════════════ */

export interface OrgRecipient {
  userId: string;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Owner + admins de la org con su correo. El owner va SIEMPRE primero
 * (varias funciones mandan solo al owner y usan `[0]`).
 *
 * Fallback igual que en billing-emails: si el perfil no tiene email, el
 * miembro simplemente no entra — nunca se inventa un destinatario.
 */
export async function resolveOrgRecipients(
  admin: SupabaseClient,
  organizationId: string,
): Promise<OrgRecipient[]> {
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"]);

  const rows = (members ?? []) as { user_id: string; role: string }[];
  if (rows.length === 0) return [];

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, email, full_name")
    .in(
      "id",
      rows.map((m) => m.user_id),
    );

  const byId = new Map(
    ((profiles ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  return rows
    .map((m) => {
      const p = byId.get(m.user_id);
      return {
        userId: m.user_id,
        email: (p?.email ?? "").trim(),
        name: p?.full_name ?? null,
        role: m.role,
      };
    })
    .filter((r) => r.email.length > 0)
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
}

async function resolveOrgName(
  admin: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  return ((data?.name as string | undefined) || "tu clínica").trim();
}

/** ¿Ya se mandó este aviso a esta org para este sujeto? */
export async function hasNotice(
  admin: SupabaseClient,
  organizationId: string,
  noticeKey: string,
  subjectId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("ops_notice_log")
    .select("notice_key")
    .eq("organization_id", organizationId)
    .eq("notice_key", noticeKey)
    .eq("subject_id", subjectId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Cuántos correos de adopción se le han mandado a esta org por este
 * módulo, en toda su vida. Es el freno del acoso: al tercero se para.
 */
export async function countAdoptionNotices(
  admin: SupabaseClient,
  organizationId: string,
  addonKey: string,
): Promise<number> {
  const { count } = await admin
    .from("ops_notice_log")
    .select("notice_key", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("subject_id", addonKey)
    .like("notice_key", "adoption\\_%");
  return count ?? 0;
}

async function logNotice(
  admin: SupabaseClient,
  organizationId: string,
  noticeKey: string,
  subjectId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    // upsert y no insert: un módulo se puede activar, desactivar y volver
    // a activar. El comprobante se vuelve a mandar y la fila se refresca
    // en vez de reventar contra el UNIQUE.
    await admin.from("ops_notice_log").upsert(
      {
        organization_id: organizationId,
        notice_key: noticeKey,
        subject_id: subjectId,
        sent_at: new Date().toISOString(),
        meta,
      },
      { onConflict: "organization_id,notice_key,subject_id" },
    );
  } catch {
    // best-effort: el correo ya salió
  }
}

/* ═══════════════════ Envío con branding de la org ═══════════════════ */

interface OrgEmailInput {
  admin: SupabaseClient;
  organizationId: string;
  orgName: string;
  to: string[];
  subject: string;
  body: string;
  tag: string;
}

async function sendOrgEmail(input: OrgEmailInput): Promise<boolean> {
  if (!isEmailConfigured() || input.to.length === 0) return false;

  const { data: emailSettings } = await input.admin
    .from("email_settings")
    .select("brand_color, email_logo_url, reply_to_email")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    html: buildEmailHtml({
      body: input.body,
      brandColor: (emailSettings?.brand_color as string) || "#10b981",
      logoUrl: (emailSettings?.email_logo_url as string | null) || null,
      clinicName: input.orgName,
    }),
    fromName: "Yenda",
    replyTo: (emailSettings?.reply_to_email as string) || SUPPORT_EMAIL,
    tags: [{ name: "module_kind", value: input.tag }],
  });

  return result.ok;
}

async function sendFounderEmail(
  admin: SupabaseClient,
  kind: "module_activation" | "module_deactivation" | "module_adoption",
  subject: string,
  body: string,
): Promise<boolean> {
  const to = await resolveFounderEmail(admin, kind);
  if (!to) return false;

  const result = await sendEmail({
    to,
    subject,
    html: buildEmailHtml({
      body,
      brandColor: "#f59e0b", // ámbar del founder panel
      logoUrl: null,
      clinicName: "Yenda · Módulos",
    }),
    fromName: "Yenda",
    replyTo: SUPPORT_EMAIL,
    tags: [{ name: "founder_alert", value: kind }],
  });
  return result.ok;
}

/* ═══════════════ a) Bienvenida al activar el módulo ═══════════════ */

export interface ModuleWelcomeInput {
  admin: SupabaseClient;
  organizationId: string;
  addonKey: string;
  /** Nombre de quien lo activó, para el saludo. Opcional. */
  activatedByName?: string | null;
}

/**
 * Bienvenida al owner y a los admins. Un texto por módulo con TRES pasos
 * concretos, donde el paso 1 es siempre el que la gente olvida.
 *
 * Farmacia no tiene addon propio: al activar 'almacen' se desbloquean las
 * dos secciones, así que el correo de Almacén lleva pegado un bloque
 * corto de Farmacia en vez de mandar dos correos por una sola decisión.
 */
export async function sendModuleWelcomeEmail(
  input: ModuleWelcomeInput,
): Promise<boolean> {
  try {
    const copy = getModuleCopy(input.addonKey);
    if (!copy) return false;

    const recipients = await resolveOrgRecipients(input.admin, input.organizationId);
    if (recipients.length === 0) return false;

    const orgName = await resolveOrgName(input.admin, input.organizationId);

    let body = `Hola ${orgName},

Activaron el módulo ${copy.label} — ${copy.tagline}

Para que empiece a servirles mañana mismo, son tres pasos:

${numbered(copy.steps)}`;

    if (copy.reassurance) body += `\n\n${copy.reassurance}`;

    if (input.addonKey === "almacen") {
      const pharmacy = MODULE_COPY.farmacia;
      body += `

──────────────────────────────
Con Almacén también se activó ${pharmacy.label}, para vender en el mostrador descontando del mismo kardex. Cuando quieran estrenarla:

${numbered(pharmacy.steps)}`;
    }

    body += `

¿Algo no encaja con la forma en que trabajan? Respondan este correo y lo vemos — nos sirve más que cualquier encuesta.

— Equipo Yenda`;

    const sent = await sendOrgEmail({
      admin: input.admin,
      organizationId: input.organizationId,
      orgName,
      to: recipients.map((r) => r.email),
      subject: `${copy.label} activado — los 3 primeros pasos`,
      body,
      tag: `welcome_${input.addonKey}`,
    });

    if (sent) {
      await logNotice(
        input.admin,
        input.organizationId,
        "module_welcome",
        input.addonKey,
        { recipients: recipients.map((r) => r.email) },
      );
    }
    return sent;
  } catch (err) {
    console.warn("[module-lifecycle-emails] welcome falló:", err);
    return false;
  }
}

/* ═══════════════ b) Confirmación de baja del módulo ═══════════════ */

export interface ModuleDeactivatedInput {
  admin: SupabaseClient;
  organizationId: string;
  addonKey: string;
  /** Precio mensual que deja de cobrarse (del catálogo). */
  monthlyPrice: number | null;
  /** Nuevo total mensual tras la baja, si se pudo calcular. */
  newMonthlyTotal: number | null;
}

/**
 * Confirmación al owner. Lo importante no es el precio: es que NADA se
 * borra. Cierra preguntando por qué lo desactivó — el exit interview más
 * barato que existe.
 */
export async function sendModuleDeactivatedEmail(
  input: ModuleDeactivatedInput,
): Promise<boolean> {
  try {
    const copy = getModuleCopy(input.addonKey);
    if (!copy) return false;

    const recipients = await resolveOrgRecipients(input.admin, input.organizationId);
    const owner = recipients[0];
    if (!owner) return false;

    const orgName = await resolveOrgName(input.admin, input.organizationId);

    const priceLine =
      input.monthlyPrice && input.monthlyPrice > 0
        ? `Dejas de pagar ${formatPen(input.monthlyPrice)} al mes por este módulo.${
            input.newMonthlyTotal !== null
              ? ` Tu suscripción pasa a ${formatPen(input.newMonthlyTotal)} mensuales.`
              : ""
          }`
        : "Este módulo no tenía cobro aparte, así que tu suscripción no cambia de monto.";

    const body = `Hola ${orgName},

Desactivamos el módulo ${copy.label}. Ya no aparece en el menú lateral.

${priceLine} El monto nuevo aplica desde tu SIGUIENTE ciclo de facturación: lo ya pagado del mes en curso no se prorratea ni se devuelve. Si lo desactivaron por error, vuelve a activarse en un clic desde Ajustes → Módulos.

QUÉ PASA CON LO QUE YA REGISTRARON: nada se borra.
Se conservan ${copy.keeps}. Nada de eso se toca al desactivar, y si mañana reactivan el módulo vuelve todo tal cual — configuración incluida. No hay que volver a empezar.

Y una última cosa, la que de verdad nos importa: ¿por qué lo desactivaron? ¿No era lo que esperaban, no encajaba con cómo trabajan, se complicó la rutina, salió más caro que el problema que resolvía? Respondan este correo con una línea. Nos sirve más que cualquier encuesta.

— Equipo Yenda`;

    const sent = await sendOrgEmail({
      admin: input.admin,
      organizationId: input.organizationId,
      orgName,
      to: [owner.email],
      subject: `${copy.label} desactivado — nada de lo que registraste se borra`,
      body,
      tag: `deactivated_${input.addonKey}`,
    });

    if (sent) {
      await logNotice(
        input.admin,
        input.organizationId,
        "module_deactivated",
        input.addonKey,
        { to: owner.email, monthly_price: input.monthlyPrice },
      );
    }
    return sent;
  } catch (err) {
    console.warn("[module-lifecycle-emails] deactivated falló:", err);
    return false;
  }
}

/* ═══════════════ c) Consejo de uso / adopción ═══════════════ */

export interface ModuleAdoptionInput {
  admin: SupabaseClient;
  organizationId: string;
  addonKey: string;
  state: AdoptionState;
  /** Días desde la última señal de vida (solo 'abandonado'). */
  idleDays?: number;
}

export type AdoptionSendResult =
  | { sent: true }
  | { sent: false; reason: "no_copy" | "no_recipient" | "already_sent" | "cap_reached" | "send_failed" | "error" };

/**
 * Consejo de uso al owner. Tres variantes, y el mensaje correcto es
 * distinto en cada una.
 *
 * DECISIÓN DEL FOUNDER: estos correos NO ofrecen dar de baja el módulo.
 * Ofrecen ayuda y abren la puerta a responder. Nada más.
 *
 * Dos frenos, ambos contra ops_notice_log:
 *   · dedupe por notice_key = 'adoption_<estado>_<addon>' + subject = addon
 *   · tope de 2 correos de adopción por módulo en toda la vida de la org
 */
export async function sendModuleAdoptionEmail(
  input: ModuleAdoptionInput,
): Promise<AdoptionSendResult> {
  try {
    const copy = getModuleCopy(input.addonKey);
    if (!copy) return { sent: false, reason: "no_copy" };

    const noticeKey = `adoption_${input.state}_${input.addonKey}`;
    if (await hasNotice(input.admin, input.organizationId, noticeKey, input.addonKey)) {
      return { sent: false, reason: "already_sent" };
    }

    const previous = await countAdoptionNotices(
      input.admin,
      input.organizationId,
      input.addonKey,
    );
    if (previous >= MAX_ADOPTION_EMAILS_PER_MODULE) {
      return { sent: false, reason: "cap_reached" };
    }

    const recipients = await resolveOrgRecipients(input.admin, input.organizationId);
    const owner = recipients[0];
    if (!owner) return { sent: false, reason: "no_recipient" };

    const orgName = await resolveOrgName(input.admin, input.organizationId);
    const closing = `Si algo no encaja con cómo trabajan, respóndanos este correo y lo vemos con ustedes. Estamos del otro lado.

— Equipo Yenda`;

    let subject: string;
    let body: string;

    if (input.state === "sin_configurar") {
      subject = `${copy.label}: te falta un paso`;
      body = `Hola ${orgName},

Activaron ${copy.label} hace un par de días, pero todavía falta el paso que lo enciende: guardar la configuración en ${APP_URL}${copy.path}.

Hasta que la guarden, el módulo NO VINCULA NADA. Está instalado y visible, pero inerte: los cobros del día siguen sin turno y el arqueo no tiene de dónde salir.

Son tres decisiones y toma un minuto:
· ¿cada persona lleva su cajón, o hay uno solo para toda la clínica?
· ¿con cuánto sencillo se abre normalmente?
· ¿cuánta diferencia al cerrar consideran normal (redondeos) y a partir de cuánto quieren que pida explicación?

Con eso guardado, mañana abren la caja y el módulo ya está trabajando.

${closing}`;
    } else if (input.state === "sin_estrenar") {
      subject = `${copy.label}: ¿arrancamos?`;
      body = `Hola ${orgName},

Activaron ${copy.label} hace una semana y todavía no lo han estrenado. Pasa muchísimo — la semana se come sola. Va el recordatorio de por dónde empezar:

${numbered(copy.steps)}

${
  input.addonKey === "caja"
    ? "El primer cierre es el que engancha: es cuando ves por primera vez si lo que hay en el cajón es exactamente lo que debería haber. Hasta ese momento suena a trámite; después de ese momento no se quiere trabajar sin él."
    : "El primer movimiento real es el que engancha: hasta ahí suena a trámite; cuando ves el dato salir solo, ya no quieres volver atrás."
}

${closing}`;
    } else {
      const idle = input.idleDays ?? 14;
      subject = `${copy.label}: vimos que pararon`;
      body = `Hola ${orgName},

Estuvieron usando ${copy.label} y hace ${idle} días que no registran nada. No venimos a regañar: venimos a preguntar qué se rompió, porque casi siempre es una de estas tres cosas y las tres tienen arreglo:

1) CAMBIÓ QUIEN ESTÁ EN RECEPCIÓN. La persona que tenía la rutina ya no está, o entró alguien nuevo que no sabe que esto existe. Arreglo: díganos quién es y le mandamos el paso a paso en dos minutos de lectura.

2) LA CONFIGURACIÓN NO ENCAJA. Se configuró de una forma y trabajan de otra (una caja por persona cuando en realidad comparten cajón, tolerancias que saltan por redondeos de S/1). Arreglo: se cambia en ${APP_URL}${copy.path} sin perder nada de lo ya registrado.

3) CERRAR DA PEREZA. Al final del día nadie quiere sentarse a contar. Arreglo: es el paso que da todo el valor, pero se puede simplificar — cuéntenos su rutina y les decimos cómo recortarla.

Lo ya registrado sigue intacto y les espera donde lo dejaron.

${closing}`;
    }

    const ok = await sendOrgEmail({
      admin: input.admin,
      organizationId: input.organizationId,
      orgName,
      to: [owner.email],
      subject,
      body,
      tag: noticeKey,
    });

    if (!ok) return { sent: false, reason: "send_failed" };

    await logNotice(input.admin, input.organizationId, noticeKey, input.addonKey, {
      to: owner.email,
      state: input.state,
      previous_adoption_emails: previous,
    });
    return { sent: true };
  } catch (err) {
    console.warn("[module-lifecycle-emails] adoption falló:", err);
    return { sent: false, reason: "error" };
  }
}

/* ═══════════════ d) Alertas al founder (+MRR / −MRR) ═══════════════ */

export interface FounderModuleActivatedInput {
  admin: SupabaseClient;
  organizationId: string;
  orgName?: string | null;
  addonKey: string;
  addonName?: string | null;
  planLabel: string;
  monthlyPrice: number | null;
  /** Quién lo activó (nombre o email). */
  actorLabel: string;
  /** Total mensual antes de esta activación, si se pudo calcular. */
  previousMonthlyTotal: number | null;
  newMonthlyTotal: number | null;
}

export async function notifyFounderModuleActivated(
  input: FounderModuleActivatedInput,
): Promise<void> {
  try {
    const copy = getModuleCopy(input.addonKey);
    const label = copy?.label ?? input.addonName ?? input.addonKey;
    const orgName =
      input.orgName || (await resolveOrgName(input.admin, input.organizationId));

    const delta =
      input.monthlyPrice && input.monthlyPrice > 0
        ? `+${formatPen(input.monthlyPrice)}/mes`
        : "sin cobro (incluido en el plan)";

    const totals =
      input.previousMonthlyTotal !== null && input.newMonthlyTotal !== null
        ? `${formatPen(input.previousMonthlyTotal)} → ${formatPen(input.newMonthlyTotal)}`
        : input.newMonthlyTotal !== null
          ? `${formatPen(input.newMonthlyTotal)} (total nuevo)`
          : "sin cambio de monto";

    const body = `Una clínica activó un módulo de pago. ${delta}

Clínica: ${orgName}
Plan: ${input.planLabel}
Módulo: ${label} (${input.addonKey})
Precio: ${input.monthlyPrice ? `${formatPen(input.monthlyPrice)}/mes` : "—"}
Activó: ${input.actorLabel}
Mensual de la clínica: ${totals}

Desde hoy corre el reloj de adopción: D+2 si Caja se queda sin configurar, D+7 si el módulo no se estrena, y a los 14 días sin actividad entra como abandono en el reporte de los martes.

Ver la clínica en el Panel CEO:
${FOUNDER_CEO_URL}

— Yenda (aviso interno)`;

    await sendFounderEmail(
      input.admin,
      "module_activation",
      `[Yenda] +MRR ${delta} — ${orgName} activó ${label}`,
      body,
    );
  } catch {
    // best-effort
  }
}

export interface ModuleUsageStats {
  /** Cuántas unidades de actividad tuvo (turnos, movimientos, ventas). */
  count: number;
  /** Cómo se llaman esas unidades. */
  noun: string;
  /** ISO de la última actividad, o null si nunca hubo. */
  lastAt: string | null;
  /** Líneas extra (p. ej. ventas de farmacia junto a movimientos). */
  extra?: string[];
}

export interface FounderModuleDeactivatedInput {
  admin: SupabaseClient;
  organizationId: string;
  orgName?: string | null;
  addonKey: string;
  planLabel: string;
  monthlyPrice: number | null;
  actorLabel: string;
  newMonthlyTotal: number | null;
  /** Días que el módulo estuvo activo, si se pudo calcular. */
  daysActive: number | null;
  usage: ModuleUsageStats | null;
}

export async function notifyFounderModuleDeactivated(
  input: FounderModuleDeactivatedInput,
): Promise<void> {
  try {
    const copy = getModuleCopy(input.addonKey);
    const label = copy?.label ?? input.addonKey;
    const orgName =
      input.orgName || (await resolveOrgName(input.admin, input.organizationId));

    const delta =
      input.monthlyPrice && input.monthlyPrice > 0
        ? `−${formatPen(input.monthlyPrice)}/mes`
        : "sin impacto en MRR";

    // El historial de uso es lo que convierte el aviso en accionable:
    // "se fue sin estrenarlo" y "se fue después de 80 turnos" son dos
    // problemas distintos y se atienden distinto.
    const usageLines: string[] = [];
    if (input.usage) {
      usageLines.push(
        `Uso: ${input.usage.count} ${input.usage.noun}${
          input.usage.lastAt
            ? ` · último el ${formatDateEsPE(input.usage.lastAt)}`
            : " · nunca lo estrenó"
        }`,
      );
      for (const line of input.usage.extra ?? []) usageLines.push(`      ${line}`);
    }

    const verdict = !input.usage
      ? ""
      : input.usage.count === 0
        ? "\nSe fue SIN ESTRENARLO: el problema está en el arranque, no en el producto."
        : input.usage.count < 5
          ? "\nApenas lo probó: murió en la primera semana de rutina."
          : "\nLo usó de verdad y aun así lo dejó: aquí sí conviene preguntar por qué.";

    const body = `Una clínica desactivó un módulo de pago. ${delta}

Clínica: ${orgName}
Plan: ${input.planLabel}
Módulo: ${label} (${input.addonKey})
Desactivó: ${input.actorLabel}
Tiempo activo: ${input.daysActive !== null ? `${input.daysActive} días` : "—"}
Mensual nuevo: ${input.newMonthlyTotal !== null ? formatPen(input.newMonthlyTotal) : "—"}
${usageLines.join("\n")}${verdict}

Al owner ya le salió el correo de confirmación preguntándole por qué. Si responde, llega a soporte.

Ver la clínica en el Panel CEO:
${FOUNDER_CEO_URL}

— Yenda (aviso interno)`;

    await sendFounderEmail(
      input.admin,
      "module_deactivation",
      `[Yenda] ${delta} — ${orgName} desactivó ${label}`,
      body,
    );
  } catch {
    // best-effort
  }
}

/* ═══════════════ e) Reporte agregado de adopción ═══════════════ */

export interface AdoptionDigestRow {
  orgName: string;
  addonKey: string;
  /** Precio mensual del módulo, para sumar el MRR en riesgo. */
  monthlyPrice: number | null;
  /** Detalle corto: "activado hace 9 días", "14 días sin movimientos". */
  detail: string;
  /** false cuando la señal es débil y no se le escribió a la clínica. */
  emailed: boolean;
}

export interface AdoptionDigestInput {
  admin: SupabaseClient;
  sinConfigurar: AdoptionDigestRow[];
  sinEstrenar: AdoptionDigestRow[];
  abandonados: AdoptionDigestRow[];
  /** Correos que sí salieron en este barrido. */
  emailsSent: number;
  /** Correos frenados por el tope de 2 por módulo. */
  capped: number;
}

function digestSection(title: string, rows: AdoptionDigestRow[]): string {
  if (rows.length === 0) return `${title}: ninguna.`;
  const lines = rows.map((r) => {
    const price = r.monthlyPrice ? formatPen(r.monthlyPrice) : "—";
    const mail = r.emailed ? "" : " · sin correo a la clínica";
    return `· ${r.orgName} — ${getModuleCopy(r.addonKey)?.label ?? r.addonKey} (${price}) — ${r.detail}${mail}`;
  });
  return `${title} (${rows.length}):\n${lines.join("\n")}`;
}

function sumMrr(rows: AdoptionDigestRow[]): number {
  return rows.reduce((acc, r) => acc + (r.monthlyPrice ?? 0), 0);
}

/**
 * UN SOLO correo por barrido, no uno por clínica. El founder necesita la
 * foto del riesgo, no 40 notificaciones sueltas.
 */
export async function notifyFounderAdoptionDigest(
  input: AdoptionDigestInput,
): Promise<void> {
  try {
    const all = [...input.sinConfigurar, ...input.sinEstrenar, ...input.abandonados];
    if (all.length === 0) return; // nada que reportar: no se manda ruido

    const mrrAtRisk = sumMrr(all);

    const body = `Reporte semanal de adopción de módulos.

MRR EN RIESGO: ${formatPen(mrrAtRisk)}/mes repartido en ${all.length} módulo(s) activos que no se están usando.

${digestSection("SIN CONFIGURAR (activaron Caja y no guardaron la configuración: el módulo está inerte)", input.sinConfigurar)}

${digestSection("SIN ESTRENAR (una semana o más activo sin un solo uso)", input.sinEstrenar)}

${digestSection("ABANDONADOS (lo usaban y llevan 14 días sin registrar nada)", input.abandonados)}

Correos de consejo enviados en este barrido: ${input.emailsSent}
Frenados por el tope de 2 por módulo: ${input.capped}

Nota: Farmacia no tiene addon propio (viaja en 'almacen'), así que su señal es débil y NO genera correo a la clínica — aparece solo aquí.

Panel CEO:
${FOUNDER_CEO_URL}

— Yenda (aviso interno)`;

    await sendFounderEmail(
      input.admin,
      "module_adoption",
      `[Yenda] Adopción de módulos — ${formatPen(mrrAtRisk)}/mes en riesgo (${all.length})`,
      body,
    );
  } catch {
    // best-effort
  }
}

/* ═══════════════ Historial de uso (para la alerta de baja) ═══════════════ */

/* eslint-disable @typescript-eslint/no-explicit-any */
async function countAndLast(
  admin: SupabaseClient,
  table: string,
  organizationId: string,
  dateColumn: string,
  extraFilter?: (q: any) => any,
): Promise<{ count: number; lastAt: string | null }> {
  let query: any = (admin as any)
    .from(table)
    .select(dateColumn, { count: "exact" })
    .eq("organization_id", organizationId);
  if (extraFilter) query = extraFilter(query);

  const { data, count } = await query
    .order(dateColumn, { ascending: false, nullsFirst: false })
    .limit(1);

  const row = (data ?? [])[0] as Record<string, string> | undefined;
  return { count: count ?? 0, lastAt: row?.[dateColumn] ?? null };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Cuánto se usó el módulo antes de la baja. Es lo que convierte el aviso
 * al founder en accionable: irse sin estrenarlo e irse tras 80 turnos son
 * dos problemas distintos.
 *
 * Best-effort: si una tabla no existe o falla la consulta, devuelve null y
 * la alerta sale igual, solo que sin el bloque de uso.
 */
export async function collectModuleUsage(
  admin: SupabaseClient,
  organizationId: string,
  addonKey: string,
): Promise<ModuleUsageStats | null> {
  try {
    if (addonKey === "caja") {
      const shifts = await countAndLast(admin, "cash_shifts", organizationId, "opened_at");
      return { count: shifts.count, noun: "turnos abiertos", lastAt: shifts.lastAt };
    }

    if (addonKey === "almacen") {
      // created_at y NO movement_date: la fecha del movimiento es
      // retroactiva (se registra ayer lo de la semana pasada) y mentiría
      // sobre cuándo dejaron de usarlo.
      const movements = await countAndLast(
        admin,
        "inventory_movements",
        organizationId,
        "created_at",
      );
      const sales = await countAndLast(
        admin,
        "pharmacy_sales",
        organizationId,
        "confirmed_at",
        (q) => q.eq("status", "confirmada"),
      );
      return {
        count: movements.count,
        noun: "movimientos de inventario",
        lastAt: movements.lastAt,
        extra: [
          `Farmacia: ${sales.count} ventas confirmadas${
            sales.lastAt ? ` · última el ${formatDateEsPE(sales.lastAt)}` : ""
          }`,
        ],
      };
    }

    if (addonKey === "captacion") {
      const convs = await countAndLast(
        admin,
        "wa_conversations",
        organizationId,
        "first_referral_at",
        (q) => q.not("first_referral_at", "is", null),
      );
      return {
        count: convs.count,
        noun: "conversaciones venidas de un anuncio",
        lastAt: convs.lastAt,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/* ═══════════════ Utilidades compartidas ═══════════════ */

export function formatDateEsPE(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function daysBetween(fromIso: string | null | undefined, to: Date): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return null;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
