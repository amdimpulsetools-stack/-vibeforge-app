/**
 * Contrato del "Resumen de cobros del periodo" (reporte personalizado).
 *
 * Es la forma EXACTA del JSON que devuelve el RPC `get_custom_report`
 * (mig 260, detalle de Adelantos mig 265; validado en
 * docs/reporte-personalizado/sql/). Lo
 * consumen la pestaña de Reportes, la ruta GET /api/reports/custom y el PDF
 * /api/pdf/custom-report: un solo tipo para las tres, ninguna reinterpreta
 * nada. Diseño completo: docs/spec-reporte-personalizado.md.
 *
 * Regla de dinero (CLAUDE.md): cada sección ES una cubeta de
 * `collected_breakdown` de get_reports_overview (mig 251), con las mismas
 * CTEs. Con las cuatro marcadas, `grand_total` == `payments_amount +
 * treatment_payments_amount` de esa función para el mismo rango. Montos
 * brutos con IGV, por fecha de cobro.
 */

export type CustomReportSectionKey = "services" | "advances" | "pharmacy" | "treatments";

/** Orden canónico de impresión. */
export const CUSTOM_REPORT_SECTIONS: readonly CustomReportSectionKey[] = [
  "services",
  "advances",
  "pharmacy",
  "treatments",
] as const;

/**
 * Sub-grupo de "Adelantos y pagos a cuenta":
 *  - appointment_future: cobro del rango sobre una cita POSTERIOR al rango (adelanto)
 *  - appointment_past:   cobro del rango sobre una cita ANTERIOR al rango (pago atrasado)
 *  - direct:             sin cita, plan ni tratamiento (abono directo desde la ficha)
 *  - plan:               anticipo a un plan de tratamiento (cubeta `plans`)
 */
export type CustomReportAdvanceKind = "appointment_future" | "appointment_past" | "direct" | "plan";

export interface CustomReportRowBase {
  description: string;
  /**
   * Qué cuenta depende de la sección: citas (services), pagos (advances,
   * treatments), unidades con hasta 3 decimales (pharmacy).
   */
  quantity: number;
  /**
   * Precio real si es ÚNICO en el grupo; `null` cuando difiere ("varios"),
   * y entonces `price_min`/`price_max` acotan. Nunca un promedio.
   * Cantidad × Precio puede no ser el Total (parciales, descuentos): la
   * columna Total es la que manda.
   */
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  total: number;
}

export interface CustomReportServiceRow extends CustomReportRowBase {
  /** Citas del rango con status='completed' para ese servicio (informativo). */
  attended: number;
  /** Σ precio real de las atendidas == "Ingresos por servicio" de Operacional (informativo, fuera del total). */
  production_total: number;
}

export interface CustomReportAdvanceRow extends CustomReportRowBase {
  kind: CustomReportAdvanceKind;
}

export interface CustomReportPharmacyRow extends CustomReportRowBase {
  /** Fila "Ventas anuladas": su cobro sigue en patient_payments (mig 232), se muestra aparte para cuadrar. */
  voided: boolean;
}

export type CustomReportTreatmentRow = CustomReportRowBase;

export interface CustomReportSection<R extends CustomReportRowBase> {
  rows: R[];
  total: number;
}

/**
 * Mig 265: una fila por COBRO de "Adelantos y pagos a cuenta". Sale de la
 * misma CTE que `rows` y `by_bucket`, así Σ `amount` por `kind` == la
 * cubeta correspondiente (con la lista completa, ver `detail_truncated`).
 * Lleva nombre y motivo: dato personal, la ruta del PDF lo audita.
 */
export interface CustomReportAdvanceDetail {
  payment_id: string;
  kind: CustomReportAdvanceKind;
  /** yyyy-MM-dd, fecha de cobro (siempre dentro del rango). */
  payment_date: string;
  /** "Nombre Apellido" de la ficha; "Paciente sin ficha" si el pago no tiene paciente. */
  patient_name: string;
  amount: number;
  /** Medio de pago tal cual se guardó (texto libre o etiqueta del lookup). */
  method: string | null;
  /** "Motivo / referencia" del cobro. Obligatorio desde la ficha SOLO sin cita (histórico puede ser null). */
  notes: string | null;
  /** Solo `appointment_*`: fecha de la cita (fuera del rango por definición). */
  appointment_date: string | null;
  /** Solo `appointment_*`: servicio de la cita ("Sin servicio" si no tiene). */
  service_name: string | null;
  /** Solo `plan`: título del plan ("Plan sin título" si no tiene). */
  plan_title: string | null;
}

export interface CustomReportAdvancesSection extends CustomReportSection<CustomReportAdvanceRow> {
  by_bucket: {
    other_appointments: number;
    plans: number;
    other: number;
  };
  /** Mig 265. Orden: payment_date, created_at. Como máximo 300 filas. */
  detail: CustomReportAdvanceDetail[];
  /** true si había más de 300 cobros: entonces Σ detail < total (la cifra que manda sigue siendo `total`). */
  detail_truncated: boolean;
}

export interface CustomReport {
  role: string;
  range: {
    /** yyyy-MM-dd, fecha civil de la org */
    from: string;
    to: string;
    timezone: string;
  };
  /** Sección aplicable: módulo activo O monto > 0 en el rango. Si es false, la UI no la pinta. */
  sections_available: Record<CustomReportSectionKey, boolean>;
  /** `null` cuando la sección no venía en `p_sections`. */
  sections: {
    services: CustomReportSection<CustomReportServiceRow> | null;
    advances: CustomReportAdvancesSection | null;
    pharmacy: CustomReportSection<CustomReportPharmacyRow> | null;
    treatments: CustomReportSection<CustomReportTreatmentRow> | null;
  };
  /** Σ de los totales de las secciones pedidas. */
  grand_total: number;
  reconciliation: {
    /** == get_reports_overview.totals.payments_amount (clínica, sin tratamientos) */
    payments_amount: number;
    /** == get_reports_overview.totals.treatment_payments_amount */
    treatment_payments_amount: number;
    collected_breakdown: {
      period_appointments: number;
      other_appointments: number;
      plans: number;
      pharmacy: number;
      other: number;
    };
    /** Σ cubetas de las secciones pedidas: con las cuatro == payments_amount + treatment_payments_amount. */
    expected_grand_total: number;
    /** Devoluciones registradas en Caja en el rango (negativo o 0). Informativo, FUERA del total. */
    refunds_in_range: number;
  };
}

/** Sección → cubetas de collected_breakdown que la componen (para la línea de cuadre). */
export const CUSTOM_REPORT_SECTION_BUCKETS: Record<CustomReportSectionKey, readonly string[]> = {
  services: ["period_appointments"],
  advances: ["other_appointments", "other", "plans"],
  pharmacy: ["pharmacy"],
  treatments: ["treatments"],
};

/** Parámetros comunes de las dos rutas HTTP (JSON y PDF). */
export interface CustomReportQuery {
  org_id: string;
  /** yyyy-MM-dd */
  from: string;
  /** yyyy-MM-dd */
  to: string;
  /** Solo el PDF la usa (la pantalla trae todo y filtra en cliente). CSV de claves. */
  sections?: CustomReportSectionKey[];
}
