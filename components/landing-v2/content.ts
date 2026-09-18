/**
 * Copy de la landing paralela `/2`. Misma información que la home (`/`),
 * reorganizada en otra estructura: hero con mockup de la app, franja de
 * esenciales, motor de seguimientos como pieza central, roles del equipo con
 * el asistente IA pegado, impacto con calculadora, prueba, precios, FAQ y
 * cierre.
 *
 * Fuente de cada texto: los componentes de `components/landing/` (inventario
 * del 18-sep-2026). Lo que es dinero (planes, fórmula de recuperación) NO
 * vive aquí: se importa de `pricing-plans.ts` y `roi-model.ts`, igual que
 * en la home. Reglas de redacción heredadas: la paciente que dejó de venir
 * se cuenta en femenino; "te avisa para contactarla en un clic", nunca "la
 * contacta automáticamente"; ningún número de resultados que no salga de
 * la base de datos; sin guiones largos como coma.
 */

export const V2_VARIANT = "2";

export const NAV_LINKS = [
  { label: "Cómo funciona", href: "#seguimiento" },
  { label: "Para tu equipo", href: "#equipo" },
  { label: "Impacto", href: "#impacto" },
  { label: "Precios", href: "#precios" },
  { label: "Preguntas", href: "#preguntas" },
] as const;

export const HERO = {
  eyebrow: "Software para clínicas y consultorios · Perú",
  /** Frase del H1 que lleva el subrayado a mano (si el titular cambia y no
   *  la contiene, el subrayado simplemente no se dibuja). */
  underlined: "trae de vuelta",
  secondary: { label: "Ver cómo funciona", href: "#seguimiento" },
  microcopy: ["Sin tarjeta", "14 días gratis", "Cancela cuando quieras"],
  confidence:
    "Sin contrato. Lo configuras en una tarde y tu recepcionista lo entiende el mismo día.",
  caption: "Vista ilustrativa · datos ficticios",
} as const;

export const ESSENTIALS = {
  lead: "Agenda, historia clínica, caja y boletas SUNAT",
  rest: "en una sola pantalla, con recordatorios automáticos por WhatsApp.",
} as const;

export const WORKFLOW = {
  eyebrow: "Motor de seguimientos y recuperación de citas",
  title: "Las pacientes que no volvieron, recuperadas.",
  intro:
    "Lo que ningún otro sistema de citas hace: detectar a la paciente que no volvió y darle a tu equipo el siguiente paso.",
  steps: [
    {
      title: "Detecta",
      body: "Control pendiente sin cita, presupuesto aceptado sin iniciar, sesión de tratamiento perdida, cita completada sin siguiente control: cada caso abre un seguimiento solo.",
    },
    {
      title: "Contacta",
      body: "Cascada de hasta 3 intentos por WhatsApp o correo, con plantillas editables y el mensaje listo para enviar en un clic. Tu equipo decide; nada sale sin una persona detrás.",
    },
    {
      title: "Mide",
      body: "Cada cita que nace de un seguimiento queda marcada como recuperada. Sin atribución inflada: solo cuenta la que agendó después del contacto.",
    },
  ],
  triggersEyebrow: "Lo que abre un seguimiento hoy",
  triggers: [
    "Cita completada sin control",
    "No asistió",
    "Presupuesto aceptado sin iniciar",
    "Sesión de plan perdida",
    "Presupuesto sin respuesta (fertilidad)",
  ],
  demoLabel: "Seguimiento en vivo",
  demoNote: "Ejemplo ilustrativo · paciente ficticia",
  nextStep: "Siguiente paso",
  restart: "Volver a explorar",
  cta: "Ver cómo funciona en una demo",
} as const;

export interface RoleFeature {
  title: string;
  description: string;
}

export interface RoleMockupRow {
  label: string;
  value: string;
  accent?: boolean;
}

export interface Role {
  id: "recepcion" | "admin" | "doctor" | "marketing";
  tab: string;
  painKiller: string;
  headline: string;
  subline: string;
  features: RoleFeature[];
  mockup: { title: string; rows: RoleMockupRow[] };
}

