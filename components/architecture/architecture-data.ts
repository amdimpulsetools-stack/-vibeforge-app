/**
 * Mapa de arquitectura de Yenda — datos del grafo.
 *
 * Separado del componente a propósito: esto es DOCUMENTACIÓN VIVA. Cuando
 * nazca un módulo nuevo se toca solo este archivo, nunca la lógica del
 * lienzo.
 *
 * El grafo es un árbol jerárquico de 4 niveles:
 *   Yenda → capa (Público / Dashboard / API / Datos / Integraciones) → módulo
 * Las posiciones son manuales (no auto-layout) para que el mapa se lea
 * siempre igual: cada rama ocupa su columna y no baila entre renders.
 */

export type NodeCategory = "frontend" | "backend" | "integraciones" | "datos";

/** Lo que consume NeonNode. `details` solo se ve al pasar el cursor. */
export interface ArchNodeData extends Record<string, unknown> {
  title: string;
  description: string;
  category: NodeCategory;
  /** Detalle largo del tooltip: rutas reales, tablas, reglas del módulo. */
  details?: string;
  /** Marca los nodos que agrupan hijos (se pintan más grandes). */
  isGroup?: boolean;
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  integraciones: "Integraciones",
  datos: "Datos",
};

/**
 * Paleta neón por categoría. Se usa tanto en el nodo como en la leyenda,
 * así que vive aquí y no en el CSS del componente.
 */
export const CATEGORY_COLORS: Record<
  NodeCategory,
  { base: string; glow: string; soft: string }
> = {
  frontend: { base: "#34d399", glow: "52, 211, 153", soft: "#064e3b" },
  backend: { base: "#60a5fa", glow: "96, 165, 250", soft: "#1e3a8a" },
  integraciones: { base: "#c084fc", glow: "192, 132, 252", soft: "#4c1d95" },
  datos: { base: "#fbbf24", glow: "251, 191, 36", soft: "#78350f" },
};

/** Nodo del grafo, en el shape que espera React Flow. */
export interface ArchNode {
  id: string;
  type: "neon";
  position: { x: number; y: number };
  data: ArchNodeData;
}

// Rejilla: X = columna de la rama, Y = profundidad del nivel.
const COL = 260; // ancho entre columnas hermanas
const ROW = 190; // alto entre niveles

