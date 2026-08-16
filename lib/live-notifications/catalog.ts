/**
 * Catálogo de "Notificaciones en vivo" (la campanita del topbar).
 *
 * Esta es la fuente de verdad de QUÉ eventos existen y a QUIÉN llegan por
 * defecto. Vive en TypeScript a propósito: añadir un evento no debe requerir
 * una migración. El RPC `notify_org_members` (mig 192) recibe las audiencias
 * por defecto de aquí y es quien decide QUIÉN las recibe realmente —
 * expandiendo audiencias a user_ids y aplicando el override de la org.
 *
 * Configuración por organización: `organizations.settings.live_notifications`,
 * sparse — sólo se guardan las desviaciones respecto de `defaultAudiences`.
 *
 *   { "live_notifications": { "payment_registered": { "audiences": ["owner_admin"] } } }
 *
 * Ausencia de clave = defaults del catálogo. `"audiences": []` = evento
 * apagado para toda la organización.
 *
 * ── Eventos que NO se emiten desde `/api/live-notifications/emit` ─────────
 *
 * `cash_shift_difference` y `cash_shift_force_closed` se emiten DESDE SQL,
 * dentro de `caja_close_shift` (mig 220), y no desde una ruta de emit. Es
 * deliberado y es de control interno, no de comodidad: quien tiene un motivo
 * para que el dueño no se entere de un descuadre es exactamente la persona
 * que controla el navegador desde el que se cerraría la caja. Un aviso
 * emitido en un segundo paso desde el cliente se desactiva cerrando la
 * pestaña; emitido en la misma transacción que escribe el arqueo, la única
 * forma de que no salga es que no se cierre la caja.
 *
 * Siguen figurando en este catálogo —y por tanto en la matriz de Settings—
 * porque el dueño tiene que poder apagarlos o reencaminarlos: el RPC lee el
 * override de la org igual, venga la llamada de donde venga.
 *
 * `cash_shift_stale` y `cash_orphan_payments` los emite el cron
 * `/api/cron/caja-sweep`, no una acción de usuario: son avisos sobre lo que
 * NO pasó (una caja que nadie cerró, un cobro que entró sin turno), y lo que
 * no pasa no dispara ningún handler.
 */

/**
 * Columnas de la matriz evento × rol.
 *
 * Son cuatro y no seis porque owner/admin se comportan igual en la práctica,
 * y "recepción" agrupa los roles `assistant` y `member` — que es como los
 * llama la clínica. `advisor` no es un rol sino el flag
 * `organization_members.is_fertility_advisor` (mig 137): la asesora suele
 * estar dada de alta como `member`, así que necesita columna propia.
 *
 * Las columnas son DISJUNTAS: quien lleva el flag de asesora cuenta como
 * "Asesora" y NO como "Recepción", aunque su rol sea `member`. Si se
 * solaparan, apagar la columna "Asesora" no le quitaría nada (seguiría
 * recibiendo por recepción) y la matriz estaría mintiendo. El reparto lo
 * aplica el RPC `notify_org_members` — ver mig 192.
 */
export const AUDIENCES = ["owner_admin", "doctor", "advisor", "reception"] as const;

export type Audience = (typeof AUDIENCES)[number];

/**
 * Alcance de la audiencia "doctor" para un evento.
 *
 *   "own"  sólo el doctor dueño de la cita. Es el default de todo lo que
 *          cuelga de una cita: al doctor le interesa SU agenda, no la de
 *          la clínica entera.
 *   "all"  todos los doctores de la org.
 */
export type DoctorScope = "own" | "all";

export interface LiveNotificationEvent {
  /** Clave estable. Es la que se guarda en el override de la org — no renombrar. */
  key: string;
  /** Va a `notifications.type`; el topbar lo usa para elegir icono y color. */
  type: string;
  label: { es: string; en: string };
  description: { es: string; en: string };
  /** Columnas que la matriz deja tocar para este evento. */
  eligibleAudiences: readonly Audience[];
  /** Columnas encendidas cuando la org no ha configurado nada. */
  defaultAudiences: readonly Audience[];
  doctorScope: DoctorScope;
}