export const TEAM = {
  eyebrow: "Para todo el equipo",
  titleLead: "Cada uno ve",
  titleMuted: "exactamente lo que necesita",
  intro:
    "Tú, tu recepcionista y tus doctores entran al mismo sistema, pero nadie ve lo que no le toca. Cada persona ve exactamente lo que necesita para hacer su trabajo mejor.",
  roles: [
    {
      id: "recepcion",
      tab: "Recepcionista",
      painKiller:
        "Ya no necesita WhatsApp + Excel + Google Calendar para manejar el día",
      headline: "Cero caos en la agenda",
      subline:
        "Todo lo que tu recepcionista necesita en una sola pantalla. Sin WhatsApp, sin Excel, sin caos.",
      features: [
        {
          title: "Agendar en 3 pasos",
          description: "Paciente, doctor, servicio. Listo. Sin doble-agendamiento.",
        },
        {
          title: "Vista del día completa",
          description:
            "Todas las citas del día con estado en tiempo real: confirmada, en sala, completada.",
        },
        {
          title: "Seguimientos automáticos",
          description:
            "Nunca olvida un seguimiento. El sistema le recuerda qué pacientes necesitan llamada.",
        },
        {
          title: "Perfil de paciente al instante",
          description:
            "Historial, deudas, último servicio y notas. Todo antes de que el paciente se siente.",
        },
      ],
      mockup: {
        title: "Agenda · Hoy, Lunes 24",
        rows: [
          { label: "9:00 · María García", value: "Consulta general" },
          { label: "9:30 · Carlos López", value: "Ecografía", accent: true },
          { label: "10:00 · Ana Rodríguez", value: "Control post operatorio" },
          { label: "10:30 · Libre", value: "Cupo disponible" },
        ],
      },
    },
    {
      id: "admin",
      tab: "Administrador",
      painKiller: "Sabe exactamente cuánto se facturó sin hacer cuentas a mano",
      headline: "Control total, sin perseguir a nadie",
      subline:
        "Abre Yenda a las 7 pm y ya está todo sumado: cuánto entró, quién quedó debiendo y qué doctor atendió cuántos. Sin preguntar a nadie.",
      features: [
        {
          title: "Dashboard en tiempo real",
          description:
            "Cuánto facturaste, qué tan llena está la agenda, cuántos cancelaron y cuántos no llegaron. Se actualiza solo, apenas recepción registra el cobro.",
        },
        {
          title: "Configuración centralizada",
          description: "Servicios, consultorios, horarios, permisos de equipo. Un solo lugar.",
        },
        {
          title: "Reportes automáticos",
          description: "Financiero, operativo, marketing, retención. Exporta a CSV en un click.",
        },
        {
          title: "Control de pagos y deudas",
          description: "Sabe quién pagó, quién debe y cuánto se cobró esta semana.",
        },
      ],
      mockup: {
        title: "Dashboard · Esta semana",
        rows: [
          { label: "Ingresos", value: "S/ 8,450", accent: true },
          { label: "Ocupación", value: "87%" },
          { label: "Citas completadas", value: "42 de 48" },
          { label: "Cancelaciones", value: "3 (6%)" },
        ],
      },
    },
    {
      id: "doctor",
      tab: "Doctor",
      painKiller: "No pierde tiempo en administración, solo en sus pacientes",
      headline: "Entra, atiende y sal a la hora",
      subline:
        "El doctor abre su agenda del día, escribe la nota con una plantilla de su especialidad y ve todo el historial del paciente en la misma pantalla.",
      features: [
        {
          title: "Notas SOAP pre-cargadas",
          description:
            "Plantillas por especialidad. Completa la consulta en minutos, no en horas.",
        },
        {
          title: "Historial clínico completo",
          description:
            "Diagnósticos previos, prescripciones, tratamientos y adjuntos. Todo en una ficha.",
        },
        {
          title: "Solo sus citas",
          description: "Ve únicamente su agenda del día. Sin ruido de otros doctores o áreas.",
        },
        {
          title: "Tiempo optimizado",
          description: "Menos papeleo, más consultas. El sistema hace el trabajo administrativo.",
        },
      ],
      mockup: {
        title: "Mis citas · Dr. Ramos",
        rows: [
          { label: "9:00 · María García", value: "Nota SOAP pendiente", accent: true },
          { label: "10:00 · Carlos López", value: "Completada" },
          { label: "11:00 · Ana Rodríguez", value: "En sala de espera", accent: true },
          { label: "12:00 · Libre", value: "Almuerzo" },
        ],
      },
    },
    {
      id: "marketing",
      tab: "Ventas & Marketing",
      painKiller: "Deja de invertir en marketing sin saber qué canal trae más pacientes",
      headline: "Sabe de dónde vienen y cómo retenerlos",
      subline:
        "Reportes de origen, retención y crecimiento. Deja de invertir a ciegas y toma decisiones con datos.",
      features: [
        {
          title: "Origen de pacientes",
          description:
            "Instagram, Google, referido, caminando. Sabe exactamente qué canal convierte más.",
        },
        {
          title: "Nuevos vs recurrentes",
          description: "Mide tu crecimiento real: cuántos pacientes nuevos vs cuántos regresan.",
        },
        {
          title: "Tasa de retención",
          description:
            "Identifica cuántos pacientes no volvieron y activa campañas de reactivación.",
        },
        {
          title: "IA que sugiere",
          description:
            "\"Pacientes de Instagram tienen 40% más retención\": conclusiones automáticas.",
        },
      ],
      mockup: {
        title: "Marketing · Marzo 2026",
        rows: [
          { label: "Pacientes nuevos", value: "45 este mes", accent: true },
          { label: "Top canal", value: "Instagram (38%)" },
          { label: "Retención", value: "74% (+8pp)", accent: true },
          { label: "Inactivos", value: "12 sin cita en 60 días" },
        ],
      },
    },
  ] satisfies Role[],
  mockupFoot: (tab: string) => `Así se ve el panel de ${tab.toLowerCase()}`,
};

