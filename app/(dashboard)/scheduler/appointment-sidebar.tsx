"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useUserProfile } from "@/hooks/use-user-profile";
import { toast } from "sonner";
import type { AppointmentWithRelations, Doctor, Service, LookupValue, PatientPayment } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { sendNotification } from "@/lib/send-notification";
import { syncAppointmentToGoogle } from "@/lib/google-calendar-client";
import { useEInvoiceConfig } from "@/hooks/use-einvoice-config";
import { EInvoiceEmitDialog } from "@/components/einvoice/emit-dialog";
import { InvoiceCard } from "@/components/einvoice/invoice-card";
import {
  X,
  User,
  Phone,
  Stethoscope,
  Building2,
  ClipboardList,
  Clock,
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  RefreshCw,
  Pencil,
  Save,
  Wallet,
  Plus,
  Check,
  UserX,
  ExternalLink,
  AlertTriangle,
  Receipt,
  Info,
} from "lucide-react";
import { ZoomIcon } from "@/components/icons/zoom-icon";
import { getPaymentIcon } from "@/lib/payment-icons";
import { useOrgRole } from "@/hooks/use-org-role";
import { usePlan } from "@/hooks/use-plan";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import dynamic from "next/dynamic";

const ClinicalNoteModal = dynamic(
  () => import("./clinical-note-modal").then((m) => ({ default: m.ClinicalNoteModal })),
  { ssr: false }
);

interface AppointmentSidebarProps {
  appointment: AppointmentWithRelations;
  onClose: () => void;
  onUpdate: () => void;
  onReschedule?: () => void;
  doctors?: Doctor[];
  services?: Service[];
  lookupOrigins?: LookupValue[];
  lookupPayments?: LookupValue[];
  lookupResponsibles?: { id: string; label: string }[];
  /** When true, hides all edit/delete/status actions (doctor viewing own appointment sidebar is fine; this blocks other doctors) */
  readOnly?: boolean;
}

const STATUS_ICONS: Record<string, typeof AlertCircle> = {
  scheduled: AlertCircle,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
  no_show: UserX,
};

