"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import type {
  PatientWithTags,
  PatientPayment,
  Appointment,
  Doctor,
  Service,
  Office,
} from "@/types/admin";
import {
  APPOINTMENT_STATUS_COLORS,
  PATIENT_STATUS_COLORS,
  COMMON_PATIENT_TAGS,
} from "@/types/admin";
import {
  X,
  ArrowLeft,
  User,
  Phone,
  Mail,
  FileText,
  Clock,
  Loader2,
  Plus,
  Tag,
  DollarSign,
  Coins,
  Wallet,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Megaphone,
  Save,
  Edit2,
  Stethoscope,
  Lock,
  Receipt,
  ShieldCheck,
  Heart,
  Camera,
  Link2,
  Activity,
  ArrowRight,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useFertilityAddon } from "@/hooks/use-fertility-addon";
import { treatmentMoney, type TreatmentMoney } from "@/lib/treatments/money";
import {
  REVENUE_BUCKET_LABELS,
  TREATMENT_OUTCOME_LABELS,
  type RevenueBucket,
  type TreatmentOutcome,
  type TreatmentPaymentConcept,
  type TreatmentStatus,
} from "@/types/treatments";
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import { useEInvoiceConfig } from "@/hooks/use-einvoice-config";
import { useOrgInsurance } from "@/hooks/use-org-insurance";
import { PatientInsurancesPanel } from "@/components/insurance/patient-insurances-panel";
import { PatientFiscalSection } from "./patient-fiscal-section";
import { PaymentLinkModal } from "./payment-link-modal";
import { usePaymentMethods } from "./use-payment-methods";
import { getPaymentIcon } from "@/lib/payment-icons";
import { PERU_DEPARTAMENTOS, PERU_DEPARTAMENTO_LIST, COUNTRIES } from "@/lib/peru-locations";
import { calculateAge } from "@/lib/export";
import type { ClinicalNote } from "@/types/clinical-notes";
import { SOAP_LABELS, VITALS_FIELDS, type SOAPSection, type Vitals } from "@/types/clinical-notes";
import { TreatmentPlansPanel } from "./treatment-plans-panel";
import { BudgetsPanel } from "./budgets-panel";
import { FertilityBudgetRecordsSection } from "./fertility-budget-records-section";
import { PrescriptionsPanel } from "./prescriptions-panel";
import { ClinicalAttachmentsPanel } from "./clinical-attachments-panel";
import { ConsentsUnifiedPanel } from "./consents-unified-panel";
import { ClinicalFollowupsPanel } from "./clinical-followups-panel";
import { ExamOrdersPanel } from "./exam-orders-panel";
import { DiagnosisHistoryPanel } from "./diagnosis-history-panel";
import {
  PatientInventoryPanel,
  usePatientPharmacySales,
} from "./patient-inventory-panel";
import { ClinicalHistoryModal } from "./clinical-history-modal";
import { RecurringBadge } from "@/components/patients/recurring-badge";
import type { Sex } from "@/lib/growth-curves";
import { TrendingUp, Maximize2 } from "lucide-react";

// Lazy: keeps browser-image-compression out of the drawer's initial bundle.
const BeforeAfterPhotosPanel = dynamic(
  () => import("@/components/dermatology/before-after-photos-panel").then((m) => m.BeforeAfterPhotosPanel),
  { ssr: false }
);

// Mismo patrón para los dos únicos consumidores de recharts del drawer
// (~103 kB gz). Ninguno vive en la pestaña por defecto ("info"): el de
// signos vitales está en "clinical" y las curvas en "growth". Los fallbacks
// son los mismos spinners que cada componente pinta mientras carga sus
// datos, y además el drawer precarga ambos chunks en idle nada más montarse
// (ver useEffect de preloadClinicalCharts), así que en la práctica el
// fallback no llega a verse: cuando el usuario cambia de pestaña el módulo
// ya está en memoria.
const loadVitalsTrendsChart = () => import("./vitals-trends-chart");
const loadGrowthCurvesPanel = () => import("./growth-curves-panel");

