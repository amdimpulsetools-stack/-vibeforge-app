"use client";

import { useEffect, useState, useCallback } from "react";
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
  User,
  Phone,
  Mail,
  FileText,
  Clock,
  Loader2,
  Plus,
  Tag,
  DollarSign,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Megaphone,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PatientDrawerProps {
  patient: PatientWithTags;
  onClose: () => void;
  onUpdate: () => void;
}

type DrawerTab = "history" | "finances" | "marketing";

type AppointmentWithDetails = Appointment & {
  doctors: Doctor;
  services: Service;
  offices: Office;
};

export function PatientDrawer({ patient, onClose, onUpdate }: PatientDrawerProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<DrawerTab>("history");
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  // Marketing fields
  const [adicional1, setAdicional1] = useState(patient.adicional_1 ?? "");
  const [adicional2, setAdicional2] = useState(patient.adicional_2 ?? "");
  const [vieneDesde, setVieneDesde] = useState(patient.viene_desde ?? "");
  const [savingMarketing, setSavingMarketing] = useState(false);

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentAppointmentId, setPaymentAppointmentId] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const fetchHistory = useCallback(async () => {
    const supabase = createClient();
    const [apptRes, payRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("*, doctors(*), services(*), offices(*)")
        .eq("patient_id", patient.id)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false }),
      supabase
        .from("patient_payments")
        .select("*")
        .eq("patient_id", patient.id)
        .order("payment_date", { ascending: false }),
    ]);

    setAppointments((apptRes.data as AppointmentWithDetails[]) ?? []);
    setPayments((payRes.data as PatientPayment[]) ?? []);
    setLoading(false);
  }, [patient.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Update marketing fields when patient changes
  useEffect(() => {
    setAdicional1(patient.adicional_1 ?? "");
    setAdicional2(patient.adicional_2 ?? "");
    setVieneDesde(patient.viene_desde ?? "");
  }, [patient]);

  // Financial calculations
  const totalServiceCost = appointments
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + Number(a.services?.base_price ?? 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingBalance = totalServiceCost - totalPaid;

  // Add tag
  const handleAddTag = async (tagValue: string) => {
    if (!tagValue.trim()) return;
    setAddingTag(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("patient_tags")
      .insert({ patient_id: patient.id, tag: tagValue.trim() });

    setAddingTag(false);
    if (error) {
      toast.error(t("patients.save_error"));
      return;
    }
    setNewTag("");
    onUpdate();
  };

  // Remove tag
  const handleRemoveTag = async (tagId: string) => {
    const supabase = createClient();
    await supabase.from("patient_tags").delete().eq("id", tagId);
    onUpdate();
  };

  // Save marketing
  const handleSaveMarketing = async () => {
    setSavingMarketing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("patients")
      .update({
        adicional_1: adicional1 || null,
        adicional_2: adicional2 || null,
        viene_desde: vieneDesde || null,
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

  // Save payment
  const handleSavePayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    setSavingPayment(true);
    const supabase = createClient();
    const { error } = await supabase.from("patient_payments").insert({
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
    fetchHistory();
  };

  const tabs: { key: DrawerTab; label: string; icon: typeof Clock }[] = [
    { key: "history", label: t("patients.tab_history"), icon: Clock },
    { key: "finances", label: t("patients.tab_finances"), icon: DollarSign },
    { key: "marketing", label: t("patients.tab_marketing"), icon: Megaphone },
  ];

  return (
    <div className="w-full border-l border-border bg-card md:w-[420px] lg:w-[480px] shrink-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{
                backgroundColor: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af",
              }}
            >
              {patient.first_name[0]}{patient.last_name[0]}
            </div>
            <div>
              <h3 className="text-base font-bold">
                {patient.first_name} {patient.last_name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {patient.dni && <span>DNI: {patient.dni}</span>}
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
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contact info */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {patient.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {patient.phone}
            </span>
          )}
          {patient.email && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" /> {patient.email}
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
          <div className="relative group">
            <button
              className="flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Tag className="h-3 w-3" />
              <Plus className="h-3 w-3" />
            </button>
            <div className="invisible group-hover:visible absolute left-0 top-full z-10 mt-1 rounded-lg border border-border bg-card p-2 shadow-xl min-w-[160px]">
              {COMMON_PATIENT_TAGS.filter(
                (tag) => !patient.patient_tags.some((pt) => pt.tag === tag)
              ).map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleAddTag(tag)}
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
                      }
                    }}
                  />
                  <button
                    onClick={() => handleAddTag(newTag)}
                    disabled={addingTag || !newTag.trim()}
                    className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Debt alert */}
        {pendingBalance > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {t("patients.pending_balance")}: S/. {pendingBalance.toFixed(2)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === "history" ? (
          /* ===== HISTORY TAB ===== */
          <div className="space-y-3">
            {appointments.length === 0 ? (
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
                    : AlertCircle;

                return (
                  <div
                    key={appt.id}
                    className="rounded-lg border border-border p-3"
                    style={{ borderLeftWidth: "4px", borderLeftColor: statusColor }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusIcon className="h-4 w-4" style={{ color: statusColor }} />
                        <span className="text-xs font-semibold">{appt.appointment_date}</span>
                        <span className="text-xs text-muted-foreground">
                          {appt.start_time.slice(0, 5)} — {appt.end_time.slice(0, 5)}
                        </span>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: statusColor + "20",
                          color: statusColor,
                        }}
                      >
                        {t(`scheduler.status_${appt.status}`)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      <p>{appt.services?.name} — {appt.offices?.name}</p>
                      <p className="flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
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
        ) : activeTab === "finances" ? (
          /* ===== FINANCES TAB ===== */
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{t("patients.service_price")}</p>
                <p className="mt-1 text-base font-bold">S/. {totalServiceCost.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{t("patients.total_paid")}</p>
                <p className="mt-1 text-base font-bold text-emerald-600">S/. {totalPaid.toFixed(2)}</p>
              </div>
              <div className={cn(
                "rounded-lg border p-3 text-center",
                pendingBalance > 0 ? "border-red-500/30 bg-red-500/5" : "border-border"
              )}>
                <p className="text-[10px] uppercase text-muted-foreground">{t("patients.pending_balance")}</p>
                <p className={cn(
                  "mt-1 text-base font-bold",
                  pendingBalance > 0 ? "text-red-600" : "text-foreground"
                )}>
                  S/. {pendingBalance.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Add payment */}
            <button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("patients.add_payment")}
            </button>

            {showPaymentForm && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
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
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("patients.payment_method")}</label>
                  <input
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="Efectivo, Tarjeta, etc."
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
                            {a.appointment_date} — {a.services?.name} — S/. {Number(a.services?.base_price ?? 0).toFixed(2)}
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
              </div>
            )}

            {/* Payments list */}
            {payments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Pagos registrados
                </h4>
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-xs font-medium">S/. {Number(p.amount).toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.payment_date} {p.payment_method && `• ${p.payment_method}`}
                      </p>
                      {p.notes && (
                        <p className="text-[10px] text-muted-foreground">{p.notes}</p>
                      )}
                    </div>
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ===== MARKETING TAB ===== */
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.adicional_1")}</label>
                <input
                  value={adicional1}
                  onChange={(e) => setAdicional1(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Campo personalizado..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.adicional_2")}</label>
                <input
                  value={adicional2}
                  onChange={(e) => setAdicional2(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Campo personalizado..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("patients.viene_desde")}</label>
                <input
                  value={vieneDesde}
                  onChange={(e) => setVieneDesde(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="TikTok, Instagram, Referido..."
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
      </div>
    </div>
  );
}