export const LIVE_NOTIFICATION_EVENTS: readonly LiveNotificationEvent[] = [
  {
    key: "booking_created",
    type: "appointment_created",
    label: { es: "Reserva online creada", en: "Online booking created" },
    description: {
      es: "Un paciente reservó por su cuenta desde la página pública de reservas.",
      en: "A patient booked from the public booking page.",
    },
    // La asesora puede querer enterarse de la reserva que entra sola: es un
    // lead entrando por la puerta. Elegible, pero apagado por defecto.
    eligibleAudiences: ["owner_admin", "doctor", "advisor", "reception"],
    defaultAudiences: ["owner_admin", "doctor", "reception"],
    doctorScope: "own",
  },
  {
    key: "appointment_created",
    type: "appointment_created",
    label: { es: "Cita creada", en: "Appointment created" },
    description: {
      es: "Alguien del equipo agendó una cita desde el panel.",
      en: "A team member scheduled an appointment from the dashboard.",
    },
    eligibleAudiences: ["owner_admin", "doctor", "advisor", "reception"],
    defaultAudiences: ["owner_admin", "doctor", "reception"],
    doctorScope: "own",
  },
  {
    key: "appointment_cancelled",
    type: "appointment_cancelled",
    label: { es: "Cita cancelada", en: "Appointment cancelled" },
    description: {
      es: "Una cita se canceló, desde el panel o desde el portal del paciente.",
      en: "An appointment was cancelled, from the dashboard or the patient portal.",
    },
    eligibleAudiences: ["owner_admin", "doctor", "advisor", "reception"],
    defaultAudiences: ["owner_admin", "doctor", "reception"],
    doctorScope: "own",
  },
  {
    key: "appointment_no_show",
    type: "appointment_no_show",
    label: { es: "No-show marcado", en: "No-show marked" },
    description: {
      es: "Se marcó que el paciente no asistió a su cita.",
      en: "A patient was marked as a no-show.",
    },
    eligibleAudiences: ["owner_admin", "doctor", "advisor", "reception"],
    defaultAudiences: ["owner_admin", "doctor", "reception"],
    doctorScope: "own",
  },
  {
    key: "payment_registered",
    type: "payment_received",
    label: { es: "Pago registrado", en: "Payment registered" },
    description: {
      es: "Se registró un pago o anticipo de un paciente. Por defecto solo lo ve la dirección.",
      en: "A patient payment or deposit was registered. Management-only by default.",
    },
    // Dinero: default restringido a dirección. Recepción es elegible porque
    // en clínicas chicas es quien cobra; el doctor no entra en la caja.
    eligibleAudiences: ["owner_admin", "reception"],
    defaultAudiences: ["owner_admin"],
    doctorScope: "all",
  },
  {
    key: "patient_created",
    type: "info",
    label: { es: "Paciente registrado", en: "Patient registered" },
    description: {
      es: "Se dio de alta un paciente nuevo en el sistema.",
      en: "A new patient was registered.",
    },
    // Un paciente nuevo es un lead: la asesora sí entra por defecto aquí.
    eligibleAudiences: ["owner_admin", "advisor", "reception"],
    defaultAudiences: ["owner_admin", "advisor", "reception"],
    doctorScope: "all",
  },

  // ── Caja ────────────────────────────────────────────────────────────────
  {
    key: "cash_shift_stale",
    type: "cash_shift",
    label: { es: "Tu caja sigue abierta", en: "Your cash drawer is still open" },
    description: {
      es: "Terminó el día y un turno de caja quedó sin cerrar. Se avisa a quien lo abrió.",
      en: "The day ended with a cash shift left open. The person who opened it is notified.",
    },
    // `defaultAudiences` vacío NO significa "apagado": este aviso se emite
    // DIRIGIDO a quien abrió el turno (p_target_user_id, mig 220), que no es
    // un rol sino un papel en el hecho — puede ser la owner o la
    // recepcionista, y la matriz de roles no sabe distinguirlo.
    //
    // Las columnas siguen existiendo para que una clínica pueda pedir que la
    // dirección también se entere. El correo al dueño a partir del 2.º día
    // es otro canal y lo gobierna `cash_settings.notify_stale_shift`.
    eligibleAudiences: ["owner_admin", "reception"],
    defaultAudiences: [],
    doctorScope: "all",
  },
  {
    key: "cash_orphan_payments",
    type: "cash_orphan",
    label: { es: "Cobros fuera de turno", en: "Payments outside a shift" },
    description: {
      es: "Entraron cobros sin caja abierta. No están perdidos: hay que atribuirlos a un turno.",
      en: "Payments were registered with no open shift. They aren't lost — they need to be attached to one.",
    },
    // Recepción SÍ, y por defecto: no es un señalamiento, es una tarea suya.
    // Suele significar que se olvidó abrir la caja, y quien puede arreglarlo
    // en el momento es quien está en el mostrador.
    eligibleAudiences: ["owner_admin", "reception"],
    defaultAudiences: ["owner_admin", "reception"],
    doctorScope: "all",
  },
  {
    key: "cash_shift_difference",
    type: "cash_difference",
    label: { es: "Caja cerrada con diferencia", en: "Cash shift closed with a difference" },
    description: {
      es: "Un turno cerró con una diferencia por encima del umbral configurado. Solo lo ve la dirección.",
      en: "A shift closed with a difference above the configured threshold. Management only.",
    },
    // Recepción NO ES SIQUIERA ELEGIBLE, y esa es la decisión de producto más
    // importante de este catálogo. Un faltante que aparece en la campanita de
    // todo el equipo es una humillación pública: convierte una revisión
    // contable en un señalamiento delante de los compañeros, y el efecto
    // previsible no es más control sino menos cierres honestos. La diferencia
    // se revisa entre quien contó y quien dirige, no en el grupo.
    eligibleAudiences: ["owner_admin"],
    defaultAudiences: ["owner_admin"],
    doctorScope: "all",
  },
  {
    key: "cash_shift_force_closed",
    type: "cash_difference",
    label: { es: "Cierre forzado", en: "Force-closed shift" },
    description: {
      es: "Un administrador cerró la caja de otra persona. Quien la abrió recibe siempre su propio aviso.",
      en: "An admin closed someone else's cash shift. Whoever opened it always gets their own notice.",
    },
    // Misma razón que arriba para excluir a recepción de la difusión por rol.
    // El aviso a quien abrió el turno no viaja por estas audiencias: va
    // dirigido (mig 220) y no se puede apagar — alguien contó su dinero y
    // firmó un arqueo con su nombre encima.
    eligibleAudiences: ["owner_admin"],
    defaultAudiences: ["owner_admin"],
    doctorScope: "all",
  },

  // ── Módulos ─────────────────────────────────────────────────────────────
  {
    key: "module_activated",
    type: "module",
    label: { es: "Módulo activado", en: "Module activated" },
    description: {
      es: "Se activó un módulo en la clínica. Es un cambio de plan: solo lo ve la dirección.",
      en: "A module was activated for the clinic. It's a plan change: management only.",
    },
    eligibleAudiences: ["owner_admin"],
    defaultAudiences: ["owner_admin"],
    doctorScope: "all",
  },
  {
    key: "module_section_available",
    type: "module",
    label: { es: "Nueva sección en tu menú", en: "New section in your menu" },
    description: {
      es: "Un módulo nuevo añadió una sección al menú lateral. Llega a todo el equipo que la va a usar.",
      en: "A new module added a section to the sidebar. Everyone who will use it gets notified.",
    },
    // El contrario exacto del anterior: el ALTA es cosa de la dirección, pero
    // el menú que cambia lo ve todo el mundo. Un botón nuevo que aparece sin
    // explicación no se usa; con una línea que lo nombra, sí.
    eligibleAudiences: ["owner_admin", "doctor", "advisor", "reception"],
    defaultAudiences: ["owner_admin", "doctor", "reception"],
    doctorScope: "all",
  },
] as const;