export function AppointmentSidebar({
  appointment,
  onClose,
  onUpdate,
  onReschedule,
  doctors = [],
  services = [],
  lookupOrigins = [],
  lookupPayments = [],
  lookupResponsibles = [],
  readOnly = false,
}: AppointmentSidebarProps) {
  const { t } = useLanguage();
  const { profile } = useUserProfile();
  const { isAdmin, isDoctor: isDoctorRole } = useOrgRole();
  const { plan } = usePlan();
  const einvoiceConfig = useEInvoiceConfig();
  const [emitDialogOpen, setEmitDialogOpen] = useState(false);
  const confirm = useConfirm();
  const allowDiscountCodes =
    !!plan && plan.slug !== "starter";
  const { doctorId: currentDoctorId } = useCurrentDoctor();
  const [updating, setUpdating] = useState(false);

  // Org-level discount feature toggle (booking_settings.discounts_enabled).
  // Defaults to true so existing orgs continue to see the UI. The button is
  // hidden entirely when false — admins can turn it on/off from Settings →
  // Agenda.
  const [discountsEnabled, setDiscountsEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!appointment.organization_id) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("booking_settings")
        .select("discounts_enabled")
        .eq("organization_id", appointment.organization_id)
        .single();
      if (!cancelled && data) {
        setDiscountsEnabled((data as { discounts_enabled?: boolean }).discounts_enabled !== false);
      }
    })();
    return () => { cancelled = true; };
  }, [appointment.organization_id]);
  const [editing, setEditing] = useState(false);
  const [showClinicalNote, setShowClinicalNote] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // ── Payments / cobros ────────────────────────────────────────────────────
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [sendAsInvoice, setSendAsInvoice] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const grossPrice = appointment.price_snapshot ? Number(appointment.price_snapshot) : 0;
  const discountAmount = Number(
    (appointment as { discount_amount?: number | null }).discount_amount ?? 0
  );
  const discountReason =
    (appointment as { discount_reason?: string | null }).discount_reason ?? null;
  const discountCodeId =
    (appointment as { discount_code_id?: string | null }).discount_code_id ?? null;
  const totalPrice = Math.max(0, grossPrice - discountAmount);
  const pending = Math.max(0, totalPrice - totalPaid);
  const paymentStatus =
    totalPrice === 0
      ? null
      : totalPaid === 0
        ? "none"
        : totalPaid >= totalPrice
          ? "paid"
          : "partial";

  // ── Patient-level debt ──────────────────────────────────────────────────
  const [patientDebt, setPatientDebt] = useState<number>(0);

  // ── Informed consent quick-access ─────────────────────────────────────
  // Shows a compact upload card when the cita's service requires consent.
  // Visible to any org member (reception included) — RLS on
  // clinical_attachments allows inserts from any org member, so this card
  // lets reception upload the signed form without navigating to the
  // clinical-history modal (2 clicks instead of 5).
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentFiles, setConsentFiles] = useState<Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
    created_at: string;
  }>>([]);
  const [consentUploading, setConsentUploading] = useState(false);
  const consentInputRef = useRef<HTMLInputElement>(null);

  const fetchConsentContext = useCallback(async () => {
    const supabase = createClient();
    // Service's requires_consent flag
    if (appointment.service_id) {
      const { data: svc } = await supabase
        .from("services")
        .select("requires_consent")
        .eq("id", appointment.service_id)
        .maybeSingle();
      setConsentRequired(
        (svc as { requires_consent?: boolean } | null)?.requires_consent === true
      );
    } else {
      setConsentRequired(false);
    }
    // Existing consent-type attachments for this appointment
    if (appointment.patient_id) {
      const { data } = await supabase
        .from("clinical_attachments")
        .select("id, file_name, file_type, file_size, storage_path, created_at")
        .eq("appointment_id", appointment.id)
        .eq("category", "consent")
        .order("created_at", { ascending: false });
      setConsentFiles(data ?? []);
    }
  }, [appointment.id, appointment.service_id, appointment.patient_id]);

  useEffect(() => {
    fetchConsentContext();
  }, [fetchConsentContext]);

  const handleConsentUpload = async (file: File) => {
    if (!appointment.patient_id) {
      toast.error("La cita no tiene paciente vinculado");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo no puede superar 10 MB");
      return;
    }
    setConsentUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("patient_id", appointment.patient_id);
      form.append("appointment_id", appointment.id);
      form.append("category", "consent");
      form.append("description", "Consentimiento firmado");

      const res = await fetch("/api/clinical-attachments", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "No pudimos subir el archivo. ¿Excede los 10 MB?");
        return;
      }
      toast.success("Consentimiento subido");
      fetchConsentContext();
    } catch {
      toast.error("Error de red al subir");
    } finally {
      setConsentUploading(false);
      if (consentInputRef.current) consentInputRef.current.value = "";
    }
  };

  const handleConsentDownload = async (storagePath: string, fileName: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("clinical-attachments")
      .createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) {
      toast.error("No se pudo descargar");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = fileName;
    a.target = "_blank";
    a.click();
  };

  // ── Treatment plan context (only when cita is linked to a session) ──
  const [planContext, setPlanContext] = useState<{
    plan_id: string;
    plan_title: string;
    session_number: number;
    total_sessions: number;
    total_budget: number;
    paid: number;
    consumed: number;
    saldo: number;
    session_price: number;
  } | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("patient_payments")
      .select("id, appointment_id, patient_id, amount, payment_method, payment_date, notes, organization_id, created_at")
      .eq("appointment_id", appointment.id)
      .order("payment_date", { ascending: true });
    setPayments((data as PatientPayment[]) ?? []);
    setLoadingPayments(false);

    // Fetch patient total debt (all appointments)
    if (appointment.patient_id) {
      const [apptRes, payRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("price_snapshot, discount_amount, status")
          .eq("patient_id", appointment.patient_id)
          .neq("status", "cancelled"),
        supabase
          .from("patient_payments")
          .select("amount")
          .eq("patient_id", appointment.patient_id),
      ]);
      const totalBilled = (apptRes.data ?? []).reduce(
        (sum, a) => {
          const gross = Number(a.price_snapshot) || 0;
          const discount = Number((a as { discount_amount?: number | null }).discount_amount) || 0;
          return sum + Math.max(0, gross - discount);
        },
        0
      );
      const totalPaid = (payRes.data ?? []).reduce(
        (sum, p) => sum + Number(p.amount), 0
      );
      setPatientDebt(Math.max(0, totalBilled - totalPaid));
    }
  }, [appointment.id, appointment.patient_id]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Fetch plan context + saldo when this appointment is linked to a session.
  useEffect(() => {
    const linkedSessionId = (appointment as { treatment_session_id?: string | null })
      .treatment_session_id;
    if (!linkedSessionId) {
      setPlanContext(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // Session + plan header
      const { data: session } = await supabase
        .from("treatment_sessions")
        .select("id, session_number, session_price, treatment_plan_id")
        .eq("id", linkedSessionId)
        .single();
      if (!session || cancelled) return;

      const { data: plan } = await supabase
        .from("treatment_plans")
        .select("id, title, total_sessions")
        .eq("id", session.treatment_plan_id)
        .single();
      if (!plan || cancelled) return;

      // Paid: sum of payments applied to the plan
      const { data: planPayments } = await supabase
        .from("patient_payments")
        .select("amount")
        .eq("treatment_plan_id", plan.id);

      // Consumed: sum of session_price for sessions already completed
      const { data: completedSessions } = await supabase
        .from("treatment_sessions")
        .select("session_price")
        .eq("treatment_plan_id", plan.id)
        .eq("status", "completed");

      // Total budget: sum of items
      const { data: planItems } = await supabase
        .from("treatment_plan_items")
        .select("quantity, unit_price")
        .eq("treatment_plan_id", plan.id);

      if (cancelled) return;

      const paid = (planPayments ?? []).reduce(
        (s, p) => s + Number(p.amount),
        0
      );
      const consumed = (completedSessions ?? []).reduce(
        (s, c) => s + Number(c.session_price ?? 0),
        0
      );
      const total = (planItems ?? []).reduce(
        (s, it) => s + Number(it.unit_price) * Number(it.quantity),
        0
      );

      setPlanContext({
        plan_id: plan.id,
        plan_title: plan.title,
        session_number: session.session_number,
        total_sessions: plan.total_sessions ?? 0,
        total_budget: total,
        paid,
        consumed,
        saldo: paid - consumed,
        session_price: Number(session.session_price ?? 0),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [appointment]);

  const handleAddPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) return;
    setSavingPayment(true);
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from("patient_payments")
      .insert({
        patient_id: appointment.patient_id || null,
        appointment_id: appointment.id,
        treatment_plan_id: planContext?.plan_id || null,
        amount: Number(payAmount),
        payment_method: payMethod || null,
        notes: payRef || null,
        payment_date: new Date().toISOString().split("T")[0],
        organization_id: (appointment as any).organization_id,
      } as any);

    setSavingPayment(false);
    if (error) {
      toast.error("No pudimos registrar el pago. " + (error.message || "Revisa el monto e intenta otra vez."));
      return;
    }
    toast.success("Pago registrado");

    // In-app notification for payment
    if (appointment.organization_id) {
      supabase.from("notifications").insert({
        organization_id: (appointment as any).organization_id,
        type: "payment_received",
        title: "Pago registrado",
        body: `S/. ${Number(payAmount).toFixed(2)} — ${appointment.patient_name}`,
        action_url: `/scheduler?date=${appointment.appointment_date}`,
      }).then(({ error: nErr }) => {
        if (nErr) console.error("[Notification] insert error:", nErr);
      });
    }

    // Send payment receipt notification
    const newTotalPaid = totalPaid + Number(payAmount);
    sendNotification({
      type: "payment_receipt",
      appointment_id: appointment.id,
      extra_variables: {
        monto_pagado: `S/. ${Number(payAmount).toFixed(2)}`,
        "{{pago_estado}}":
          newTotalPaid >= totalPrice ? "Pagado en su totalidad" : "Pago parcial",
      },
    });

    // Optionally also send the invoice (factura) email
    if (sendAsInvoice) {
      sendNotification({
        type: "payment_invoice",
        appointment_id: appointment.id,
        extra_variables: {
          monto_pagado: `S/. ${Number(payAmount).toFixed(2)}`,
        },
      });
    }

    setShowAddPayment(false);
    setPayAmount("");
    setPayMethod("");
    setPayRef("");
    setSendAsInvoice(false);
    fetchPayments();
  };

  // Edit form state
  const [editDoctor, setEditDoctor] = useState(appointment.doctor_id);
  const [editService, setEditService] = useState(appointment.service_id);
  const [editOrigin, setEditOrigin] = useState(appointment.origin ?? "");
  const [editPayment, setEditPayment] = useState(appointment.payment_method ?? "");
  const [editResponsible, setEditResponsible] = useState(appointment.responsible ?? "");
  const [editNotes, setEditNotes] = useState(appointment.notes ?? "");
  const [editMeetingUrl, setEditMeetingUrl] = useState((appointment as any).meeting_url ?? "");

  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status] ?? "#9ca3af";
  const StatusIcon = STATUS_ICONS[appointment.status] ?? AlertCircle;

  const selectedService = useMemo(
    () => services.find((s) => s.id === editService),
    [services, editService]
  );

  const updateStatus = async (newStatus: string, reason?: string) => {
    setUpdating(true);
    const supabase = createClient();
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (reason) {
      updatePayload.notes = appointment.notes
        ? `${appointment.notes}\n[Motivo de cancelación]: ${reason}`
        : `[Motivo de cancelación]: ${reason}`;
    }
    const { error } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", appointment.id);

    // Mirror to linked treatment_session if the appointment is part of a plan.
    const linkedSessionId = (appointment as { treatment_session_id?: string | null })
      .treatment_session_id;
    if (!error && linkedSessionId) {
      if (newStatus === "completed") {
        await supabase
          .from("treatment_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", linkedSessionId);
      } else if (newStatus === "cancelled") {
        // Free the session so it can be rescheduled
        await supabase
          .from("treatment_sessions")
          .update({ status: "pending", appointment_id: null })
          .eq("id", linkedSessionId);
      } else if (newStatus === "no_show") {
        await supabase
          .from("treatment_sessions")
          .update({ status: "missed" })
          .eq("id", linkedSessionId);
      }
    }

    setUpdating(false);
    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }
    toast.success(t("scheduler.save_success"));

    // Mirror to Google Calendar (best-effort, no-op if not connected).
    // Cancel → mark event as cancelled. Other status changes don't change
    // the event title/time but we re-upsert so the description / status
    // reflects the new state (e.g. "completed" comment in description).
    syncAppointmentToGoogle(
      appointment.id,
      newStatus === "cancelled" ? "cancel" : "upsert"
    );

    // Fire email notifications for relevant status changes
    const notificationMap: Record<string, string> = {
      confirmed: "appointment_confirmation",
      cancelled: "appointment_cancelled",
    };
    const templateSlug = notificationMap[newStatus];
    if (templateSlug) {
      sendNotification({
        type: templateSlug,
        appointment_id: appointment.id,
      });
    }

    // In-app notification for cancellations
    if (newStatus === "cancelled" && appointment.organization_id) {
      supabase.from("notifications").insert({
        organization_id: appointment.organization_id,
        type: "appointment_cancelled",
        title: "Cita cancelada",
        body: `${appointment.patient_name} — ${appointment.appointment_date} ${appointment.start_time?.slice(0, 5)}`,
        action_url: `/scheduler?date=${appointment.appointment_date}`,
      }).then(({ error: nErr }) => {
        if (nErr) console.error("[Notification] insert error:", nErr);
      });
    }

    onUpdate();
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t("scheduler.delete_confirm"),
      description: "Esta acción no se puede deshacer.",
      confirmText: "Sí, eliminar",
      variant: "destructive",
    });
    if (!ok) return;
    setUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    setUpdating(false);
    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }
    toast.success(t("scheduler.delete_success"));
    onUpdate();
  };

  const handleStartEdit = () => {
    setEditDoctor(appointment.doctor_id);
    setEditService(appointment.service_id);
    setEditOrigin(appointment.origin ?? "");
    setEditPayment(appointment.payment_method ?? "");
    setEditResponsible(appointment.responsible ?? "");
    setEditNotes(appointment.notes ?? "");
    setEditMeetingUrl((appointment as any).meeting_url ?? "");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    setUpdating(true);
    const supabase = createClient();

    // Recalculate end_time if service changed
    let newEndTime = appointment.end_time;
    if (editService !== appointment.service_id && selectedService) {
      const [h, m] = appointment.start_time.slice(0, 5).split(":").map(Number);
      const totalMin = h * 60 + m + selectedService.duration_minutes;
      newEndTime = `${Math.floor(totalMin / 60).toString().padStart(2, "0")}:${(totalMin % 60).toString().padStart(2, "0")}`;
    }

    const userName = profile?.full_name || "Usuario";

    const oldMeetingUrl = (appointment as any).meeting_url ?? "";
    const newMeetingUrl = editMeetingUrl || null;

    const { error } = await supabase
      .from("appointments")
      .update({
        doctor_id: editDoctor,
        service_id: editService,
        end_time: newEndTime,
        origin: editOrigin || null,
        payment_method: editPayment || null,
        responsible: editResponsible || null,
        notes: editNotes || null,
        meeting_url: newMeetingUrl,
        edited_by_name: userName,
        edited_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    setUpdating(false);

    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }

    // Send "meeting link changed" notification if URL was updated
    if (newMeetingUrl && newMeetingUrl !== oldMeetingUrl) {
      sendNotification({
        type: "appointment_meeting_link_changed",
        appointment_id: appointment.id,
        extra_variables: {
          "{{link_reunion}}": newMeetingUrl,
        },
      });
    }

    toast.success(t("scheduler.save_success"));
    setEditing(false);
    onUpdate();
  };

  const selectClass =
    "w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm shrink-0 border-l border-border bg-card overflow-y-auto md:relative md:inset-auto md:w-80 md:max-w-none md:rounded-xl md:border md:z-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{t("scheduler.details")}</h3>
        <div className="flex items-center gap-1">
          {/* Edit toggle — hidden when readOnly (doctor viewing other doctor's appointment) */}
          {!readOnly && appointment.status !== "cancelled" && appointment.status !== "no_show" && !editing && (
            <button
              onClick={handleStartEdit}
              className="rounded-lg p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              title={t("common.edit")}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <StatusIcon className="h-4 w-4" style={{ color: statusColor }} />
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: statusColor + "20",
              color: statusColor,
            }}
          >
            {t(`scheduler.status_${appointment.status}`)}
          </span>
          {editing && (
            <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {t("scheduler.editing")}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3">
          {/* Patient info — always read-only */}
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{appointment.patient_name}</p>
              {appointment.patient_phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {appointment.patient_phone}
                </p>
              )}
            </div>
            {/* Patient total debt badge */}
            {patientDebt > 0 && (
              <span className="flex items-center gap-1 shrink-0 rounded-lg bg-red-500/10 border border-red-500/30 px-2 py-1 text-[11px] font-bold text-red-600 dark:text-red-400" title="Deuda total del paciente">
                <AlertTriangle className="h-3 w-3" />
                S/. {patientDebt.toFixed(2)}
              </span>
            )}
          </div>

          {/* Date & Time — read-only (use Reprogramar for these) */}
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.appointment_date.split("-").reverse().join("/")}</p>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">
              {appointment.start_time.slice(0, 5)} — {appointment.end_time.slice(0, 5)}
            </p>
          </div>

          {/* Doctor — editable */}
          <div className="flex items-center gap-3">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            {editing && doctors.length > 0 ? (
              <select
                value={editDoctor}
                onChange={(e) => setEditDoctor(e.target.value)}
                className={selectClass}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: appointment.doctors?.color }}
                />
                <p className="text-sm">{appointment.doctors?.full_name}</p>
              </div>
            )}
          </div>

          {/* Office — read-only (use Reprogramar) */}
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.offices?.name}</p>
          </div>

          {/* Service — editable */}
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            {editing && services.length > 0 ? (
              <select
                value={editService}
                onChange={(e) => setEditService(e.target.value)}
                className={selectClass}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — S/. {Number(s.base_price).toFixed(2)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm">{appointment.services?.name}</p>
            )}
          </div>

          {/* Meeting URL — Zoom branded */}
          {editing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <ZoomIcon className="h-4 w-4" />
                <input
                  type="url"
                  value={editMeetingUrl}
                  onChange={(e) => setEditMeetingUrl(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                />
              </div>
              {editMeetingUrl && editMeetingUrl !== ((appointment as any).meeting_url ?? "") && (
                <p className="text-[10px] text-blue-600 dark:text-blue-400 ml-7">
                  Se notificará al paciente del cambio de link
                </p>
              )}
            </div>
          ) : (
            (appointment as any).meeting_url && (
              <div className="flex items-center gap-3">
                <ZoomIcon className="h-4 w-4" />
                <a
                  href={(appointment as any).meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
                >
                  Abrir reunión
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )
          )}

          {/* Notes — editable */}
          {editing ? (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-1.5" />
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                placeholder={t("scheduler.notes")}
              />
            </div>
          ) : (
            appointment.notes && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-sm text-muted-foreground">{appointment.notes}</p>
              </div>
            )
          )}

          {/* Origin / Payment / Responsible — editable */}
          {editing ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-muted-foreground">{t("scheduler.origin")}</label>
                <select
                  value={editOrigin}
                  onChange={(e) => setEditOrigin(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {lookupOrigins.map((o) => (
                    <option key={o.id} value={o.label}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-medium text-muted-foreground">{t("scheduler.payment_method")}</label>
                <select
                  value={editPayment}
                  onChange={(e) => setEditPayment(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {lookupPayments.map((p) => (
                    <option key={p.id} value={p.label}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-medium text-muted-foreground">{t("scheduler.responsible")}</label>
                <select
                  value={editResponsible}
                  onChange={(e) => setEditResponsible(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {lookupResponsibles.map((r) => (
                    <option key={r.id} value={r.label}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            (appointment.origin || appointment.payment_method || appointment.responsible) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs text-muted-foreground">
                {appointment.origin && (
                  <p>{t("scheduler.origin")}: <span className="text-foreground">{appointment.origin}</span></p>
                )}
                {appointment.payment_method && (
                  <p>{t("scheduler.payment_method")}: <span className="text-foreground">{appointment.payment_method}</span></p>
                )}
                {appointment.responsible && (
                  <p>{t("scheduler.responsible")}: <span className="text-foreground">{appointment.responsible}</span></p>
                )}
              </div>
            )
          )}
        </div>

        {/* Edit action buttons */}
        {editing && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <button
              onClick={handleCancelEdit}
              disabled={updating}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updating}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>
        )}

        {/* Action buttons — hidden while editing or when readOnly */}
        {!editing && !readOnly && (
          <div className="space-y-2 pt-2 border-t border-border">
            {/* Reschedule — hidden for doctor role (doctors cannot reschedule) */}
            {appointment.status !== "cancelled" && onReschedule && !isDoctorRole && (
              <button
                onClick={onReschedule}
                disabled={updating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reprogramar
              </button>
            )}

            {/* Issued invoice card OR emit button — gated by einvoice connection */}
            {einvoiceConfig.connected && (() => {
              const einvoiceId = (appointment as { einvoice_id?: string | null }).einvoice_id;
              if (einvoiceId) {
                return <InvoiceCard einvoiceId={einvoiceId} />;
              }
              if (appointment.status !== "cancelled") {
                return (
                  <button
                    onClick={() => setEmitDialogOpen(true)}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Receipt className="h-4 w-4" />
                    Emitir comprobante
                  </button>
                );
              }
              return null;
            })()}

            {appointment.status !== "cancelled" && (
              <>
                {appointment.status === "scheduled" && (
                  <button
                    onClick={() => updateStatus("confirmed")}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {t("scheduler.confirm")}
                  </button>
                )}
                {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                  <button
                    onClick={() => updateStatus("completed")}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {t("scheduler.complete")}
                  </button>
                )}
                {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                  <button
                    onClick={() => updateStatus("no_show")}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                    No asistió
                  </button>
                )}

                {/* Cancel button — doctors: only their own appointments, with mandatory reason */}
                {isDoctorRole && currentDoctorId === appointment.doctor_id ? (
                  <>
                    {!showCancelReason ? (
                      <button
                        onClick={() => setShowCancelReason(true)}
                        disabled={updating}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                        {t("scheduler.cancel_appointment")}
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-xs font-medium text-destructive">Motivo de cancelación (obligatorio)</p>
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Escriba el motivo de la cancelación..."
                          rows={2}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowCancelReason(false); setCancelReason(""); }}
                            className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                          >
                            Volver
                          </button>
                          <button
                            onClick={() => {
                              updateStatus("cancelled", cancelReason);
                              setShowCancelReason(false);
                              setCancelReason("");
                            }}
                            disabled={updating || !cancelReason.trim()}
                            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                            Cancelar cita
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : !isDoctorRole ? (
                  <button
                    onClick={() => updateStatus("cancelled")}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {t("scheduler.cancel_appointment")}
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* ── Treatment plan context (only if cita linked to plan) ───────── */}
        {!editing && planContext && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 truncate">
                  📋 Sesión {planContext.session_number}
                  {planContext.total_sessions > 0
                    ? ` de ${planContext.total_sessions}`
                    : ""}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {planContext.plan_title}
                </p>
              </div>
              <ClipboardList className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className="rounded bg-background/70 px-2 py-1">
                <p className="text-muted-foreground">Pagado</p>
                <p className="font-semibold text-foreground">
                  S/ {planContext.paid.toFixed(2)}
                </p>
              </div>
              <div className="rounded bg-background/70 px-2 py-1">
                <p className="text-muted-foreground">Consumido</p>
                <p className="font-semibold text-foreground">
                  S/ {planContext.consumed.toFixed(2)}
                </p>
              </div>
              <div
                className={cn(
                  "rounded px-2 py-1",
                  planContext.saldo >= 0
                    ? "bg-emerald-500/10"
                    : "bg-red-500/10"
                )}
              >
                <p className="text-muted-foreground">Saldo</p>
                <p
                  className={cn(
                    "font-semibold",
                    planContext.saldo >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  S/ {planContext.saldo.toFixed(2)}
                </p>
              </div>
            </div>
            {planContext.saldo >= planContext.session_price &&
            planContext.session_price > 0 ? (
              <p className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Esta sesión se cubre con el crédito del plan — al marcarla
                completada, el saldo se consume automáticamente.
              </p>
            ) : (
              <p className="rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-500">
                Cobra el faltante abajo o registra un pago antes de completar
                la sesión.
              </p>
            )}
          </div>
        )}

        {/* ── Consentimiento informado (quick access) ────────────────────── */}
        {!editing && (consentRequired || consentFiles.length > 0) && (
          <div
            className={cn(
              "rounded-lg border p-3 space-y-2",
              consentRequired && consentFiles.length === 0
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-border/60 bg-muted/20"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileText className="h-3.5 w-3.5" />
                  Consentimiento informado
                  {consentRequired && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                      Requerido
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {consentRequired
                    ? "Este servicio requiere documento firmado (Ley 29414)."
                    : "Documentos de consentimiento de esta cita."}
                </p>
              </div>
            </div>

            {/* File list */}
            {consentFiles.length > 0 && (
              <div className="space-y-1">
                {consentFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleConsentDownload(f.storage_path, f.file_name)}
                    className="flex w-full items-center gap-2 rounded-md bg-background/80 px-2 py-1.5 text-left text-[11px] hover:bg-background transition-colors"
                  >
                    <FileText className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Upload button */}
            <div>
              <input
                ref={consentInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleConsentUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => consentInputRef.current?.click()}
                disabled={consentUploading || !appointment.patient_id}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                  consentRequired && consentFiles.length === 0
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {consentUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                {consentFiles.length === 0
                  ? "Subir consentimiento firmado"
                  : "Añadir otro documento"}
              </button>
              <p className="mt-1 text-[9px] text-muted-foreground text-center">
                Foto (celular) o PDF · máx 10 MB
              </p>
            </div>
          </div>
        )}

        {/* ── Cobros ─────────────────────────────────────────────────────── */}
        {!editing && (
          <div className="border-t border-border pt-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Cobros</span>
              </div>
              {/* Payment status badge */}
              {paymentStatus === "paid" && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Cobrado
                </span>
              )}
              {paymentStatus === "partial" && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  Anticipo
                </span>
              )}
              {paymentStatus === "none" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Sin cobro
                </span>
              )}
            </div>

            {/* Price / paid / pending summary */}
            {grossPrice > 0 && (
              <div className="space-y-1">
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px]">
                    <span className="text-violet-700 dark:text-violet-400">
                      <span className="line-through text-muted-foreground">
                        S/. {grossPrice.toFixed(2)}
                      </span>
                      {" · "}
                      <span className="font-semibold">
                        − S/. {discountAmount.toFixed(2)}
                      </span>
                      {discountReason ? (
                        <span className="ml-1 text-muted-foreground">
                          ({discountReason})
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDiscount((v) => !v)}
                      className="text-[10px] font-medium text-violet-700 hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 py-2 px-1">
                    <p className="text-[10px] text-muted-foreground leading-tight">Total</p>
                    <p className="text-sm font-bold">S/. {totalPrice.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 py-2 px-1">
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-tight">Pagado</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      S/. {totalPaid.toFixed(2)}
                    </p>
                  </div>
                  <div className={cn("rounded-lg py-2 px-1", pending > 0 ? "bg-amber-500/10" : "bg-muted/40")}>
                    <p className={cn("text-[10px] leading-tight", pending > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                      Pendiente
                    </p>
                    <p className={cn("text-sm font-bold", pending > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                      S/. {pending.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Discount controls — hidden entirely when org disabled the feature.
                Locked to read-only once payments exist: applying a discount
                AFTER a cobro/comprobante distorts the contable trail (the
                emitted boleta would no longer match the agreed price).
                For post-cobro adjustments the correct path is a credit
                note (motivo SUNAT 09 — disminución de valor), accessible
                from the einvoice card. */}
            {grossPrice > 0 && !editing && discountsEnabled && totalPaid === 0 && (
              <DiscountControls
                appointmentId={appointment.id}
                grossPrice={grossPrice}
                discountAmount={discountAmount}
                discountReason={discountReason}
                hasCode={!!discountCodeId}
                open={showDiscount}
                onOpenChange={setShowDiscount}
                onChange={onUpdate}
                allowCodes={allowDiscountCodes}
              />
            )}
            {grossPrice > 0 && !editing && discountsEnabled && totalPaid > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  El descuento ya no es editable porque la cita tiene pagos
                  registrados. Para ajustar el monto, emite una{" "}
                  <span className="font-medium text-foreground">
                    nota de crédito
                  </span>
                  {" "}desde la card del comprobante (motivo SUNAT 09 —
                  disminución de valor).
                </span>
              </div>
            )}

            {/* Progress bar */}
            {totalPrice > 0 && (
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, (totalPaid / totalPrice) * 100)}%` }}
                />
              </div>
            )}

            {/* Payment list */}
            {loadingPayments ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : payments.length > 0 ? (
              <div className="space-y-1.5">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {p.payment_method || "Pago"}
                      </p>
                      {p.notes && (
                        <p className="text-[10px] text-muted-foreground truncate">{p.notes}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(p.payment_date + "T12:00:00").toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="ml-2 shrink-0 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      S/. {Number(p.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground py-1">
                Sin pagos registrados
              </p>
            )}

            {/* Add payment — hidden when readOnly */}
            {!readOnly && appointment.status !== "cancelled" && (
              showAddPayment ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
                  {/* Amount */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground shrink-0">S/.</span>
                    <input
                      type="number"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={pending > 0 ? pending.toFixed(2) : "0.00"}
                      min="0"
                      step="0.50"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    />
                    {pending > 0 && (
                      <button
                        type="button"
                        onClick={() => setPayAmount(pending.toFixed(2))}
                        className="shrink-0 rounded-lg bg-primary/10 px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        Saldo
                      </button>
                    )}
                  </div>

                  {/* Payment method chips */}
                  <div className="grid grid-cols-3 gap-1">
                    {(lookupPayments ?? []).map((pm) => {
                      const Icon = getPaymentIcon(pm.icon);
                      return (
                        <button
                          key={pm.id}
                          type="button"
                          onClick={() => setPayMethod((m) => (m === pm.label ? "" : pm.label))}
                          className={cn(
                            "flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition-all",
                            payMethod === pm.label
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {pm.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Reference */}
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Nro. operación (opcional)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />

                  {/* Send as invoice toggle */}
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendAsInvoice}
                      onChange={(e) => setSendAsInvoice(e.target.checked)}
                      className="rounded"
                    />
                    Enviar también como factura (empresa con RUC)
                  </label>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddPayment(false);
                        setPayAmount("");
                        setPayMethod("");
                        setPayRef("");
                      }}
                      className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPayment}
                      disabled={savingPayment || !payAmount || Number(payAmount) <= 0}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                      {savingPayment ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Registrar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPayAmount(pending > 0 ? pending.toFixed(2) : "");
                    setShowAddPayment(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Registrar pago
                </button>
              )
            )}
          </div>
        )}

        {/* ── Nota Clínica — opens in modal ───────────────────────────── */}
        {!editing && (
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowClinicalNote(true)}
              className="flex w-full items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Historia Clínica
              </span>
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        )}

        {/* Clinical Note Modal — only mounted when opened */}
        {showClinicalNote && (
          <ClinicalNoteModal
            open={showClinicalNote}
            onOpenChange={setShowClinicalNote}
            appointmentId={appointment.id}
            patientId={appointment.patient_id ?? null}
            doctorId={appointment.doctor_id}
            canEdit={
              !readOnly &&
              currentDoctorId === appointment.doctor_id
            }
            appointmentStatus={appointment.status}
            patientName={appointment.patient_name}
            patientDni={null}
            doctorName={appointment.doctors?.full_name}
            serviceName={appointment.services?.name}
            appointmentDate={appointment.appointment_date}
            appointmentTime={appointment.start_time?.slice(0, 5)}
          />
        )}

        {/* Audit log — read-only */}
        {appointment.edited_by_name && appointment.edited_at && (
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              {appointment.edited_by_name} {t("scheduler.edited_label")}{" "}
              {new Date(appointment.edited_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true })}
              {" - "}
              {new Date(appointment.edited_at).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
        )}
      </div>
    </div>

    {/* Emit invoice dialog — gated by einvoice connection */}
    {einvoiceConfig.connected && einvoiceConfig.config && (
      <EInvoiceEmitDialog
        open={emitDialogOpen}
        onOpenChange={(open) => {
          setEmitDialogOpen(open);
          // Also refetch when the dialog closes, in case the user
          // emitted and clicked Cerrar before onUpdate finished
          // resolving (race window between emit success → onUpdate fires
          // → dialog manually closed). Cheap, idempotent.
          if (!open) onUpdate();
        }}
        appointment={{
          id: appointment.id,
          patient_id: appointment.patient_id ?? null,
          patient_name: appointment.patient_name ?? "",
          patient_phone: appointment.patient_phone ?? null,
          service_id: appointment.service_id,
          service_name: (appointment as { services?: { name?: string } }).services?.name ?? "",
          price_snapshot: (appointment as { price_snapshot?: number | null }).price_snapshot ?? null,
          appointment_date: appointment.appointment_date,
          start_time: appointment.start_time,
          einvoice_id: (appointment as { einvoice_id?: string | null }).einvoice_id ?? null,
          total_price: totalPrice,
          amount_paid: totalPaid,
          last_payment_method:
            payments
              .slice()
              .sort((a, b) => {
                const ad = new Date(a.payment_date ?? a.created_at ?? 0).getTime();
                const bd = new Date(b.payment_date ?? b.created_at ?? 0).getTime();
                return bd - ad;
              })
              .find((p) => p.payment_method)?.payment_method ?? null,
        }}
        config={einvoiceConfig.config}
        series={einvoiceConfig.series}
        onEmitted={() => {
          // Don't close the dialog here — the user needs to see the
          // SuccessPanel (number, PDF link, email confirmation). Just
          // refetch the appointment so when they close manually, the
          // sidebar already shows the issued-invoice card instead of
          // the "Emitir" button.
          onUpdate();
        }}
      />
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Discount controls: inline amount/% (all plans) + code apply (Pro only).
// Keeps RLS-writable updates client-side for the inline case; code apply
// goes through /api/discount-codes/apply for atomic validation + counter.
// ─────────────────────────────────────────────────────────────────────────
type DiscountMode = "none" | "percent" | "fixed" | "code";

function DiscountControls({
  appointmentId,
  grossPrice,
  discountAmount,
  discountReason,
  hasCode,
  open,
  onOpenChange,
  onChange,
  allowCodes,
}: {
  appointmentId: string;
  grossPrice: number;
  discountAmount: number;
  discountReason: string | null;
  hasCode: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange: () => void;
  allowCodes: boolean;
}) {
  const [mode, setMode] = useState<DiscountMode>(
    hasCode ? "code" : discountAmount > 0 ? "fixed" : "none"
  );
  const [value, setValue] = useState(
    discountAmount > 0 ? String(discountAmount) : ""
  );
  const [reason, setReason] = useState(discountReason ?? "");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount =
    mode === "percent"
      ? Math.min(grossPrice, Math.max(0, (grossPrice * Number(value || 0)) / 100))
      : mode === "fixed"
        ? Math.min(grossPrice, Math.max(0, Number(value || 0)))
        : 0;

  const saveInline = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await supabase
      .from("appointments")
      .update({
        discount_amount: Number(effectiveAmount.toFixed(2)),
        discount_reason: reason.trim() || null,
        discount_applied_by: userId,
        discount_code_id: null,
      } as any)
      .eq("id", appointmentId);
    setSaving(false);
    if (err) {
      setError("Error al aplicar descuento");
      return;
    }
    toast.success("Descuento aplicado");
    onOpenChange(false);
    onChange();
  };

  const applyCode = async () => {
    if (!code.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/discount-codes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointment_id: appointmentId,
        code: code.trim().toUpperCase(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Código inválido");
      return;
    }
    toast.success("Código aplicado");
    onOpenChange(false);
    onChange();
  };

  const removeDiscount = async () => {
    setSaving(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase
      .from("appointments")
      .update({
        discount_amount: 0,
        discount_reason: null,
        discount_applied_by: null,
        discount_code_id: null,
      } as any)
      .eq("id", appointmentId);
    setSaving(false);
    toast.success("Descuento removido");
    onOpenChange(false);
    onChange();
  };

  if (!open && discountAmount === 0) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent/30"
      >
        <Plus className="h-3 w-3" />
        Aplicar descuento
      </button>
    );
  }

  if (!open) return null;

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-violet-700 dark:text-violet-400">
          Aplicar descuento
        </p>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={cn(
            "flex-1 rounded px-2 py-1 text-[10px] font-medium transition-colors",
            mode === "percent"
              ? "bg-violet-500 text-white"
              : "bg-background text-muted-foreground hover:bg-accent"
          )}
        >
          %
        </button>
        <button
          type="button"
          onClick={() => setMode("fixed")}
          className={cn(
            "flex-1 rounded px-2 py-1 text-[10px] font-medium transition-colors",
            mode === "fixed"
              ? "bg-violet-500 text-white"
              : "bg-background text-muted-foreground hover:bg-accent"
          )}
        >
          S/.
        </button>
        {allowCodes && (
          <button
            type="button"
            onClick={() => setMode("code")}
            className={cn(
              "flex-1 rounded px-2 py-1 text-[10px] font-medium transition-colors",
              mode === "code"
                ? "bg-violet-500 text-white"
                : "bg-background text-muted-foreground hover:bg-accent"
            )}
            title="Aplicar código reutilizable (plan Pro)"
          >
            Código
          </button>
        )}
      </div>

      {(mode === "percent" || mode === "fixed") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              step={mode === "percent" ? "1" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "percent" ? "10" : "50.00"}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Razón (opcional)"
              className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          {effectiveAmount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Descuento: S/. {effectiveAmount.toFixed(2)} · Nuevo total:
              {" "}
              <span className="font-semibold text-foreground">
                S/. {Math.max(0, grossPrice - effectiveAmount).toFixed(2)}
              </span>
            </p>
          )}
        </>
      )}

      {mode === "code" && allowCodes && (
        <>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ej: FAMILIA2026"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          <p className="text-[10px] text-muted-foreground">
            El código se valida contra los códigos activos de tu clínica.
          </p>
        </>
      )}

      {error && <p className="text-[10px] text-red-600">{error}</p>}

      <div className="flex gap-1">
        {mode === "code" ? (
          <button
            type="button"
            onClick={applyCode}
            disabled={saving || !code.trim()}
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-violet-500 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Aplicar código
          </button>
        ) : (
          <button
            type="button"
            onClick={saveInline}
            disabled={saving || effectiveAmount <= 0}
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-violet-500 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Guardar
          </button>
        )}
        {discountAmount > 0 && (
          <button
            type="button"
            onClick={removeDiscount}
            disabled={saving}
            className="rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-500/20"
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}