export const AI = {
  badge: "Incluido en todos los planes",
  titleLead: "IA incluida en todos los planes.",
  titleAccent: "No es un extra.",
  intro:
    "Pregúntale a tu clínica lo que le preguntarías a un contador: en español, y te responde al toque. Qué servicio facturó más, qué doctor tuvo más cancelaciones, cuántos pacientes vinieron de Instagram.",
  toggleOpen: "Prueba una pregunta",
  toggleClose: "Cerrar ejemplo",
  prompt: "Prueba una pregunta real:",
  questions: [
    {
      question: "¿Qué servicio facturó más este mes?",
      answer:
        "Ecografías facturaron S/4,200 este mes, un 35% más que consultas generales. Representan el 28% de tus ingresos totales.",
    },
    {
      question: "¿Qué doctor tuvo más cancelaciones?",
      answer:
        "Dr. Ramos tuvo 8 cancelaciones este mes (23% de sus citas). La mayoría fueron los lunes por la mañana. Sugiero revisar su disponibilidad.",
    },
    {
      question: "¿Cómo puedo optimizar los horarios del martes?",
      answer:
        "Los martes tienes 40% de la agenda vacía entre 2-4pm. Mover consultas de seguimiento a esas horas liberaría la mañana para nuevos pacientes.",
    },
    {
      question: "¿Cuántos pacientes nuevos tuve vs recurrentes?",
      answer:
        "Este mes: 45 nuevos, 128 recurrentes. Tu tasa de retención es del 74%, 8 puntos arriba vs. el mes pasado.",
    },
  ],
  tiers: [
    { level: "Básico", plan: "Independiente" },
    { level: "Avanzado", plan: "Centro Médico" },
    { level: "Máximo", plan: "Clínica" },
  ],
  disclaimer:
    "El asistente IA analiza datos operativos y administrativos. No realiza diagnósticos médicos ni accede a información clínica de pacientes.",
} as const;

export const IMPACT = {
  eyebrow: "Impacto en ingresos",
  titleLead: "Tu clínica pierde dinero todos los meses.",
  titleAccent: "Yenda te muestra dónde.",
  intro:
    "No se trata de presionar a tus pacientes. Se trata de dejar de perder cobros por olvido, horas muertas por no-shows y pacientes que nadie llamó para volver.",
  leaks: [
    { title: "Pacientes que no llegan", loss: "15–25% de tu agenda", recovered: "Hasta 40% menos" },
    { title: "Cobranza pendiente", loss: "S/ 500–1,200 al mes", recovered: "60–80% recuperado" },
    { title: "Pacientes que no vuelven", loss: "40% sin seguimiento", recovered: "+15% retención" },
    { title: "Captación frenada", loss: "Solo por llamada", recovered: "+4–8% nuevos" },
  ],
  annotation: "Un solo paciente que no falta al mes ya te pagó el sistema",
  calculator: {
    title: "Calcula tu recuperación",
    pill: "Estimación",
    hint: "Mueve los controles según tu realidad. Los números se actualizan al instante.",
    sliders: {
      doctors: { label: "Doctores en tu clínica", min: 1, max: 20, step: 1, initial: 3 },
      appts: { label: "Citas por doctor al mes", min: 20, max: 150, step: 5, initial: 60 },
      fee: { label: "Tarifa promedio por cita", min: 50, max: 500, step: 10, initial: 150 },
    },
    resultEyebrow: "Recuperación estimada",
    perMonth: "/ mes",
    yearly: (yearly: string) => `≈ ${yearly} al año`,
    bullets: [
      "Hoy no llega 1 de cada 5 pacientes. Con recordatorio automático por WhatsApp, no llega 1 de cada 8.",
      "+4% de pacientes nuevos porque pueden reservar solos, de noche y en domingo.",
    ],
    planLine: (price: number, name: string) => `Yenda para tu clínica: S/${price}/mes (plan ${name}).`,
    multiple: (n: number) => `Recuperas ${n}× lo que pagas.`,
    disclaimer:
      "Esta es una estimación, no una promesa: usamos ratios de inasistencia comunes en clínicas de LATAM que no envían recordatorios. Tu resultado depende de tu especialidad, tu tarifa y de que uses el sistema.",
    noCard: "Sin tarjeta. Cancelas cuando quieras.",
  },
} as const;

