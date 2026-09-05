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
  revenue: number;
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
  };
  doctors: ReportsDoctorRow[];
  services: ReportsServiceRow[];
  offices: ReportsOfficeRow[];
  daily: ReportsDailyRow[];
  peak_hours: ReportsPeakHourRow[];
}