const VitalsTrendsChart = dynamic(
  () => loadVitalsTrendsChart().then((m) => m.VitalsTrendsChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const GrowthCurvesPanel = dynamic(
  () => loadGrowthCurvesPanel().then((m) => m.GrowthCurvesPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

// Diálogo de cobro del módulo Tratamientos. Lazy por el mismo motivo que el
// resto de paneles pesados del drawer: solo las orgs con addon fertilidad y
// con un tratamiento en curso llegan a abrirlo.
const TreatmentPaymentDialog = dynamic(
  () =>
    import("@/components/treatments/treatment-payment-dialog").then(
      (m) => m.TreatmentPaymentDialog,
    ),
  { ssr: false },
);

/** Tratamiento del paciente + su dinero ya calculado con `treatmentMoney`. */
interface PatientTreatmentRow {
  id: string;
  title: string;
  treatment_type: string;
  status: TreatmentStatus;
  outcome: TreatmentOutcome | null;
  expected_total: number;
  started_at: string;
  closed_at: string | null;
  doctor_name: string | null;
  money: TreatmentMoney;
}

/** Fecha civil corta ("15 oct") para las líneas de tratamientos cerrados. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
  });
}

interface PatientDrawerProps {
  patient: PatientWithTags;
  onClose: () => void;
  onUpdate: () => void;
}

type DrawerTab = "info" | "history" | "clinical" | "growth" | "budgets" | "finances" | "marketing" | "fiscal" | "insurance" | "dermatology_photos";

type PatientWithSex = PatientWithTags & { sex?: Sex | null };

type AppointmentWithDetails = Appointment & {
  doctors: Doctor;
  services: Service;
  offices: Office;
};

/** `sale_id` existe desde la mig 213 pero aún no en los generated types. */
type PaymentRow = PatientPayment & { sale_id: string | null };

export function PatientDrawer({ patient, onClose, onUpdate }: PatientDrawerProps) {
  const { t } = useLanguage();
  const { organizationId, organization } = useOrganization();
  const { isAdmin, isDoctor } = useOrgRole();
  const { hasAddon } = useOrgAddons();
  const einvoiceConfig = useEInvoiceConfig();
  const { enabled: insuranceEnabled } = useOrgInsurance();
  const { doctorId: currentDoctorId } = useCurrentDoctor();

  // Los charts de recharts ya no entran en el bundle de /patients, pero el
  // usuario que abre un paciente casi siempre acaba pasando por "clinical" o
  // "growth". Los bajamos en cuanto el navegador está ocioso, con el drawer
  // ya pintado, para que el cambio de pestaña sea instantáneo y el fallback
  // de carga no llegue a verse.
  useEffect(() => {
    const preload = () => {
      void loadVitalsTrendsChart();
      void loadGrowthCurvesPanel();
    };
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(preload, 1200);
    return () => clearTimeout(t);
  }, []);

  const [activeTab, setActiveTab] = useState<DrawerTab>("info");
  const patientSex = (patient as PatientWithSex).sex ?? null;
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);

  // ===== PERSONAL INFO STATE =====
  const [infoFirstName, setInfoFirstName] = useState(patient.first_name ?? "");
  const [infoLastName, setInfoLastName] = useState(patient.last_name ?? "");
  const [infoDni, setInfoDni] = useState(patient.dni ?? "");
  const [infoDocType, setInfoDocType] = useState(patient.document_type ?? "DNI");
  const [infoPhone, setInfoPhone] = useState(patient.phone ?? "");
  const [infoEmail, setInfoEmail] = useState(patient.email ?? "");
  const [infoBirthDate, setInfoBirthDate] = useState(patient.birth_date ?? "");
  const [infoDepartamento, setInfoDepartamento] = useState(patient.departamento ?? "");
  const [infoDistrito, setInfoDistrito] = useState(patient.distrito ?? "");
  const [infoIsForeigner, setInfoIsForeigner] = useState(patient.is_foreigner ?? false);
  const [infoNationality, setInfoNationality] = useState(patient.nationality ?? "");
  const [infoNotes, setInfoNotes] = useState(patient.notes ?? "");
  const [infoStatus, setInfoStatus] = useState(patient.status ?? "active");
  const [infoSex, setInfoSex] = useState<Sex | "">((patient as PatientWithSex).sex ?? "");
  const [savingInfo, setSavingInfo] = useState(false);

  // Marketing fields
  const [customField1, setCustomField1] = useState(patient.custom_field_1 ?? "");
  const [customField2, setCustomField2] = useState(patient.custom_field_2 ?? "");
  const [referralSource, setReferralSource] = useState(patient.referral_source ?? "");
  // patient.origin is the structured marketing channel (lookup-backed: TikTok,
  // Instagram, …). Lives next to the free-text referral_source in the
  // Marketing tab so the recepcionista can capture both — the channel for
  // reports + the detail for context. Lookup options are fetched on mount.
  const [marketingOrigin, setMarketingOrigin] = useState(patient.origin ?? "");
  const [originOptions, setOriginOptions] = useState<{ label: string }[]>([]);
  const [savingMarketing, setSavingMarketing] = useState(false);

  // Clinical notes
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [clinicalModalOpen, setClinicalModalOpen] = useState(false);
  const [expandedView, setExpandedView] = useState(false);

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  // Fecha civil de la org (mig 240), no UTC: tras las 19:00 Lima
  // toISOString() proponía la fecha de mañana para el cobro.
  const { today: orgToday } = useOrgToday();
  const [paymentDate, setPaymentDate] = useState(() => orgToday());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentAppointmentId, setPaymentAppointmentId] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  // "Cobrar por link" (Culqi F1) — modal montado solo al abrirse para
  // que el fetch de estado Culqi + historial de links sea lazy.
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  // Mismos métodos que el sidebar del scheduler: lookup 'payment_method'
  // de la org + globales. Lo que se guarda es la label. La org sale del
  // provider, NO de patient.organization_id: la lista de pacientes no trae
  // esa columna en su SELECT, así que llegaba undefined, la query quedaba
  // deshabilitada y el formulario caía siempre al texto libre.
  const paymentMethodOptions = usePaymentMethods(organizationId);

  // Antes el drawer bajaba TODO el historial (citas con 3 joins + pagos) en
  // cuanto se abría, solo para el badge de deuda y los contadores. Ahora al
  // abrir se pide únicamente el resumen agregado (get_patient_summary, mig
  // 202) y el historial completo baja solo al entrar a Historial/Finanzas —
  // mismo patrón lazy que la pestaña Clínico. Ambas queries quedan cacheadas
  // por paciente (staleTime 5 min): reabrir la misma ficha no repite nada.
  const queryClient = useQueryClient();

  const { data: summaryData } = useQuery({
    queryKey: ["patient-summary", patient.id],
    queryFn: async () => {
      const { data } = await createClient().rpc("get_patient_summary", {
        p_patient_id: patient.id,
      });
      const row = (Array.isArray(data) ? data[0] : data) as
        | {
            total_billed: number;
            total_paid: number;
            appointments_count: number;
            completed_count: number;
            first_appointment_date: string | null;
            last_appointment_date: string | null;
            payments_count: number;
          }
        | undefined;
      return row ?? null;
    },
  });

  const needsHistory = activeTab === "history" || activeTab === "finances";
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["patient-history", patient.id],
    enabled: needsHistory,
    queryFn: async () => {
      const supabase = createClient();
      const [apptRes, payRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, appointment_date, start_time, end_time, status, patient_id, notes, doctors(id, full_name, color), services(id, name, base_price), offices(id, name)")
          .eq("patient_id", patient.id)
          .order("appointment_date", { ascending: false })
          .order("start_time", { ascending: false }),
        supabase
          .from("patient_payments")
          // `sale_id` (mig 213) no está en los generated types todavía: se
          // pide explícitamente para poder marcar los pagos cuya venta de
          // farmacia acabó anulada, sin una consulta por pago.
          //
          // `treatment_id` (mig 242) es OBLIGATORIO en `ClinicalPayment`
          // (lib/patient-debt.ts) justamente para que ningún select lo
          // olvide: sin la columna, `undefined == null` no excluiría los
          // cobros del tratamiento y S/ 8 000 de un FIV "pagarían" una
          // ecografía pendiente. `revenue_bucket` + `external_receipt_ref`
          // alimentan el chip de la fila.
          .select("id, patient_id, appointment_id, amount, payment_method, payment_date, notes, organization_id, created_at, sale_id, treatment_id, revenue_bucket, external_receipt_ref")
          .eq("patient_id", patient.id)
          .order("payment_date", { ascending: false }),
      ]);
      return {
        appointments: (apptRes.data as unknown as AppointmentWithDetails[]) ?? [],
        payments: (payRes.data as unknown as PaymentRow[]) ?? [],
      };
    },
  });

  const appointments = historyData?.appointments ?? [];
  const payments = historyData?.payments ?? [];
  const loading = historyLoading;

  // Contexto de cita para "Pagos registrados": las citas ya bajaron en la
  // MISMA query (patient-history) con services(name) incluido, así que basta
  // un índice por id — cero fetches extra y nada por fila. Si la cita del
  // pago ya no existe (FK ON DELETE SET NULL o borrado), el get() devuelve
  // undefined y el pago simplemente no muestra la línea.
  const appointmentById = useMemo(
    () => new Map(appointments.map((a) => [a.id, a])),
    [appointments]
  );

  // Ventas de farmacia del paciente. MISMA query key que PatientInventoryPanel:
  // React Query las dedupe, así que la pestaña Finanzas hace UN solo fetch y
  // el drawer puede marcar los pagos cuya venta fue anulada sin pedir nada
  // extra por pago. Lazy igual que el resto: nada se pide fuera de Finanzas.
  const { data: pharmacySalesData } = usePatientPharmacySales(
    patient.id,
    hasAddon("almacen") && activeTab === "finances"
  );
  const voidedSaleIds = useMemo(
    () =>
      new Set(
        (pharmacySalesData?.sales ?? [])
          .filter((s) => s.status === "anulada")
          .map((s) => s.id)
      ),
    [pharmacySalesData]
  );

  // ===== TRATAMIENTOS (addon fertilidad, migs 242/245) =====
  // Cuenta APARTE de la deuda de citas: el dinero del tratamiento nunca se
  // suma ni se resta de "Citas: saldo pendiente" (mig 243).
  const { active: fertilityActive } = useFertilityAddon();

  const { data: treatmentsData } = useQuery({
    queryKey: ["patient-treatments", patient.id],
    enabled: fertilityActive,
    queryFn: async (): Promise<PatientTreatmentRow[]> => {
      const { data } = await createClient()
        .from("treatments")
        .select(
          "id, title, treatment_type, status, outcome, expected_total, started_at, closed_at, " +
            "doctors(full_name), patient_payments(amount, source, revenue_bucket), " +
            "treatment_external_payments(amount)",
        )
        .eq("patient_id", patient.id)
        .order("started_at", { ascending: false });
      const rows =
        (data as unknown as {
          id: string;
          title: string;
          treatment_type: string;
          status: TreatmentStatus;
          outcome: TreatmentOutcome | null;
          expected_total: number | string;
          started_at: string;
          closed_at: string | null;
          doctors: { full_name: string | null } | { full_name: string | null }[] | null;
          patient_payments:
            | { amount: number | string; source: string | null; revenue_bucket: string | null }[]
            | null;
          treatment_external_payments: { amount: number | string }[] | null;
        }[]) ?? [];
      return rows.map((r) => {
        const doctor = Array.isArray(r.doctors) ? r.doctors[0] : r.doctors;
        return {
          id: r.id,
          title: r.title,
          treatment_type: r.treatment_type,
          status: r.status,
          outcome: r.outcome,
          expected_total: Number(r.expected_total),
          started_at: r.started_at,
          closed_at: r.closed_at,
          doctor_name: doctor?.full_name ?? null,
          // Una fórmula, un número: el dinero del tratamiento SIEMPRE sale
          // de treatmentMoney (espejo del RPC get_treatments_overview).
          money: treatmentMoney(
            r.expected_total,
            r.patient_payments,
            r.treatment_external_payments,
          ),
        };
      });
    },
  });

  const activeTreatment = useMemo(
    () => (treatmentsData ?? []).find((t) => t.status === "in_progress") ?? null,
    [treatmentsData],
  );
  const closedTreatments = useMemo(
    () => (treatmentsData ?? []).filter((t) => t.status !== "in_progress"),
    [treatmentsData],
  );

  // Catálogo de conceptos de la org (mig 242) — lo consume el diálogo de
  // cobro. Solo se pide si hay un tratamiento en curso al que cobrarle.
  const { data: treatmentConcepts = [] } = useQuery({
    queryKey: ["treatment-concepts", organizationId],
    enabled: fertilityActive && !!organizationId && !!activeTreatment,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TreatmentPaymentConcept[]> => {
      const res = await fetch(`/api/treatment-concepts?org_id=${organizationId}`);
      if (!res.ok) return [];
      const json: unknown = await res.json();
      return (
        Array.isArray(json) ? json : ((json as { data?: unknown }).data ?? [])
      ) as TreatmentPaymentConcept[];
    },
  });

  const [treatmentPayOpen, setTreatmentPayOpen] = useState(false);
  // Recepción elige explícitamente a qué se aplica el cobro. Sin esto, el
  // formulario de cita era el único camino y los pagos del FIV acababan
  // colgados de una ecografía.
  const [paymentTarget, setPaymentTarget] = useState<"treatment" | "appointment">(
    "treatment",
  );

  // Planes de sesiones "de antes" (mig 099). Con el addon activo el panel se
  // esconde para no tener dos "Registrar pago" con semánticas distintas en la
  // misma pestaña; si el paciente YA tiene plata en un plan hay que poder
  // verla, así que se ofrece colapsada.
  const { data: legacyPlanCount = 0 } = useQuery({
    queryKey: ["patient-legacy-plans", patient.id],
    enabled: fertilityActive && activeTab === "budgets",
    queryFn: async (): Promise<number> => {
      const { data } = await createClient()
        .from("patient_payments")
        .select("treatment_plan_id")
        .eq("patient_id", patient.id)
        .not("treatment_plan_id", "is", null);
      const rows =
        (data as unknown as { treatment_plan_id: string | null }[]) ?? [];
      return new Set(rows.map((r) => r.treatment_plan_id).filter(Boolean)).size;
    },
  });

  const invalidatePatientData = () => {
    queryClient.invalidateQueries({ queryKey: ["patient-summary", patient.id] });
    queryClient.invalidateQueries({ queryKey: ["patient-history", patient.id] });
    queryClient.invalidateQueries({ queryKey: ["patient-treatments", patient.id] });
  };

  // Fetch clinical notes when clinical tab is selected
  useEffect(() => {
    if (activeTab !== "clinical") return;
    let cancelled = false;
    const fetchNotes = async () => {
      setLoadingNotes(true);
      try {
        const res = await fetch(`/api/clinical-notes?patient_id=${patient.id}`);
        const json = await res.json();
        if (!cancelled) setClinicalNotes(json.data ?? []);
      } catch {
        // silent
      }
      if (!cancelled) setLoadingNotes(false);
    };
    fetchNotes();
    return () => { cancelled = true; };
  }, [activeTab, patient.id]);

  // Sync fields when patient changes
  useEffect(() => {
    setInfoFirstName(patient.first_name ?? "");
    setInfoLastName(patient.last_name ?? "");
    setInfoDni(patient.dni ?? "");
    setInfoDocType(patient.document_type ?? "DNI");
    setInfoPhone(patient.phone ?? "");
    setInfoEmail(patient.email ?? "");
    setInfoBirthDate(patient.birth_date ?? "");
    setInfoDepartamento(patient.departamento ?? "");
    setInfoDistrito(patient.distrito ?? "");
    setInfoIsForeigner(patient.is_foreigner ?? false);
    setInfoNationality(patient.nationality ?? "");
    setInfoNotes(patient.notes ?? "");
    setInfoStatus(patient.status ?? "active");
    setInfoSex((patient as PatientWithSex).sex ?? "");
    setCustomField1(patient.custom_field_1 ?? "");
    setCustomField2(patient.custom_field_2 ?? "");
    setReferralSource(patient.referral_source ?? "");
    setMarketingOrigin(patient.origin ?? "");
  }, [patient]);

  // Fetch active 'origin' lookup values (org-scoped) once for the Marketing
  // tab dropdown. Matches the convention used by the appointment form: the
  // select binds value={label} and stores the label string into patients.origin.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("lookup_values")
      .select("label, display_order, lookup_categories!inner(slug)")
      .eq("lookup_categories.slug", "origin")
      .eq("is_active", true)
      .or(`organization_id.is.null,organization_id.eq.${patient.organization_id}`)
      .order("display_order")
      .then(({ data }) => {
        setOriginOptions(
          (data ?? []).map((v: { label: string }) => ({ label: v.label }))
        );
      });
  }, [patient.organization_id]);

  // Financial calculations — del RPC agregado (get_patient_summary).
  // Desde la mig 219 total_billed usa el precio REAL de cada cita
  // — GREATEST(0, COALESCE(price_snapshot, services.base_price) −
  // discount_amount) de las no canceladas — y no el precio de catálogo:
  // antes, una cita de S/ 200 con precio personalizado S/ 180 totalmente
  // pagada dejaba aquí S/ 20 de deuda fantasma. total_paid suma solo los
  // pagos con source='clinical' (mig 216). Misma fórmula que
  // lib/patient-debt.ts, que usan la lista de pacientes y el sidebar.
  const totalServiceCost = Number(summaryData?.total_billed ?? 0);
  const totalPaid = Number(summaryData?.total_paid ?? 0);
  // Clamp a 0, igual que `patientPendingBalance` (lib/patient-debt.ts) y que
  // el RPC: un saldo a FAVOR no es deuda. Sin el clamp, un anticipo mayor que
  // lo facturado pintaba "Saldo pendiente S/ -300" en rojo. No se usa
  // `patientPendingBalance` directamente porque aquí los totales vienen ya
  // agregados del RPC (las citas y los pagos no bajan hasta abrir Historial).
  const pendingBalance = Math.max(0, totalServiceCost - totalPaid);

  // ===== HANDLERS =====

  const handleSaveInfo = async () => {
    if (!infoFirstName.trim() || !infoLastName.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    setSavingInfo(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("patients")
      .update({
        first_name: infoFirstName.trim(),
        last_name: infoLastName.trim(),
        dni: infoDni.trim() || null,
        document_type: infoDocType,
        phone: infoPhone.trim() || null,
        email: infoEmail.trim() || null,
        birth_date: infoBirthDate || null,
        departamento: infoIsForeigner ? null : (infoDepartamento || null),
        distrito: infoIsForeigner ? null : (infoDistrito || null),
        is_foreigner: infoIsForeigner,
        nationality: infoIsForeigner ? (infoNationality || null) : null,
        notes: infoNotes.trim() || null,
        status: infoStatus,
        sex: infoSex || null,
      } as never)
      .eq("id", patient.id);

    setSavingInfo(false);
    if (error) {
      console.error("[patient-drawer] update error:", error);
      if (error.code === "23505") {
        toast.error("Este DNI ya está registrado en otro paciente");
      } else if (error.code === "42703") {
        toast.error(
          `Columna faltante en la base de datos: ${error.message}. Aplica las migraciones pendientes.`
        );
      } else if (error.code === "23514") {
        toast.error(
          `Valor no permitido: ${error.message}. Revisa los campos del formulario.`
        );
      } else {
        toast.error(
          `${t("patients.save_error")}: ${error.message || error.code || "desconocido"}`
        );
      }
      return;
    }
    toast.success(t("patients.save_success"));
    onUpdate();
  };

  const handleAddTag = async (tagValue: string) => {
    if (!tagValue.trim()) return;
    setAddingTag(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("patient_tags")
      .insert({ patient_id: patient.id, tag: tagValue.trim(), organization_id: organizationId });

    setAddingTag(false);
    if (error) {
      toast.error(t("patients.save_error"));
      return;
    }
    setNewTag("");
    onUpdate();
  };

  const handleRemoveTag = async (tagId: string) => {
    const supabase = createClient();
    await supabase.from("patient_tags").delete().eq("id", tagId);
    onUpdate();
  };

  const handleSaveMarketing = async () => {
    setSavingMarketing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("patients")
      .update({
        custom_field_1: customField1 || null,
        custom_field_2: customField2 || null,
        referral_source: referralSource || null,
        origin: marketingOrigin || null,
      })
      .eq("id", patient.id);

    setSavingMarketing(false);
    if (error) {
      toast.error(t("patients.save_error"));
      return;
    }
    toast.success(t("patients.save_success"));
    onUpdate();
  };

  const handleSavePayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    setSavingPayment(true);
    const supabase = createClient();
    const { error } = await supabase.from("patient_payments").insert({
      organization_id: organizationId,
      patient_id: patient.id,
      appointment_id: paymentAppointmentId || null,
      amount: Number(paymentAmount),
      payment_method: paymentMethod || null,
      notes: paymentNotes || null,
      payment_date: paymentDate,
    });

    setSavingPayment(false);
    if (error) {
      toast.error(t("patients.payment_save_error"));
      return;
    }
    toast.success(t("patients.payment_save_success"));
    setShowPaymentForm(false);
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentNotes("");
    setPaymentAppointmentId("");
    invalidatePatientData();
  };

  const showGrowthTab = hasAddon("growth_curves") && (isAdmin || !!currentDoctorId);
  // Dermatology "Antes y Después" gallery — read-only here (uploads happen
  // from the appointment's clinical-history modal). Visible to clinical
  // roles only, same as the clinical tab.
  const showDermatologyTab = hasAddon("dermatology") && (isAdmin || !!currentDoctorId);
  // Misma condición que gobierna la pestaña Clínico. También decide si el
  // enlace cruzado de Finanzas ("Ver N aplicaciones en Clínico") existe: una
  // recepcionista no tiene esa pestaña y el enlace la dejaría en blanco.
  const canSeeClinical = isAdmin || !!currentDoctorId;
  const tabs: { key: DrawerTab; label: string; icon: typeof Clock }[] = [
    { key: "info", label: "Datos", icon: Edit2 },
    { key: "history", label: t("patients.tab_history"), icon: Clock },
    // Clinical tab only visible for doctors and admins, not receptionists
    ...(canSeeClinical ? [{ key: "clinical" as DrawerTab, label: "Clínico", icon: Stethoscope }] : []),
    ...(showGrowthTab ? [{ key: "growth" as DrawerTab, label: "Crecimiento", icon: TrendingUp }] : []),
    ...(showDermatologyTab ? [{ key: "dermatology_photos" as DrawerTab, label: "Antes y Después", icon: Camera }] : []),
    { key: "budgets", label: "Presupuestos", icon: Wallet },
    { key: "finances", label: t("patients.tab_finances"), icon: DollarSign },
    { key: "marketing", label: t("patients.tab_marketing"), icon: Megaphone },
    ...(insuranceEnabled
      ? [{ key: "insurance" as DrawerTab, label: "Seguros", icon: ShieldCheck }]
      : []),
    // Tab fiscal solo aparece si la org activó facturación electrónica.
    // El rol doctor no lo ve — los datos fiscales son administrativos
    // (necesarios para emitir comprobantes), fuera del scope clínico.
    ...(einvoiceConfig.connected && !isDoctor
      ? [{ key: "fiscal" as DrawerTab, label: "Fiscal", icon: Receipt }]
      : []),
  ];

  return (
    <div className="w-full border-l border-border bg-card md:w-[480px] lg:w-[580px] shrink-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        {/* A 390px el bloque de identidad (avatar + nombre + DNI/edad/estado)
            se pasaba del borde derecho y empujaba los botones fuera de la
            pantalla: los flex items traen `min-width:auto`, así que nada
            podía encogerse. Con `min-w-0` + wrap el texto reparte líneas y
            el avatar y las acciones se quedan fijos donde tocan. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{
                backgroundColor: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af",
              }}
            >
              {patient.first_name[0]}{patient.last_name[0]}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words text-base font-bold">
                  {patient.first_name} {patient.last_name}
                </h3>
                {patient.is_recurring && <RecurringBadge size="xs" />}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {patient.dni && <span>{patient.document_type ?? "DNI"}: {patient.dni}</span>}
                {patient.birth_date && (() => {
                  const age = calculateAge(patient.birth_date);
                  return age != null ? <span className="font-medium">{age} años</span> : null;
                })()}
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: (PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af") + "20",
                    color: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af",
                  }}
                >
                  {t(`patients.${patient.status}`)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Vista expandida — pensada para escritorio (modal de dos
                columnas); en móvil el drawer YA ocupa toda la pantalla. */}
            <button
              onClick={() => setExpandedView(true)}
              className="hidden rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:block"
              title="Vista expandida"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            {/* Cerrar. En móvil el drawer tapa la lista de pacientes y el
                gesto "atrás" de Android sale de la página entera, así que
                la acción se lee como "volver" (flecha) y el área tocable
                sube a 44 px con un pseudo-elemento — el icono no se mueve
                ni un pixel en escritorio. */}
            <button
              onClick={onClose}
              aria-label="Volver a la lista de pacientes"
              className="relative rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] md:before:hidden"
            >
              <ArrowLeft className="h-5 w-5 md:hidden" />
              <X className="hidden h-4 w-4 md:block" />
            </button>
          </div>
        </div>

        {/* Contact info */}
        {/* `break-all` en el email: un correo largo es una sola "palabra"
            y sin esto se salía por la derecha aunque el contenedor envuelva. */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {patient.phone && (
            <span className="flex min-w-0 items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" /> {patient.phone}
            </span>
          )}
          {patient.email && (
            <span className="flex min-w-0 max-w-full items-center gap-1">
              <Mail className="h-3 w-3 shrink-0" />{" "}
              <span className="min-w-0 break-all">{patient.email}</span>
            </span>
          )}
        </div>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {patient.patient_tags.map((tag) => (
            <span
              key={tag.id}
              className="group flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
            >
              {tag.tag}
              <button
                onClick={() => handleRemoveTag(tag.id)}
                className="hidden group-hover:inline-block"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {/* Quick add common tags */}
          <div className="relative">
            <button
              onClick={() => setTagMenuOpen(!tagMenuOpen)}
              className="flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Tag className="h-3 w-3" />
              <Plus className="h-3 w-3" />
            </button>
            {tagMenuOpen && (
              <>
                <div className="fixed inset-0 z-[5]" onClick={() => setTagMenuOpen(false)} />
                <div className="absolute left-0 top-full z-10 mt-1 rounded-lg border border-border bg-card p-2 shadow-xl min-w-[160px]">
                  {COMMON_PATIENT_TAGS.filter(
                    (tag) => !patient.patient_tags.some((pt) => pt.tag === tag)
                  ).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => { handleAddTag(tag); setTagMenuOpen(false); }}
                      disabled={addingTag}
                      className="block w-full rounded px-2 py-1 text-left text-xs text-foreground hover:bg-accent transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                  <div className="mt-1 border-t border-border pt-1">
                    <div className="flex gap-1">
                      <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder={t("patients.add_tag")}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag(newTag);
                            setTagMenuOpen(false);
                          }
                        }}
                      />
                      <button
                        onClick={() => { handleAddTag(newTag); setTagMenuOpen(false); }}
                        disabled={addingTag || !newTag.trim()}
                        className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Debt alert + tratamiento en curso. Van juntos y separados: son
            DOS cuentas distintas (mig 243) y el saldo de citas no incluye
            nada del tratamiento. */}
        {(pendingBalance > 0 || activeTreatment) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pendingBalance > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {t("patients.pending_balance")}: S/. {pendingBalance.toFixed(2)}
              </div>
            )}
            {activeTreatment && (
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Activity className="h-3.5 w-3.5 shrink-0" />
                {activeTreatment.treatment_type} en curso ·{" "}
                {activeTreatment.money.progressPercent}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      {/* Móvil: tira de "pills" en vez del subrayado apretado. Cada tab es
          un objetivo táctil de 40px con px propio, la tira hace snap para
          que ninguno quede cortado a medias al soltar el dedo, la barra de
          scroll se oculta (en iOS es un adorno que además tapa contenido) y
          en su lugar un degradado a la derecha avisa de que hay más — el
          `pr-8` iguala la anchura del fundido, así que al llegar al final
          el último tab queda entero y nítido. Sin JS: todo es CSS.
          El layout de "pills" sigue siendo solo de móvil, pero las pistas
          de scroll (ocultar la barra nativa + degradado de aviso) valen en
          TODOS los breakpoints: con addons activos la tira pasa de 9 tabs y
          en escritorio también desbordaba — enseñaba la barra nativa fea
          justo debajo del subrayado y, como los tabs eran `md:flex-1`
          (crecen, nunca encogen), no había manera de que cupieran. Con
          `md:flex-none` cada tab ocupa su texto y la tira scrollea limpia.
          El `pr-8` reserva el ancho del fundido, así que cuando NO hay
          desbordamiento el último tab queda entero y nítido. */}
      <div className="border-b border-border">
        <div
          className={cn(
            "flex overflow-x-auto pr-8",
            "max-md:snap-x max-md:snap-mandatory max-md:gap-1.5 max-md:py-2 max-md:pl-3",
            "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "[mask-image:linear-gradient(to_right,#000_calc(100%_-_2rem),transparent)]",
            "[-webkit-mask-image:linear-gradient(to_right,#000_calc(100%_-_2rem),transparent)]"
          )}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center justify-center gap-1.5 text-xs font-medium transition-colors shrink-0",
                "max-md:h-10 max-md:snap-start max-md:whitespace-nowrap max-md:rounded-full max-md:px-3.5",
                "md:flex-none md:whitespace-nowrap md:border-b-2 md:px-3 md:py-2.5",
                activeTab === tab.key
                  ? "text-primary max-md:bg-primary/10 md:border-primary"
                  : "text-muted-foreground hover:text-foreground md:border-transparent"
              )}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {/* `overflow-y-auto` a solas hace que overflow-x compute a `auto`, así
          que cualquier campo pasado de ancho abría una barra lateral fea en
          la ficha. Los anchos ya están saneados arriba; en móvil se clava a
          `hidden` y las tablas anchas siguen scrolleando en su wrapper. */}
      <div className="flex-1 overflow-y-auto p-4 max-md:overflow-x-hidden">

        {/* ===== INFO TAB (EDIT PATIENT) ===== */}
        {activeTab === "info" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Edita los datos personales del paciente.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.first_name")} *</label>
                <input
                  value={infoFirstName}
                  onChange={(e) => setInfoFirstName(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Juan"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.last_name")} *</label>
                <input
                  value={infoLastName}
                  onChange={(e) => setInfoLastName(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Pérez"
                />
              </div>
            </div>

            {/* Document type + DNI */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("patients.dni")}</label>
              <div className="flex gap-2">
                <select
                  value={infoDocType}
                  onChange={(e) => setInfoDocType(e.target.value as "DNI" | "CE" | "Pasaporte")}
                  className="w-[100px] shrink-0 rounded-lg border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="Pasaporte">Pasaporte</option>
                </select>
                <input
                  value={infoDni}
                  onChange={(e) => setInfoDni(e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="12345678"
                />
              </div>
            </div>

            {/* Fecha de nacimiento */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-2">
                Fecha de nacimiento
                {infoBirthDate && (() => {
                  const age = calculateAge(infoBirthDate);
                  return age != null ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {age} años
                    </span>
                  ) : null;
                })()}
              </label>
              <input
                type="date"
                value={infoBirthDate}
                onChange={(e) => setInfoBirthDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            {/* Sexo biológico (required for WHO growth curves) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Sexo biológico</label>
              <select
                value={infoSex}
                onChange={(e) => setInfoSex(e.target.value as Sex | "")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">-- Seleccionar --</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.phone")}</label>
                <input
                  value={infoPhone}
                  onChange={(e) => setInfoPhone(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="+51 999 999 999"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.email")}</label>
                <input
                  type="email"
                  value={infoEmail}
                  onChange={(e) => setInfoEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="paciente@email.com"
                />
              </div>
            </div>

            {/* Extranjero checkbox */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="drawer_is_foreigner"
                checked={infoIsForeigner}
                onChange={(e) => setInfoIsForeigner(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
              />
              <label htmlFor="drawer_is_foreigner" className="text-xs font-medium cursor-pointer">
                Extranjero
              </label>
            </div>

            {/* Foreigner: Country select */}
            {infoIsForeigner && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">País de origen</label>
                <select
                  value={infoNationality}
                  onChange={(e) => setInfoNationality(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  <option value="">-- Seleccionar país --</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Departamento & Distrito (only for non-foreigners) */}
            {!infoIsForeigner && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Departamento</label>
                  <select
                    value={infoDepartamento}
                    onChange={(e) => {
                      setInfoDepartamento(e.target.value);
                      setInfoDistrito("");
                    }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  >
                    <option value="">-- Departamento --</option>
                    {PERU_DEPARTAMENTO_LIST.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Distrito</label>
                  <select
                    value={infoDistrito}
                    onChange={(e) => setInfoDistrito(e.target.value)}
                    disabled={!infoDepartamento}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    <option value="">-- Distrito --</option>
                    {(PERU_DEPARTAMENTOS[infoDepartamento] ?? []).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Estado</label>
              <select
                value={infoStatus}
                onChange={(e) => setInfoStatus(e.target.value as "active" | "inactive")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="active">{t("patients.active")}</option>
                <option value="inactive">{t("patients.inactive")}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("patients.notes")}</label>
              <textarea
                value={infoNotes}
                onChange={(e) => setInfoNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                placeholder="Observaciones internas..."
              />
            </div>

            <button
              onClick={handleSaveInfo}
              disabled={savingInfo}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {savingInfo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("common.save")}
            </button>
          </div>
        )}

        {/* ===== HISTORY TAB ===== */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : appointments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("patients.history_empty")}
              </p>
            ) : (
              appointments.map((appt) => {
                const statusColor = APPOINTMENT_STATUS_COLORS[appt.status] ?? "#9ca3af";
                const StatusIcon =
                  appt.status === "completed"
                    ? CheckCircle2
                    : appt.status === "cancelled"
                    ? XCircle
                    : appt.status === "no_show"
                    ? AlertCircle
                    : AlertCircle;

                return (
                  <div
                    key={appt.id}
                    className="rounded-lg border border-border p-3"
                    style={{ borderLeftWidth: "4px", borderLeftColor: statusColor }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusIcon className="h-4 w-4 shrink-0" style={{ color: statusColor }} />
                        <span className="text-xs font-semibold">{appt.appointment_date.split("-").reverse().join("/")}</span>
                        <span className="text-xs text-muted-foreground">
                          {appt.start_time.slice(0, 5)} — {appt.end_time.slice(0, 5)}
                        </span>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: statusColor + "20",
                          color: statusColor,
                        }}
                      >
                        {t(`scheduler.status_${appt.status}`)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground [&_p]:break-words">
                      <p>{appt.services?.name} — {appt.offices?.name}</p>
                      <p className="flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: appt.doctors?.color }}
                        />
                        {appt.doctors?.full_name}
                      </p>
                      <p className="mt-0.5 font-medium text-foreground">
                        S/. {Number(appt.services?.base_price ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ===== CLINICAL TAB ===== */}
        {activeTab === "clinical" && (
          <div className="space-y-3">
            {/* Expand button */}
            <div className="flex justify-end">
              <button
                onClick={() => setClinicalModalOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Ver en grande
              </button>
            </div>
            {loadingNotes ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : clinicalNotes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin notas clínicas registradas
              </p>
            ) : (
              clinicalNotes.map((cn_note) => {
                const isExpanded = expandedNote === cn_note.id;
                const doctorInfo = (cn_note as ClinicalNote & { doctors?: { full_name: string; color: string } }).doctors;
                const hasVitals = VITALS_FIELDS.some((f) => cn_note.vitals?.[f.key as keyof Vitals] != null);

                return (
                  <div
                    key={cn_note.id}
                    className={cn(
                      "rounded-lg border border-border overflow-hidden transition-all",
                      cn_note.is_signed && "border-l-4 border-l-success-500"
                    )}
                  >
                    {/* Header — clickable to expand */}
                    <button
                      type="button"
                      onClick={() => setExpandedNote(isExpanded ? null : cn_note.id)}
                      className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Stethoscope className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="shrink-0 text-xs font-semibold">
                          {new Date(cn_note.created_at).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {doctorInfo && (
                          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: doctorInfo.color }}
                            />
                            <span className="truncate">{doctorInfo.full_name}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cn_note.is_signed && (
                          <Lock className="h-3 w-3 text-emerald-500" />
                        )}
                        {cn_note.diagnosis_code && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium">
                            {cn_note.diagnosis_code}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-border px-3 py-3 space-y-3">
                        {/* SOAP sections */}
                        {(Object.keys(SOAP_LABELS) as SOAPSection[]).map((section) => {
                          const content = cn_note[section];
                          if (!content) return null;
                          const { letter, label } = SOAP_LABELS[section];
                          return (
                            <div key={section} className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white",
                                    section === "subjective" && "bg-blue-500",
                                    section === "objective" && "bg-emerald-500",
                                    section === "assessment" && "bg-amber-500",
                                    section === "plan" && "bg-purple-500"
                                  )}
                                >
                                  {letter}
                                </span>
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                                  {label}
                                </span>
                              </div>
                              {/* `break-words`: las notas clínicas se pegan
                                  desde otros sistemas y una URL o un código
                                  largo sin espacios se salía por la derecha. */}
                              <p className="text-xs text-foreground pl-[22px] whitespace-pre-wrap break-words">
                                {content}
                              </p>
                            </div>
                          );
                        })}

                        {/* Diagnósticos (lista completa, migración 124) */}
                        {(() => {
                          const list = (cn_note.diagnoses && cn_note.diagnoses.length > 0)
                            ? cn_note.diagnoses.slice().sort((a, b) => {
                                if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
                                return a.position - b.position;
                              })
                            : cn_note.diagnosis_code
                              ? [{ code: cn_note.diagnosis_code, label: cn_note.diagnosis_label ?? cn_note.diagnosis_code, is_primary: true }]
                              : [];
                          if (list.length === 0) return null;
                          return (
                            <div className="pl-[22px]">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">
                                Diagnóstico{list.length > 1 ? "s" : ""}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {list.map((d, i) => (
                                  <span
                                    key={d.code}
                                    className={cn(
                                      "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                                      i === 0
                                        ? "border-primary/40 bg-primary/10 text-primary"
                                        : "border-border bg-muted/40 text-foreground"
                                    )}
                                  >
                                    <span className="shrink-0 font-mono font-semibold">{d.code}</span>
                                    <span className="min-w-0 break-words opacity-80">{d.label}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Vitals summary */}
                        {hasVitals && (
                          <div className="pl-[22px]">
                            <div className="flex items-center gap-1 mb-1">
                              <Heart className="h-3 w-3 text-red-500" />
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Signos Vitales</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                              {VITALS_FIELDS.filter((f) => cn_note.vitals?.[f.key as keyof Vitals] != null).map((f) => (
                                <div key={f.key} className="rounded bg-muted/40 px-1.5 py-1 text-center">
                                  <p className="text-[9px] text-muted-foreground">{f.label}</p>
                                  <p className="text-[11px] font-semibold">
                                    {cn_note.vitals[f.key as keyof Vitals]} <span className="text-[9px] font-normal text-muted-foreground">{f.unit}</span>
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Signed date */}
                        {cn_note.is_signed && cn_note.signed_at && (
                          <p className="text-[10px] text-muted-foreground/70 pl-[22px]">
                            Firmada el {new Date(cn_note.signed_at).toLocaleDateString("es-PE", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* ── Clinical History Panels ── */}
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <VitalsTrendsChart patientId={patient.id} clinicalNotes={clinicalNotes} />
              <DiagnosisHistoryPanel patientId={patient.id} clinicalNotes={clinicalNotes} />
              <TreatmentPlansPanel patientId={patient.id} canEdit={false} />
              <PrescriptionsPanel patientId={patient.id} canEdit={false} />
              {/* Justo debajo de las recetas: "recetado → aplicado" se lee
                  de corrido, que es la pregunta real del médico. */}
              <PatientInventoryPanel
                patientId={patient.id}
                scope="clinical"
                variant="compact"
                onNavigateToCounterpart={() => setActiveTab("finances")}
              />
              <ExamOrdersPanel patientId={patient.id} canEdit={false} />
              <ClinicalFollowupsPanel patientId={patient.id} canEdit={false} />
              <ClinicalAttachmentsPanel patientId={patient.id} canEdit={false} />
              <ConsentsUnifiedPanel
                patientId={patient.id}
                patientName={`${patient.first_name} ${patient.last_name}`.trim()}
                doctorId={currentDoctorId}
              />
            </div>
          </div>
        )}

        {/* ===== GROWTH TAB ===== */}
        {activeTab === "growth" && (
          <GrowthCurvesPanel
            patientId={patient.id}
            birthDate={patient.birth_date ?? null}
            sex={patientSex}
            onRequestSexUpdate={() => setActiveTab("info")}
          />
        )}

        {/* ===== BUDGETS TAB ===== */}
        {activeTab === "budgets" && (
          <div className="space-y-4">
            <FertilityBudgetRecordsSection
              patientId={patient.id}
              patientFullName={`${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()}
            />
            <PatientPlansSection
              patientId={patient.id}
              canEdit={isAdmin || !!currentDoctorId}
              hideBehindDisclosure={fertilityActive}
              legacyPlanCount={legacyPlanCount}
            />
          </div>
        )}

        {/* ===== FINANCES TAB ===== */}
        {activeTab === "finances" && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Summary cards — prefijo "Citas:" a propósito: estos tres
                    números son SOLO la cuenta de consultas. Ni el tratamiento
                    (mig 243) ni el POS de farmacia (mig 213) entran aquí. */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border p-2 sm:p-3 text-center">
                    <p className="text-[10px] uppercase text-muted-foreground">Citas: {t("patients.service_price")}</p>
                    <p className="mt-1 text-sm sm:text-base font-bold">S/. {totalServiceCost.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2 sm:p-3 text-center">
                    <p className="text-[10px] uppercase text-muted-foreground">Citas: {t("patients.total_paid")}</p>
                    <p className="mt-1 text-sm sm:text-base font-bold text-success-600">S/. {totalPaid.toFixed(2)}</p>
                  </div>
                  <div className={cn(
                    "rounded-lg border p-2 sm:p-3 text-center",
                    pendingBalance > 0 ? "border-red-500/30 bg-red-500/5" : "border-border"
                  )}>
                    <p className="text-[10px] uppercase text-muted-foreground">Citas: {t("patients.pending_balance")}</p>
                    <p className={cn(
                      "mt-1 text-sm sm:text-base font-bold",
                      pendingBalance > 0 ? "text-red-600" : "text-foreground"
                    )}>
                      S/. {pendingBalance.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* ── Tratamiento en curso (addon fertilidad) ──
                    Bloque propio, debajo de las cards de citas: es otra
                    cuenta. Todo el dinero viene de `treatmentMoney`. */}
                {fertilityActive && activeTreatment && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <Activity className="h-3.5 w-3.5" />
                        Tratamiento en curso
                      </p>
                      <Link
                        href={`/tratamientos/${activeTreatment.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Ver <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <p className="mt-1.5 text-xs">
                      {[
                        activeTreatment.treatment_type,
                        activeTreatment.doctor_name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatCurrency(activeTreatment.money.covered)} pagado de{" "}
                      {formatCurrency(activeTreatment.money.expectedTotal)} · por
                      cobrar {formatCurrency(activeTreatment.money.pending)}
                    </p>
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-500/15"
                      role="progressbar"
                      aria-valuenow={activeTreatment.money.progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${activeTreatment.money.progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setTreatmentPayOpen(true)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar pago al tratamiento
                      </button>
                    </div>
                  </div>
                )}

                {/* Cerrados: una línea por tratamiento, sin dinero — la
                    historia completa vive en /tratamientos/[id]. */}
                {fertilityActive && closedTreatments.length > 0 && (
                  <div className="space-y-1">
                    {closedTreatments.map((tr) => (
                      <Link
                        key={tr.id}
                        href={`/tratamientos/${tr.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground hover:bg-accent"
                      >
                        <span className="truncate">
                          Tratamiento cerrado ·{" "}
                          {[
                            tr.treatment_type,
                            tr.outcome ? TREATMENT_OUTCOME_LABELS[tr.outcome] : null,
                            shortDate(tr.closed_at),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}

                {/* Add payment + Cobrar por link (Culqi F1). Lado a lado
                    porque son la misma decisión con distinto canal:
                    registrar dinero que ya entró vs. cobrar a distancia. */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowPaymentForm(!showPaymentForm)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("patients.add_payment")}
                  </button>
                  <button
                    onClick={() => setPaymentLinkOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Cobrar por link
                  </button>
                </div>

                {showPaymentForm && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                    {/* ¿A qué corresponde? Con un tratamiento abierto, este
                        formulario cuelga el pago de una CITA — y recepción
                        acababa cargando el FIV a una ecografía. La pregunta
                        va primero y por defecto apunta al tratamiento. */}
                    {activeTreatment && (
                      <fieldset className="space-y-1.5">
                        <legend className="text-xs font-medium">
                          ¿A qué corresponde?
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/10">
                            <input
                              type="radio"
                              name="payment-target"
                              className="accent-emerald-600"
                              checked={paymentTarget === "treatment"}
                              onChange={() => setPaymentTarget("treatment")}
                            />
                            <span className="min-w-0 truncate font-medium">
                              Tratamiento {activeTreatment.title}
                            </span>
                          </label>
                          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                            <input
                              type="radio"
                              name="payment-target"
                              className="accent-primary"
                              checked={paymentTarget === "appointment"}
                              onChange={() => setPaymentTarget("appointment")}
                            />
                            <span className="font-medium">Cita</span>
                          </label>
                        </div>
                      </fieldset>
                    )}

                    {activeTreatment && paymentTarget === "treatment" ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          Los cobros del tratamiento llevan concepto y se
                          registran en Tratamientos, no contra una cita.
                        </p>
                        <button
                          onClick={() => setTreatmentPayOpen(true)}
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Registrar pago al tratamiento
                        </button>
                      </div>
                    ) : (
                    <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">{t("patients.payment_amount")} *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">{t("patients.payment_date")}</label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                    </div>
                    {/* Método de pago: chips del lookup, MISMO patrón y
                        misma escritura (pm.label) que el sidebar del
                        scheduler. Antes era un input de texto libre y por
                        eso el arqueo de Caja veía "efectivo", "EFEC." y
                        "Efectivo" como tres medios distintos. Sigue
                        pudiendo quedar vacío (volver a tocar el chip lo
                        deselecciona) para no romper el flujo de quien
                        registra un pago sin saber cómo entró. */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("patients.payment_method")}</label>
                      {paymentMethodOptions.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {paymentMethodOptions.map((pm) => {
                            const Icon = getPaymentIcon(pm.icon);
                            return (
                              <button
                                key={pm.id}
                                type="button"
                                onClick={() =>
                                  setPaymentMethod((m) => (m === pm.label ? "" : pm.label))
                                }
                                className={cn(
                                  "flex min-h-[2.25rem] items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] font-medium transition-all",
                                  paymentMethod === pm.label
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                                )}
                              >
                                <Icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">{pm.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        // Sin lookups configurados el formulario no puede
                        // quedarse mudo: se cae al texto libre de siempre.
                        <input
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                          placeholder="Efectivo, Tarjeta, etc."
                        />
                      )}
                    </div>
                    {/* Motivo: el estado paymentNotes existía y se guardaba
                        en el insert, pero ningún input lo renderizaba — todo
                        pago del drawer salía sin nota. Opcional a propósito:
                        obligarlo rompería el flujo rápido de recepción. */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Motivo / referencia (opcional)</label>
                      <input
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        placeholder="Adelanto, pago a cuenta, nro. de operación…"
                      />
                    </div>
                    {appointments.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Cita asociada</label>
                        <select
                          value={paymentAppointmentId}
                          onChange={(e) => setPaymentAppointmentId(e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        >
                          <option value="">-- Ninguna --</option>
                          {appointments
                            .filter((a) => a.status !== "cancelled")
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.appointment_date.split("-").reverse().join("/")} — {a.services?.name} — S/. {Number(a.services?.base_price ?? 0).toFixed(2)}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowPaymentForm(false)}
                        className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        onClick={handleSavePayment}
                        disabled={savingPayment || !paymentAmount || Number(paymentAmount) <= 0}
                        className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        {savingPayment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        {t("common.save")}
                      </button>
                    </div>
                    </>
                    )}
                  </div>
                )}

                {/* Payments list */}
                {payments.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pagos registrados
                    </h4>
                    {payments.map((p) => {
                      // Cita a la que se aplicó el pago, si sigue existiendo.
                      const paidAppointment = p.appointment_id
                        ? appointmentById.get(p.appointment_id)
                        : undefined;
                      return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="min-w-0 [&_p]:break-words">
                          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                            S/. {Number(p.amount).toFixed(2)}
                            {/* El dinero sigue en la lista (el pago existió),
                                pero su venta se deshizo: sin esta marca el
                                total de la ficha y el de Farmacia no cuadran
                                y nadie sabe por qué. */}
                            {p.sale_id && voidedSaleIds.has(p.sale_id) && (
                              <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 dark:text-red-400">
                                Venta anulada
                              </span>
                            )}
                            {/* Cobro de tratamiento (mig 242): NO cancela
                                deuda de citas, así que la fila tiene que
                                decirlo. El bucket es información de gestión
                                — solo para quien ve honorarios. */}
                            {p.treatment_id && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                                Tratamiento
                                {(isAdmin || isDoctor) && p.revenue_bucket
                                  ? ` · ${REVENUE_BUCKET_LABELS[p.revenue_bucket as RevenueBucket]}`
                                  : ""}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {p.payment_date.split("-").reverse().join("/")} {p.payment_method && `• ${p.payment_method}`}
                          </p>
                          {/* Misma línea contextual que "Farmacia NV-…": a qué
                              cita se aplicó el pago. Si el servicio ya no está
                              (cita sin servicio), la fecha sola sigue ubicando. */}
                          {paidAppointment && !p.treatment_id && (
                            <p className="text-[10px] text-muted-foreground">
                              Cita: {[
                                paidAppointment.services?.name,
                                paidAppointment.appointment_date.split("-").reverse().join("/"),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          {p.notes && (
                            <p className="text-[10px] text-muted-foreground">{p.notes}</p>
                          )}
                        </div>
                        <Coins className="h-4 w-4 shrink-0 text-emerald-500" />
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Al FINAL de Finanzas y separado: no empuja el botón de
                    registrar pago, que es la acción que trae a la gente aquí. */}
                <div className="border-t border-border pt-4">
                  <PatientInventoryPanel
                    patientId={patient.id}
                    scope="sales"
                    variant="compact"
                    onNavigateToCounterpart={
                      canSeeClinical ? () => setActiveTab("clinical") : undefined
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== MARKETING TAB ===== */}
        {activeTab === "marketing" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.custom_field_1")}</label>
                <input
                  value={customField1}
                  onChange={(e) => setCustomField1(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Campo personalizado..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.custom_field_2")}</label>
                <input
                  value={customField2}
                  onChange={(e) => setCustomField2(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Campo personalizado..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("scheduler.origin")}</label>
                <select
                  value={marketingOrigin}
                  onChange={(e) => setMarketingOrigin(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  <option value="">--</option>
                  {/* El origen guardado puede venir de un import CSV, de la
                      reserva pública ("Reserva en línea") o de un lookup que la
                      clínica desactivó. Sin esta opción extra el select se ve
                      vacío aunque la ficha SÍ tenga origen, y la doctora creería
                      que el dato se perdió. */}
                  {marketingOrigin &&
                    !originOptions.some((o) => o.label === marketingOrigin) && (
                      <option value={marketingOrigin}>{marketingOrigin}</option>
                    )}
                  {originOptions.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.referral_source")}</label>
                <input
                  value={referralSource}
                  onChange={(e) => setReferralSource(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Recomendación de Dra. X, paciente recurrente..."
                />
              </div>
            </div>

            <button
              onClick={handleSaveMarketing}
              disabled={savingMarketing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {savingMarketing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("common.save")}
            </button>
          </div>
        )}

        {/* ===== INSURANCE TAB ===== */}
        {activeTab === "insurance" && insuranceEnabled && (
          <PatientInsurancesPanel patientId={patient.id} canEdit={isAdmin} />
        )}

        {/* ===== DERMATOLOGY BEFORE/AFTER (read-only gallery) ===== */}
        {activeTab === "dermatology_photos" && showDermatologyTab && (
          <BeforeAfterPhotosPanel patientId={patient.id} canEdit={false} />
        )}

        {/* ===== FISCAL TAB (gated by einvoice connection) ===== */}
        {activeTab === "fiscal" && einvoiceConfig.connected && !isDoctor && (
          <PatientFiscalSection patient={patient} onUpdate={onUpdate} />
        )}
      </div>

      {/* Cobro del tratamiento en curso (mig 242). El diálogo vive en el
          módulo Tratamientos: mismo formulario aquí y en /tratamientos, así
          que el concepto y el bucket se piden siempre igual. */}
      {activeTreatment && treatmentPayOpen && (
        <TreatmentPaymentDialog
          open={treatmentPayOpen}
          onOpenChange={setTreatmentPayOpen}
          treatmentId={activeTreatment.id}
          treatmentTitle={activeTreatment.title}
          patientName={`${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()}
          concepts={treatmentConcepts}
          money={activeTreatment.money}
          onSaved={() => {
            setShowPaymentForm(false);
            invalidatePatientData();
          }}
        />
      )}

      {/* Cobrar por link (Culqi F1) — montado solo al abrir para que el
          estado Culqi + historial de links se pidan lazy. */}
      {paymentLinkOpen && (
        <PaymentLinkModal
          open={paymentLinkOpen}
          onClose={() => setPaymentLinkOpen(false)}
          patientId={patient.id}
          patientFirstName={patient.first_name ?? ""}
          patientPhone={patient.phone ?? null}
          organizationName={organization?.name ?? "tu clínica"}
          defaultAmount={pendingBalance > 0 ? pendingBalance : 0}
        />
      )}

      {/* Clinical History Expanded Modal */}
      <ClinicalHistoryModal
        patient={patient}
        open={clinicalModalOpen}
        onClose={() => setClinicalModalOpen(false)}
        doctorId={currentDoctorId}
        canEdit={isAdmin || !!currentDoctorId}
      />

      {/* Expanded Patient View Modal */}
      {expandedView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 md:p-6">
          <div className="w-full max-w-6xl max-h-[95dvh] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
            {/* Expanded Header */}
            <div className="shrink-0 border-b border-border px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
                    style={{ backgroundColor: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af" }}
                  >
                    {patient.first_name?.[0]}{patient.last_name?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold">
                        {patient.first_name} {patient.last_name}
                      </h2>
                      {patient.is_recurring && <RecurringBadge size="sm" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {patient.dni && <span>DNI: {patient.dni}</span>}
                      {patient.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{patient.phone}</span>}
                      {patient.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{patient.email}</span>}
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: (PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af") + "20",
                          color: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af",
                        }}
                      >
                        {t(`patients.${patient.status}`)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedView(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tabs in expanded view */}
              <div className="flex gap-1 mt-4 overflow-x-auto">
                {tabs.map((tab) => {
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <TabIcon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Expanded Content — reuses the same content as drawer */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* ===== INFO TAB ===== */}
              {activeTab === "info" && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Datos personales</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="text-xs text-muted-foreground">Nombre</label><p className="text-sm font-medium">{patient.first_name}</p></div>
                      <div><label className="text-xs text-muted-foreground">Apellido</label><p className="text-sm font-medium">{patient.last_name}</p></div>
                      <div><label className="text-xs text-muted-foreground">DNI</label><p className="text-sm font-medium">{patient.dni || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Fecha de nacimiento</label><p className="text-sm font-medium">{patient.birth_date || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Teléfono</label><p className="text-sm font-medium">{patient.phone || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Email</label><p className="text-sm font-medium">{patient.email || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Departamento</label><p className="text-sm font-medium">{patient.departamento || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Distrito</label><p className="text-sm font-medium">{patient.distrito || "—"}</p></div>
                    </div>
                    {patient.notes && (
                      <div><label className="text-xs text-muted-foreground">Notas</label><p className="text-sm">{patient.notes}</p></div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumen</h3>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 text-center">
                        <p className="text-xl sm:text-2xl font-bold text-primary">{summaryData?.appointments_count ?? 0}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Citas</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 text-center">
                        <p className="text-xl sm:text-2xl font-bold text-success-600">
                          S/. {totalPaid.toFixed(0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Pagado</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 text-center">
                        <p className="text-xl sm:text-2xl font-bold text-blue-600">{clinicalNotes.length}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Notas clínicas</p>
                      </div>
                    </div>
                    {/* Tags */}
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Etiquetas</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {patient.patient_tags.length === 0 && <span className="text-xs text-muted-foreground">Sin etiquetas</span>}
                        {patient.patient_tags.map((tag) => (
                          <span key={tag.id} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{tag.tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== HISTORY TAB ===== */}
              {activeTab === "history" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Historial de citas ({summaryData?.appointments_count ?? appointments.length})
                  </h3>
                  {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : appointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">Sin citas registradas</p>
                  ) : (
                    <>
                    {/* Móvil: la tabla de 5 columnas obliga a 600 px de
                        scroll horizontal dentro de un modal de 360 px.
                        Debajo de md el historial se lee como cards
                        apiladas con los mismos datos. */}
                    <div className="space-y-2 md:hidden">
                      {appointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="rounded-lg border border-border/60 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {appt.appointment_date.split("-").reverse().join("/")}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {appt.start_time?.slice(0, 5)}
                              </span>
                            </span>
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: (APPOINTMENT_STATUS_COLORS[appt.status] ?? "#9ca3af") + "20",
                                color: APPOINTMENT_STATUS_COLORS[appt.status] ?? "#9ca3af",
                              }}
                            >
                              {t(`scheduler.status_${appt.status}`)}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-xs">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: appt.doctors?.color }}
                            />
                            {appt.doctors?.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {appt.services?.name}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="text-left py-2 px-3 font-medium">Fecha</th>
                            <th className="text-left py-2 px-3 font-medium">Hora</th>
                            <th className="text-left py-2 px-3 font-medium">Doctor</th>
                            <th className="text-left py-2 px-3 font-medium">Servicio</th>
                            <th className="text-left py-2 px-3 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appointments.map((appt) => (
                            <tr key={appt.id} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2.5 px-3">{appt.appointment_date.split("-").reverse().join("/")}</td>
                              <td className="py-2.5 px-3 text-muted-foreground">{appt.start_time?.slice(0, 5)}</td>
                              <td className="py-2.5 px-3">
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: appt.doctors?.color }} />
                                  {appt.doctors?.full_name}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground">{appt.services?.name}</td>
                              <td className="py-2.5 px-3">
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: (APPOINTMENT_STATUS_COLORS[appt.status] ?? "#9ca3af") + "20",
                                    color: APPOINTMENT_STATUS_COLORS[appt.status] ?? "#9ca3af",
                                  }}
                                >
                                  {t(`scheduler.status_${appt.status}`)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== CLINICAL TAB ===== */}
              {activeTab === "clinical" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Historia clínica</h3>
                    <button
                      onClick={() => { setClinicalModalOpen(true); setExpandedView(false); }}
                      className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Maximize2 className="h-3 w-3" />
                      Ver historial completo
                    </button>
                  </div>
                  <VitalsTrendsChart patientId={patient.id} clinicalNotes={clinicalNotes} />
                  <DiagnosisHistoryPanel patientId={patient.id} clinicalNotes={clinicalNotes} />
                  <TreatmentPlansPanel patientId={patient.id} canEdit={false} />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <PrescriptionsPanel patientId={patient.id} canEdit={false} />
                    <ExamOrdersPanel patientId={patient.id} canEdit={false} />
                  </div>
                  <PatientInventoryPanel
                    patientId={patient.id}
                    scope="clinical"
                    variant="table"
                    onNavigateToCounterpart={() => setActiveTab("finances")}
                  />
                  <ClinicalFollowupsPanel patientId={patient.id} canEdit={false} />
                  <ClinicalAttachmentsPanel patientId={patient.id} canEdit={false} />
                  <ConsentsUnifiedPanel
                    patientId={patient.id}
                    patientName={`${patient.first_name} ${patient.last_name}`.trim()}
                    doctorId={currentDoctorId}
                  />
                </div>
              )}

              {/* ===== GROWTH TAB ===== */}
              {activeTab === "growth" && (
                <GrowthCurvesPanel
                  patientId={patient.id}
                  birthDate={patient.birth_date ?? null}
                  sex={patientSex}
                  onRequestSexUpdate={() => setActiveTab("info")}
                />
              )}

              {/* ===== BUDGETS TAB ===== */}
              {activeTab === "budgets" && (
                <div className="space-y-4">
                  <FertilityBudgetRecordsSection
                    patientId={patient.id}
                    patientFullName={`${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()}
                  />
                  <PatientPlansSection
                    patientId={patient.id}
                    canEdit={isAdmin || !!currentDoctorId}
                    hideBehindDisclosure={fertilityActive}
                    legacyPlanCount={legacyPlanCount}
                  />
                </div>
              )}

              {/* ===== FINANCES TAB ===== */}
              {activeTab === "finances" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Finanzas ({summaryData?.payments_count ?? payments.length} pagos)
                  </h3>
                  {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">Sin pagos registrados</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="text-left py-2 px-3 font-medium">Fecha</th>
                            <th className="text-right py-2 px-3 font-medium">Monto</th>
                            <th className="text-left py-2 px-3 font-medium">Método</th>
                            <th className="text-left py-2 px-3 font-medium">Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((pay) => (
                            <tr key={pay.id} className="border-b border-border/50">
                              <td className="py-2.5 px-3">{pay.payment_date.split("-").reverse().join("/")}</td>
                              <td className="py-2.5 px-3 text-right font-medium text-success-600">S/. {Number(pay.amount).toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-muted-foreground">{pay.payment_method || "—"}</td>
                              <td className="py-2.5 px-3 text-muted-foreground text-xs">{pay.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-xl sm:text-2xl font-bold text-success-600">S/. {totalPaid.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Total pagado</p>
                      </div>
                      <div>
                        <p className="text-xl sm:text-2xl font-bold text-muted-foreground">{summaryData?.payments_count ?? payments.length}</p>
                        <p className="text-xs text-muted-foreground">Transacciones</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border pt-6">
                    <PatientInventoryPanel
                      patientId={patient.id}
                      scope="sales"
                      variant="table"
                      onNavigateToCounterpart={
                        canSeeClinical ? () => setActiveTab("clinical") : undefined
                      }
                    />
                  </div>
                </div>
              )}

              {/* ===== MARKETING TAB ===== */}
              {activeTab === "marketing" && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Datos de marketing</h3>
                    <div className="space-y-3">
                      <div><label className="text-xs text-muted-foreground">Origen</label><p className="text-sm font-medium">{patient.origin || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Fuente de referido</label><p className="text-sm font-medium">{patient.referral_source || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Campo personalizado 1</label><p className="text-sm font-medium">{patient.custom_field_1 || "—"}</p></div>
                      <div><label className="text-xs text-muted-foreground">Campo personalizado 2</label><p className="text-sm font-medium">{patient.custom_field_2 || "—"}</p></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Métricas</h3>
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground">Primera cita</p>
                        <p className="text-sm font-medium">{summaryData?.first_appointment_date ? summaryData.first_appointment_date.split("-").reverse().join("/") : "—"}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground">Última cita</p>
                        <p className="text-sm font-medium">{summaryData?.last_appointment_date ? summaryData.last_appointment_date.split("-").reverse().join("/") : "—"}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground">Total de visitas</p>
                        <p className="text-sm font-medium">{summaryData?.completed_count ?? 0} completadas de {summaryData?.appointments_count ?? 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "insurance" && insuranceEnabled && (
                <PatientInsurancesPanel patientId={patient.id} canEdit={isAdmin} />
              )}

              {activeTab === "dermatology_photos" && showDermatologyTab && (
                <BeforeAfterPhotosPanel patientId={patient.id} canEdit={false} />
              )}

              {activeTab === "fiscal" && einvoiceConfig.connected && !isDoctor && (
                <PatientFiscalSection patient={patient} onUpdate={onUpdate} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Planes de sesiones (mig 099) dentro de la pestaña Presupuestos.
 *
 * Con el addon fertilidad activo el panel se esconde: tener dos "Registrar
 * pago" con semánticas distintas (anticipo de plan vs. cobro de tratamiento)
 * en la misma pantalla es la receta para colgar la plata del contenedor
 * equivocado. Si el paciente YA tiene planes con pagos, la información no se
 * puede evaporar: se ofrece colapsada tras "Planes anteriores (N)".
 */
function PatientPlansSection({
  patientId,
  canEdit,
  hideBehindDisclosure,
  legacyPlanCount,
}: {
  patientId: string;
  canEdit: boolean;
  hideBehindDisclosure: boolean;
  legacyPlanCount: number;
}) {
  if (!hideBehindDisclosure) {
    return <BudgetsPanel patientId={patientId} canEdit={canEdit} />;
  }
  if (legacyPlanCount === 0) return null;
  return (
    <details className="rounded-lg border border-border">
      <summary className="flex min-h-[44px] cursor-pointer items-center px-3 py-2 text-xs font-medium text-muted-foreground">
        Planes anteriores ({legacyPlanCount})
      </summary>
      <div className="border-t border-border p-3">
        {/* Solo lectura: los cobros nuevos van al tratamiento. */}
        <BudgetsPanel patientId={patientId} canEdit={false} />
      </div>
    </details>
  );
}