export const initialNodes: ArchNode[] = [
  // ── Nivel 0: raíz ────────────────────────────────────────────────
  {
    id: "yenda",
    type: "neon",
    position: { x: COL * 5.5, y: 0 },
    data: {
      title: "Yenda",
      description: "SaaS de gestión clínica",
      category: "frontend",
      isGroup: true,
      details:
        "Next.js 15 (App Router) + TypeScript + Supabase. Multi-tenant: cada clínica es una organización con RLS por organization_id. Módulos de pago activables por addon.",
    },
  },

  // ── Nivel 1: capas ───────────────────────────────────────────────
  {
    id: "publico",
    type: "neon",
    position: { x: COL * 0.5, y: ROW },
    data: {
      title: "Público",
      description: "Sin sesión",
      category: "frontend",
      isGroup: true,
      details:
        "Todo lo que ve alguien que no ha iniciado sesión: la landing, la reserva online del paciente y la página de pago del link de cobro.",
    },
  },
  {
    id: "dashboard",
    type: "neon",
    position: { x: COL * 3, y: ROW },
    data: {
      title: "Dashboard",
      description: "Panel de la clínica",
      category: "frontend",
      isGroup: true,
      details:
        "app/(dashboard) — layout con sidebar. Protegido por middleware + RLS. Lo que ve el equipo: doctores, recepción, admin y owner (cada rol con su alcance).",
    },
  },
  {
    id: "api",
    type: "neon",
    position: { x: COL * 6, y: ROW },
    data: {
      title: "API + Lógica",
      description: "Rutas y reglas de negocio",
      category: "backend",
      isGroup: true,
      details:
        "app/api/* (rutas) + lib/* (reglas). Server Actions para lo simple, API routes para lo complejo. Validación con Zod en todas las rutas.",
    },
  },
  {
    id: "datos",
    type: "neon",
    position: { x: COL * 8.5, y: ROW },
    data: {
      title: "Datos",
      description: "Supabase",
      category: "datos",
      isGroup: true,
      details:
        "Postgres con RLS obligatorio en todas las tablas, Auth, Storage y RPCs (SECURITY DEFINER filtrados por get_user_org_ids). 234 migraciones aplicadas en orden.",
    },
  },
  {
    id: "integraciones",
    type: "neon",
    position: { x: COL * 11, y: ROW },
    data: {
      title: "Integraciones",
      description: "Servicios externos",
      category: "integraciones",
      isGroup: true,
      details:
        "Cada clínica conecta SUS propias cuentas (modelo BYO-credenciales): las credenciales se guardan cifradas AES-256-GCM por organización.",
    },
  },

  // ── Nivel 2: Público ─────────────────────────────────────────────
  {
    id: "landing",
    type: "neon",
    position: { x: 0, y: ROW * 2 },
    data: {
      title: "Landing",
      description: "yenda.app",
      category: "frontend",
      details:
        "Hero, quiz de diagnóstico (PainQuiz), calculadora de impacto, demo del asistente IA, planes y SEO. Convierte visitas en registros de prueba.",
    },
  },
  {
    id: "reserva",
    type: "neon",
    position: { x: COL, y: ROW * 2 },
    data: {
      title: "Reserva online",
      description: "/book/[slug]",
      category: "frontend",
      details:
        "El paciente elige servicio, doctor y horario disponible. Respeta duración por servicio, bloques y sobreturnos. Crea la cita y dispara confirmación.",
    },
  },
  {
    id: "pago",
    type: "neon",
    position: { x: COL * 2, y: ROW * 2.6 },
    data: {
      title: "Página de pago",
      description: "/pagar/[token]",
      category: "frontend",
      details:
        "Link de cobro Culqi (F1). Móvil-primero, tarjeta y Yape. El monto SIEMPRE se lee de la base, nunca de la URL. CSP acotada solo a esta ruta.",
    },
  },

  // ── Nivel 2: Dashboard ───────────────────────────────────────────
  {
    id: "agenda",
    type: "neon",
    position: { x: COL * 2.2, y: ROW * 2 },
    data: {
      title: "Agenda",
      description: "Citas y calendario",
      category: "frontend",
      details:
        "Vista día/semana con drag & drop, duración editable por cita, precio acordado (price_snapshot), cobros, descuentos y cancelación con devolución (mig 230).",
    },
  },
  {
    id: "pacientes",
    type: "neon",
    position: { x: COL * 3.2, y: ROW * 2 },
    data: {
      title: "Pacientes",
      description: "Ficha e historia",
      category: "frontend",
      details:
        "Datos, historia clínica, finanzas (saldo = citas no canceladas − pagos clínicos), presupuestos, planes de tratamiento y seguimientos.",
    },
  },
  {
    id: "almacen",
    type: "neon",
    position: { x: COL * 4.2, y: ROW * 2 },
    data: {
      title: "Almacén",
      description: "Inventario · addon",
      category: "frontend",
      details:
        "Kardex append-only (las correcciones son contra-asientos, nunca UPDATE). Costo promedio ponderado, lotes, vencimientos. Compra SIN IGV, venta CON IGV.",
    },
  },
  {
    id: "farmacia",
    type: "neon",
    position: { x: COL * 2.2, y: ROW * 2.9 },
    data: {
      title: "Farmacia",
      description: "POS de mostrador",
      category: "frontend",
      details:
        "Vende, descuenta stock y cobra en una sola transacción atómica. sale_date = fecha del hecho en huso Lima (mig 232). Historial con rangos y cierre del día.",
    },
  },
  {
    id: "caja",
    type: "neon",
    position: { x: COL * 3.2, y: ROW * 2.9 },
    data: {
      title: "Caja",
      description: "Turnos y arqueo · addon",
      category: "frontend",
      details:
        "Turnos por organización o por usuario. Movimientos con signo (devoluciones negativas). Arqueo: esperado vs contado. Los cobros se atan al turno por trigger.",
    },
  },
  {
    id: "facturacion",
    type: "neon",
    position: { x: COL * 4.2, y: ROW * 2.9 },
    data: {
      title: "Facturación",
      description: "Comprobantes SUNAT",
      category: "frontend",
      details:
        "Boletas, facturas y notas de crédito vía NubeFact. Afectación IGV por ítem (1 gravado / 8 exonerado / 9 inafecto, catálogo 07).",
    },
  },
  {
    id: "reportes",
    type: "neon",
    position: { x: COL * 3.7, y: ROW * 3.8 },
    data: {
      title: "Reportes + IA",
      description: "Analítica",
      category: "frontend",
      details:
        "KPIs financieros y operativos agregados en el servidor (RPC). El asistente IA responde en español y NUNCA llama 'rentabilidad' a una suma de ventas brutas.",
    },
  },
  {
    id: "settings",
    type: "neon",
    position: { x: COL * 2.7, y: ROW * 3.8 },
    data: {
      title: "Ajustes",
      description: "Configuración y equipo",
      category: "frontend",
      details:
        "Catálogos (servicios, métodos de pago), horarios, plantillas de correo, matriz de notificaciones por rol, equipo y roles, e integraciones.",
    },
  },

  // ── Nivel 2: API ─────────────────────────────────────────────────
  {
    id: "api-citas",
    type: "neon",
    position: { x: COL * 5.5, y: ROW * 2 },
    data: {
      title: "Citas y pacientes",
      description: "/api/appointments…",
      category: "backend",
      details:
        "Alta y edición de citas, disponibilidad consciente de duración, recordatorios y confirmaciones. Toda mutación valida rol + organización.",
    },
  },
  {
    id: "api-dinero",
    type: "neon",
    position: { x: COL * 6.5, y: ROW * 2 },
    data: {
      title: "Dinero",
      description: "Pagos, caja, POS",
      category: "backend",
      details:
        "RPCs transaccionales: pharmacy_confirm_sale, pharmacy_void_sale, appointment_cancel_refund, caja_close_shift. Regla dura: solo pagos clínicos cancelan consultas.",
    },
  },
  {
    id: "api-cron",
    type: "neon",
    position: { x: COL * 6, y: ROW * 2.9 },
    data: {
      title: "Cron",
      description: "Tareas programadas",
      category: "backend",
      details:
        "Recordatorios 24h/2h, seguimientos, alertas de stock y vencimiento, avisos de suscripción. Cada corrida queda registrada en cron_runs.",
    },
  },
  {
    id: "api-ia",
    type: "neon",
    position: { x: COL * 7, y: ROW * 2.9 },
    data: {
      title: "Capa IA",
      description: "Asistente y reportes",
      category: "backend",
      details:
        "Prompts con contexto del esquema y guardarraíles fiscales: los montos son brutos con IGV y sin costos, así que se habla de 'facturado' y 'cobrado'.",
    },
  },

  // ── Nivel 2: Datos ───────────────────────────────────────────────
  {
    id: "postgres",
    type: "neon",
    position: { x: COL * 8, y: ROW * 2 },
    data: {
      title: "Postgres + RLS",
      description: "Base de datos",
      category: "datos",
      details:
        "Todas las tablas con RLS por organización. Invariantes protegidos por trigger (kardex append-only, ventas cerradas inmutables, correlativos server-side).",
    },
  },
  {
    id: "auth",
    type: "neon",
    position: { x: COL * 9, y: ROW * 2 },
    data: {
      title: "Auth",
      description: "Sesiones y roles",
      category: "datos",
      details:
        "Email + Google OAuth, CAPTCHA y protección de fuerza bruta. Roles owner/admin/recepción/doctor y límite de dispositivos por rol (auth_sessions).",
    },
  },
  {
    id: "storage",
    type: "neon",
    position: { x: COL * 8.5, y: ROW * 2.9 },
    data: {
      title: "Storage",
      description: "Archivos",
      category: "datos",
      details:
        "Logos, avatares, adjuntos clínicos y galería antes/después. Buckets con políticas por organización.",
    },
  },

  // ── Nivel 2: Integraciones ───────────────────────────────────────
  {
    id: "whatsapp",
    type: "neon",
    position: { x: COL * 10.2, y: ROW * 2 },
    data: {
      title: "WhatsApp",
      description: "Cloud API (Meta)",
      category: "integraciones",
      details:
        "Cada clínica conecta su número con Embedded Signup (Coexistence: sigue vivo en su celular). Plantillas aprobadas hacia afuera; webhook con firma HMAC hacia adentro.",
    },
  },
  {
    id: "gcal",
    type: "neon",
    position: { x: COL * 11.2, y: ROW * 2 },
    data: {
      title: "Google Calendar",
      description: "OAuth verificado",
      category: "integraciones",
      details:
        "Sincroniza cada cita con el calendario del doctor (crear, mover, cancelar). Scope calendar.events verificado por Google.",
    },
  },
  {
    id: "culqi",
    type: "neon",
    position: { x: COL * 12.2, y: ROW * 2 },
    data: {
      title: "Culqi",
      description: "Link de cobro",
      category: "integraciones",
      details:
        "Llaves por clínica cifradas. La plata va directo del paciente a la clínica — Yenda nunca la toca. Webhook idempotente de reconciliación.",
    },
  },
  {
    id: "nubefact",
    type: "neon",
    position: { x: COL * 10.2, y: ROW * 2.9 },
    data: {
      title: "NubeFact",
      description: "Facturación SUNAT",
      category: "integraciones",
      details:
        "Emisión de boletas, facturas y notas de crédito. Los importes viajan ya desglosados por afectación de IGV.",
    },
  },
  {
    id: "correo",
    type: "neon",
    position: { x: COL * 11.2, y: ROW * 2.9 },
    data: {
      title: "Correo",
      description: "SMTP + Resend",
      category: "integraciones",
      details:
        "Plantillas por organización con variables. Recordatorios, confirmaciones, invitaciones y alertas. Ojo operativo: un rebote duro suprime la dirección en Resend.",
    },
  },
  {
    id: "mp",
    type: "neon",
    position: { x: COL * 12.2, y: ROW * 2.9 },
    data: {
      title: "Mercado Pago",
      description: "Suscripciones",
      category: "integraciones",
      details:
        "Cobro del plan de la clínica a Yenda (no de pacientes): checkout, webhook de estado y activación de addons de pago.",
    },
  },
];

