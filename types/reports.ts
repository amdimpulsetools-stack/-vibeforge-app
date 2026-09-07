// Payload del RPC get_reports_overview (migración 198) — agregados
// financiero/operativo de /reports calculados server-side. La forma replica
// exactamente los buckets que antes calculaba el cliente sobre filas crudas
// (ver comentarios de la migración); los componentes derivan de aquí los
// mismos números que antes.

export interface ReportsDoctorRow {
  name: string;
  color: string;
  total: number;
  attended: number;
  confirmed: number;
  cancelled: number;
  scheduled: number;
  /** Precio de las citas atendidas + confirmadas del doctor (producción). */
  revenue: number;
  /**
   * Mig 251: cobrado en el rango sobre las citas del doctor (clínico, sin
   * farmacia ni tratamientos). Es lo que la pantalla llama "Facturado por
   * citas"; Σ de todos los doctores == collected_breakdown.period_appointments.
   * Opcional hasta aplicar la mig.
   */
  collected?: number;
}

export interface ReportsServiceRow {
  name: string;
  count: number;
  revenue: number;
}

export interface ReportsOfficeRow {
  name: string;
  total: number;
  completed: number;
}

export interface ReportsDailyRow {
  /** YYYY-MM-DD */
  date: string;
  scheduled: number;
  completed: number;
  cancelled: number;
}

export interface ReportsPeakHourRow {
  /** Hora 0-23 (entero) */
  hour: number;
  count: number;
}

export interface ReportsOverview {
  totals: {
    appointments: number;
    no_shows: number;
    /** Cobros de citas + farmacia del período. EXCLUYE tratamientos (mig 244). */
    payments_amount: number;
    /**
     * Cobros de TRATAMIENTOS (patient_payments.treatment_id, mig 242) del
     * período. Aparte: no tienen cita, así que sumarlos a "Cobrado" volvía
     * negativo el "Pendiente = Facturado(citas) − Cobrado". Opcional porque
     * llega solo con la mig 244 aplicada.
     */
    treatment_payments_amount?: number;
    /**
     * Mig 250: lo que de verdad falta cobrar de las citas atendidas y
     * confirmadas del rango — por cita, GREATEST(0, precio real − cobros
     * clínicos de esa cita). Nunca negativo. Farmacia, adelantos de otras
     * fechas y tratamientos no entran. Opcional hasta aplicar la mig.
     */
    pending_amount?: number;
    /**
     * Mig 250: cubetas de `payments_amount` (siempre suman ese total).
     * Farmacia primero (source='pos'), luego los cobros clínicos según a
     * qué pertenecen.
     */
    collected_breakdown?: {
      period_appointments: number;
      other_appointments: number;
      plans: number;
      pharmacy: number;
      other: number;
    };
  };
  doctors: ReportsDoctorRow[];
  services: ReportsServiceRow[];
  offices: ReportsOfficeRow[];
  daily: ReportsDailyRow[];
  peak_hours: ReportsPeakHourRow[];
}
