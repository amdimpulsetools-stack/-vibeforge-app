/**
 * Planes y precios de la landing: UNA sola fuente para todas las variantes
 * de la home (`/` y `/2`). Módulo sin "use client" a propósito: lo importan
 * componentes cliente (toggle de cadencia) y podría importarlo un Server
 * Component. Precios en S/ por mes; cadencias según PRD §5 (semestral =
 * 5.5 meses por 6, anual = 10 meses por 12).
 */

export type Cadence = "monthly" | "semiannual" | "annual";

export const PRICING_PLANS = [
  {
    name: "Independiente",
    priceMonthly: "129",
    priceSemiannual: "118.25", // 5.5 mo / 6 mo = 8.3% off
    priceAnnual: "107.50",     // 10 mo / 12 mo = 16.7% off
    savingsSemiannual: "64.50",
    savingsAnnual: "258",
    anchor: "Un solo paciente que no falta al mes ya te pagó el sistema",
    anchorSemiannual: "Ahorra S/64.50: medio mes gratis",
    anchorAnnual: "Ahorra S/258 al año: 2 meses gratis",
    features: [
      "1 doctor · 1 consultorio",
      "1 recepcionista / asistente",
      "Pacientes y citas ilimitados",
      "Historia clínica SOAP + recetas",
      "Órdenes de exámenes imprimibles",
      "Recordatorios WhatsApp y email",
      "Reserva online para pacientes",
      "Cobros y control de deudas",
      "Reportes básicos",
    ],
    highlight: false,
    badge: "IA incluida",
  },
  {
    name: "Centro Médico",
    priceMonthly: "349",
    priceSemiannual: "319.92",
    priceAnnual: "290.83",
    savingsSemiannual: "174.50",
    savingsAnnual: "698",
    anchor: "3 consultas al mes cubren el plan completo",
    anchorSemiannual: "Ahorra S/174.50: medio mes gratis",
    anchorAnnual: "Ahorra S/698 al año: 2 meses gratis",
    features: [
      "3 doctores · 3 consultorios",
      "2 recepcionistas / asistentes",
      "Pacientes y citas ilimitados",
      "Todo lo de Independiente, más:",
      "Reportes completos + exportación CSV",
      "Resumen diario del equipo por email",
      "4 roles y permisos completos",
      "3 módulos de especialidad",
    ],
    highlight: true,
    badge: "El que recomendamos",
  },
  {
    name: "Clínica",
    priceMonthly: "649",
    priceSemiannual: "594.92",
    priceAnnual: "540.83",
    savingsSemiannual: "324.50",
    savingsAnnual: "1,298",
    anchor: "Un tratamiento de S/700 al mes cubre la suscripción de toda la clínica",
    anchorSemiannual: "Ahorra S/324.50: medio mes gratis",
    anchorAnnual: "Ahorra S/1,298 al año: 2 meses gratis",
    features: [
      "10 doctores · 10 consultorios",
      "10 doctores, 3 recepcionistas y hasta 15 personas en total",
      "Pacientes y citas ilimitados",
      "Todo lo de Centro Médico, más:",
      "Todos los módulos de especialidad",
      "Te acompañamos por videollamada hasta que tu clínica esté funcionando",
      "Te respondemos en menos de 4 horas, de lunes a sábado",
      "Pasamos tus pacientes desde tu Excel o tu sistema actual: nosotros, no tú",
    ],
    highlight: false,
    badge: "IA incluida",
  },
];

export type PricingPlan = (typeof PRICING_PLANS)[number];

export function priceFor(plan: PricingPlan, cadence: Cadence) {
  if (cadence === "monthly") return plan.priceMonthly;
  if (cadence === "semiannual") return plan.priceSemiannual;
  return plan.priceAnnual;
}

export function anchorFor(plan: PricingPlan, cadence: Cadence) {
  if (cadence === "monthly") return plan.anchor;
  if (cadence === "semiannual") return plan.anchorSemiannual;
  return plan.anchorAnnual;
}

/**
 * Cobro por período (lo que Mercado Pago intenta cobrar de una vez), no el
 * precio mensual prorrateado que muestra la tarjeta.
 */
export function periodTotal(plan: PricingPlan, cadence: Cadence) {
  const monthly = Number(priceFor(plan, cadence));
  if (Number.isNaN(monthly)) return null;
  if (cadence === "semiannual") return monthly * 6;
  if (cadence === "annual") return monthly * 12;
  return monthly;
}
