"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useUserProfile } from "@/hooks/use-user-profile";
import { toast } from "sonner";
import type { AppointmentWithRelations, Doctor, Service, LookupValue, PatientPayment } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
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
  Banknote,
  CreditCard,
  Smartphone,
  Link2,
  ChevronDown,
  UserX,
} from "lucide-react";

const PERU_PAYMENT_METHODS = [
  { value: "Yape",          Icon: Smartphone },
  { value: "Plin",          Icon: Smartphone },
  { value: "Visa/Tarjeta",  Icon: CreditCard },
  { value: "Transferencia", Icon: Building2 },
  { value: "Link de pago",  Icon: Link2 },
  { value: "Efectivo",      Icon: Banknote },
] as const;

interface AppointmentSidebarProps {
  appointment: AppointmentWithRelations;
  onClose: () => void;
  onUpdate: () => void;
  onReschedule?: () => void;
  doctors?: Doctor[];
  services?: Service[];
  lookupOrigins?: LookupValue[];
  lookupPayments?: LookupValue[];
  lookupResponsibles?: LookupValue[];
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
}: AppointmentSidebarProps) {
  const { t } = useLanguage();
  const { profile } = useUserProfile();
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);

  // ── Payments / cobros ────────────────────────────────────────────────────
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPrice = appointment.price_snapshot ? Number(appointment.price_snapshot) : 0;
  const pending = Math.max(0, totalPrice - totalPaid);
  const paymentStatus =
    totalPrice === 0
      ? null
      : totalPaid === 0
        ? "none"
        : totalPaid >= totalPrice
          ? "paid"
          : "partial";

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("patient_payments")
      .select("*")
      .eq("appointment_id", appointment.id)
      .order("payment_date", { ascending: true });
    setPayments((data as PatientPayment[]) ?? []);
    setLoadingPayments(false);
  }, [appointment.id]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

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
        amount: Number(payAmount),
        payment_method: payMethod || null,
        notes: payRef || null,
        payment_date: new Date().toISOString().split("T")[0],
        organization_id: (appointment as any).organization_id,
      } as any);

    setSavingPayment(false);
    if (error) {
      console.error("Payment insert error:", JSON.stringify(error));
      toast.error("Error al registrar pago: " + (error.message || JSON.stringify(error)));
      return;
    }
    toast.success("Pago registrado");
    setShowAddPayment(false);
    setPayAmount("");
    setPayMethod("");
    setPayRef("");
    fetchPayments();
  };

  // Edit form state
  const [editDoctor, setEditDoctor] = useState(appointment.doctor_id);
  const [editService, setEditService] = useState(appointment.service_id);
  const [editOrigin, setEditOrigin] = useState(appointment.origin ?? "");
  const [editPayment, setEditPayment] = useState(appointment.payment_method ?? "");
  const [editResponsible, setEditResponsible] = useState(appointment.responsible ?? "");
  const [editNotes, setEditNotes] = useState(appointment.notes ?? "");

  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status] ?? "#9ca3af";
  const StatusIcon = STATUS_ICONS[appointment.status] ?? AlertCircle;

  const selectedService = useMemo(
    () => services.find((s) => s.id === editService),
    [services, editService]
  );

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({ status: newStatus })
      .eq("id", appointment.id);

    setUpdating(false);
    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }
    toast.success(t("scheduler.save_success"));
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm(t("scheduler.delete_confirm"))) return;
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
        edited_by_name: userName,
        edited_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    setUpdating(false);

    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }

    toast.success(t("scheduler.save_success"));
    setEditing(false);
    onUpdate();
  };

  const selectClass =
    "w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{t("scheduler.details")}</h3>
        <div className="flex items-center gap-1">
          {/* Edit toggle */}
          {appointment.status !== "cancelled" && appointment.status !== "no_show" && !editing && (
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
            <div>
              <p className="text-sm font-semibold">{appointment.patient_name}</p>
              {appointment.patient_phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {appointment.patient_phone}
                </p>
              )}
            </div>
          </div>

          {/* Date & Time — read-only (use Reprogramar for these) */}
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.appointment_date}</p>
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

        {/* Action buttons — hidden while editing */}
        {!editing && (
          <div className="space-y-2 pt-2 border-t border-border">
            {/* Reschedule — always shown for non-cancelled */}
            {appointment.status !== "cancelled" && onReschedule && (
              <button
                onClick={onReschedule}
                disabled={updating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reprogramar
              </button>
            )}

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
                <button
                  onClick={() => updateStatus("cancelled")}
                  disabled={updating}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  {t("scheduler.cancel_appointment")}
                </button>
              </>
            )}
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
            {totalPrice > 0 && (
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

            {/* Add payment */}
            {appointment.status !== "cancelled" && (
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
                    {PERU_PAYMENT_METHODS.map(({ value, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPayMethod((m) => (m === value ? "" : value))}
                        className={cn(
                          "flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition-all",
                          payMethod === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {value}
                      </button>
                    ))}
                  </div>

                  {/* Reference */}
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Nro. operación (opcional)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />

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
  );
}