export const PROOF = {
  eyebrow: "Hecho en Perú",
  badge: "Clínicas reales, no demos",
  title: "Construido a punta de preguntar.",
  intro:
    "Cada flujo de Yenda nace de una conversación con un doctor, un administrador o una recepcionista que nos dijo qué les frenaba en su día a día.",
  quote:
    "Todavía no tenemos 500 clínicas. Tenemos clínicas piloto reales en Lima (un centro de fertilidad, una clínica dermatológica, consultorios independientes) y las escuchamos todos los días. Cada pantalla de Yenda nació de algo que nos pidieron.",
  quoteBy: "El equipo de Yenda, sin testimonios inventados",
  pilots: "Fertilidad · Dermatología · Consultorios · Lima, Perú",
  pilotActive: "Piloto activo desde abril 2026",
  signals: ["Datos encriptados", "Backups automáticos", "Soporte en español", "Precios en soles"],
  early: {
    eyebrow: "Acceso anticipado",
    title: "Sé de los primeros 100 en probarlo.",
    body: "El precio de hoy es el precio que mantienes mientras sigas siendo cliente. Y lo que pidas en tus primeros 3 meses entra a la lista de construcción antes que cualquier otra cosa.",
    link: "Ver planes y precios",
  },
} as const;

export const PRICING = {
  eyebrow: "Precios",
  title: "Crece a tu ritmo. Paga solo lo que necesitas.",
  intro: "Tres planes para cada etapa. Sin contratos, sin sorpresas. IA incluida en todos.",
  cadences: [
    { id: "monthly", label: "Mensual", badge: null },
    { id: "semiannual", label: "Semestral", badge: "½ mes gratis" },
    { id: "annual", label: "Anual", badge: "2 meses gratis" },
  ] as const,
  monthlyNote: "Facturación mensual",
  perMonth: "/mes",
  /** Etiqueta pequeña sobre el nombre del plan, por nombre de plan. */
  kicker: {
    Independiente: "Para empezar",
    "Centro Médico": "El que recomendamos",
    Clínica: "Para clínicas",
  } as Record<string, string>,
  recommended: "Recomendado",
  mpCap: {
    semiannual: "Pago semestral disponible próximamente; por ahora, mensual",
    annual: "Pago anual disponible próximamente; por ahora, mensual",
  },
  aiIncluded: "IA incluida",
  noCard: "Sin tarjeta. Cancelas cuando quieras.",
  riskFree: [
    "14 días gratis",
    "Sin tarjeta",
    "Cancela en 1 clic",
    "Te exportamos tus datos cuando quieras",
    "Te ayudamos con la migración",
  ],
  addons: {
    lead: "¿Te falta un doctor o un consultorio más? Los ",
    strong: "agregas sueltos",
    tail: " sin tener que saltar al plan siguiente.",
  },
  enterprise: {
    title: "Enterprise",
    subtitle: "Para clínicas con más de 15 doctores",
    body: "Tu propia base de datos, integraciones con tus sistemas actuales y un equipo asignado a tu cuenta. Para operaciones que necesitan control total sobre datos, integraciones y soporte.",
    cta: "Hablar con el equipo",
    href: "/contacto",
    price: "Precio a medida",
  },
} as const;