/**
 * Aristas del árbol. `source` es SIEMPRE el padre: la lógica de colapso
 * recorre el grafo en esa dirección para encontrar descendientes.
 */
export const initialEdges = [
  // Raíz → capas
  { id: "e-yenda-publico", source: "yenda", target: "publico" },
  { id: "e-yenda-dashboard", source: "yenda", target: "dashboard" },
  { id: "e-yenda-api", source: "yenda", target: "api" },
  { id: "e-yenda-datos", source: "yenda", target: "datos" },
  { id: "e-yenda-integraciones", source: "yenda", target: "integraciones" },

  // Público
  { id: "e-publico-landing", source: "publico", target: "landing" },
  { id: "e-publico-reserva", source: "publico", target: "reserva" },
  { id: "e-publico-pago", source: "publico", target: "pago" },

  // Dashboard
  { id: "e-dash-agenda", source: "dashboard", target: "agenda" },
  { id: "e-dash-pacientes", source: "dashboard", target: "pacientes" },
  { id: "e-dash-almacen", source: "dashboard", target: "almacen" },
  { id: "e-dash-farmacia", source: "dashboard", target: "farmacia" },
  { id: "e-dash-caja", source: "dashboard", target: "caja" },
  { id: "e-dash-facturacion", source: "dashboard", target: "facturacion" },
  { id: "e-dash-reportes", source: "dashboard", target: "reportes" },
  { id: "e-dash-settings", source: "dashboard", target: "settings" },

  // API
  { id: "e-api-citas", source: "api", target: "api-citas" },
  { id: "e-api-dinero", source: "api", target: "api-dinero" },
  { id: "e-api-cron", source: "api", target: "api-cron" },
  { id: "e-api-ia", source: "api", target: "api-ia" },

  // Datos
  { id: "e-datos-postgres", source: "datos", target: "postgres" },
  { id: "e-datos-auth", source: "datos", target: "auth" },
  { id: "e-datos-storage", source: "datos", target: "storage" },

  // Integraciones
  { id: "e-int-whatsapp", source: "integraciones", target: "whatsapp" },
  { id: "e-int-gcal", source: "integraciones", target: "gcal" },
  { id: "e-int-culqi", source: "integraciones", target: "culqi" },
  { id: "e-int-nubefact", source: "integraciones", target: "nubefact" },
  { id: "e-int-correo", source: "integraciones", target: "correo" },
  { id: "e-int-mp", source: "integraciones", target: "mp" },
];

/**
 * Relaciones REALES que no son de jerarquía (quién habla con quién). Se
 * dibujan punteadas y NO participan en el colapso: son referencias, no
 * paternidad — si contaran como aristas de árbol, colapsar "Dashboard"
 * arrastraría media integración con él.
 */
export const crossEdges = [
  { id: "x-agenda-gcal", source: "agenda", target: "gcal" },
  { id: "x-agenda-wa", source: "agenda", target: "whatsapp" },
  { id: "x-farmacia-caja", source: "farmacia", target: "caja" },
  { id: "x-farmacia-almacen", source: "farmacia", target: "almacen" },
  { id: "x-pago-culqi", source: "pago", target: "culqi" },
  { id: "x-facturacion-nubefact", source: "facturacion", target: "nubefact" },
  { id: "x-cron-correo", source: "api-cron", target: "correo" },
  { id: "x-api-postgres", source: "api-dinero", target: "postgres" },
];