export type LiveNotificationEventKey = (typeof LIVE_NOTIFICATION_EVENTS)[number]["key"];

const BY_KEY = new Map(LIVE_NOTIFICATION_EVENTS.map((e) => [e.key, e]));

export function getLiveNotificationEvent(key: string): LiveNotificationEvent | undefined {
  return BY_KEY.get(key);
}

/** Forma del override que se guarda en `organizations.settings`. */
export interface LiveNotificationOverride {
  audiences?: Audience[];
}

export type LiveNotificationSettings = Record<string, LiveNotificationOverride | undefined>;

/**
 * Audiencias efectivas de un evento para una org.
 *
 * Sólo para PINTAR la matriz. La emisión no pasa por aquí: el RPC vuelve a
 * resolver el override server-side, de modo que un cliente manipulado no
 * puede ampliar su propia audiencia.
 */
export function resolveAudiences(
  event: LiveNotificationEvent,
  settings: LiveNotificationSettings | null | undefined
): Audience[] {
  const override = settings?.[event.key]?.audiences;
  // Ausencia → defaults. Array vacío → apagado (no es lo mismo que ausencia).
  if (!Array.isArray(override)) return [...event.defaultAudiences];
  return override.filter((a): a is Audience => (AUDIENCES as readonly string[]).includes(a));
}

/** Lee el bloque de config del JSONB de la org, tolerando settings vacío o corrupto. */
export function readLiveNotificationSettings(
  orgSettings: unknown
): LiveNotificationSettings {
  if (!orgSettings || typeof orgSettings !== "object") return {};
  const block = (orgSettings as Record<string, unknown>).live_notifications;
  if (!block || typeof block !== "object" || Array.isArray(block)) return {};
  return block as LiveNotificationSettings;
}

export const AUDIENCE_LABELS: Record<Audience, { es: string; en: string }> = {
  owner_admin: { es: "Dirección", en: "Management" },
  doctor: { es: "Doctor", en: "Doctor" },
  advisor: { es: "Asesora", en: "Advisor" },
  reception: { es: "Recepción", en: "Reception" },
};

export const AUDIENCE_HINTS: Record<Audience, { es: string; en: string }> = {
  owner_admin: { es: "Owner y admin", en: "Owner and admin" },
  doctor: { es: "Rol doctor", en: "Doctor role" },
  advisor: { es: "Asesora de fertilidad", en: "Fertility advisor" },
  // "sin contar asesoras": el RPC las excluye para que las columnas no se
  // solapen — quien lleva el flag se gobierna desde la columna "Asesora".
  reception: { es: "Resto del equipo", en: "Rest of the team" },
};