export const FAQ = {
  eyebrow: "Preguntas",
  title: "Preguntas frecuentes",
  intro: "¿Tienes otra? ",
  introLink: "Escríbenos",
  introHref: "/contacto",
  introTail: " y te respondemos en español, sin bots de por medio.",
  items: [
    {
      question: "¿Emite boletas y facturas electrónicas a SUNAT?",
      answer:
        "Sí. Cobras la consulta y desde la misma pantalla sale el comprobante electrónico a SUNAT. No tienes que pasar el dato a otro sistema ni mandarle fotos al contador a fin de mes.",
    },
    {
      question: "Mi recepcionista no es muy de computadoras. ¿Va a poder?",
      answer:
        "Sí. Si maneja WhatsApp, maneja Yenda. Agendar una cita son tres pasos y no hay manual que leer. En los primeros días la acompañamos por videollamada las veces que haga falta.",
    },
    {
      question: "¿Otra clínica puede ver a mis pacientes?",
      answer:
        "No, nunca. Cada clínica trabaja en su propio espacio, separado por completo del resto. Ni siquiera nuestro equipo entra a tu información clínica sin que tú lo autorices. Todo viaja y se guarda encriptado, con copias de seguridad automáticas todos los días. Si mañana se malogra tu computadora, tu historia clínica sigue intacta; con un cuaderno o un Excel en el escritorio, no.",
    },
    {
      question: "¿Qué pasa cuando terminan los 14 días de prueba?",
      answer:
        "Nada automático. No tenemos tu tarjeta, así que no podemos cobrarte. Te avisamos antes de que termine y tú decides si te quedas. Si no haces nada, la prueba simplemente se acaba.",
    },
    {
      question: "¿Puedo usar mi número de WhatsApp actual?",
      answer:
        "Los recordatorios salen por la API oficial de WhatsApp Business de Meta, con un número dedicado de tu clínica: los pacientes ven el nombre de tu clínica, no tu celular personal, y tu número personal por fin vuelve a ser tuyo. Sin riesgo de bloqueo por envíos masivos.",
    },
    {
      question: "¿Puedo migrar mis datos desde otro sistema?",
      answer:
        "Sí, y no lo haces tú. Nos mandas tu Excel, tu lista de pacientes o lo que tengas, y nuestro equipo lo deja cargado y ordenado antes de tu primer día. Sin costo adicional.",
    },
    {
      question: "¿Y si se cae el internet en la clínica?",
      answer:
        "Puedes seguir atendiendo y registrar después. Y como todo vive en la nube, si se malogra la computadora de recepción abres Yenda desde el celular y sigues trabajando.",
    },
    {
      question: "¿Funciona en mi celular?",
      answer:
        "Sí. La plataforma es completamente responsiva. Funciona en cualquier dispositivo con navegador, sin instalar nada.",
    },
    {
      question: "¿Qué pasa si necesito más de lo que incluye mi plan?",
      answer:
        "Agregas doctores, consultorios o miembros de equipo sueltos, sin tener que saltar al plan siguiente.",
    },
    {
      question: "¿La IA va a reemplazar a mis doctores?",
      answer:
        "No. El asistente solo lee datos administrativos y financieros: no hace diagnósticos ni entra a las historias clínicas de tus pacientes.",
    },
    {
      question: "¿Y si algún día quiero irme? ¿Mis datos quedan atrapados?",
      answer:
        "No. Tus datos son tuyos: exportas tus reportes a CSV cuando quieras y, si decides irte, nuestro equipo te entrega tu información completa. Sin penalidades ni letra chica.",
    },
  ],
} as const;

export const CLOSING = {
  eyebrow: "Empieza hoy",
  title: "Tu clínica merece herramientas del 2026.",
  body: "Configura tu clínica en minutos. Sin contratos. Cancela cuando quieras. IA incluida desde el primer día.",
  /** "Yenda no deja de crecer", sin fechas ni detalle: va después del FAQ
   *  para que ningún "próximamente" toque el momento de decisión. */
  growth:
    "Cada mes sale algo nuevo. No pagas actualización ni instalas nada, y el precio de hoy es el precio que mantienes.",
  microcopy: "Sin tarjeta. Planes desde S/129/mes cuando decidas quedarte.",
} as const;

export const FOOTER = {
  tagline: "Hecho en Perú 🇵🇪 para Latinoamérica",
  links: [
    { label: "Producto", href: "/producto" },
    { label: "Blog", href: "/blog" },
    { label: "Base de conocimientos", href: "/base-conocimientos" },
    { label: "Calculadora WhatsApp", href: "/calculadora-whatsapp" },
    { label: "Contacto", href: "/contacto" },
  ],
  legal: [
    { label: "Términos", href: "/terms" },
    { label: "Privacidad", href: "/privacy" },
    { label: "Eliminación de datos", href: "/data-deletion" },
  ],
  year: "2026",
} as const;

export const STICKY_MICROCOPY = "Sin tarjeta · Desde S/129 al mes · Cancela cuando quieras";
