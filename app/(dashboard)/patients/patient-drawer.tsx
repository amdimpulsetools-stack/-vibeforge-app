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
  Megaphone,
  Save,
  Edit2,
  Stethoscope,
  Lock,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { PERU_DEPARTAMENTOS, PERU_DEPARTAMENTO_LIST, COUNTRIES } from "@/lib/peru-locations";
import { calculateAge } from "@/lib/export";
import type { ClinicalNote } from "@/types/clinical-notes";
import { SOAP_LABELS, VITALS_FIELDS, type SOAPSection, type Vitals } from "@/types/clinical-notes";
import { TreatmentPlansPanel } from "./treatment-plans-panel";
import { PrescriptionsPanel } from "./prescriptions-panel";
import { ClinicalAttachmentsPanel } from "./clinical-attachments-panel";
import { ClinicalFollowupsPanel } from "./clinical-followups-panel";
import { VitalsTrendsChart } from "./vitals-trends-chart";
import { DiagnosisHistoryPanel } from "./diagnosis-history-panel";

interface PatientDrawerProps {
  patient: PatientWithTags;
  onClose: () => void;
  onUpdate: () => void;
}

type DrawerTab = "info" | "history" | "clinical" | "finances" | "marketing";

type AppointmentWithDetails = Appointment & {
  doctors: Doctor;
  services: Service;
  offices: Office;
};

export function PatientDrawer({ patient, onClose, onUpdate }: PatientDrawerProps) {
  const { t } = useLanguage();
  const { organizationId } = useOrganization();
  const [activeTab, setActiveTab] = useState<DrawerTab>("info");
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [savingInfo, setSavingInfo] = useState(false);

  // Marketing fields
  const [customField1, setCustomField1] = useState(patient.custom_field_1 ?? "");
  const [customField2, setCustomField2] = useState(patient.custom_field_2 ?? "");
  const [referralSource, setReferralSource] = useState(patient.referral_source ?? "");
  const [savingMarketing, setSavingMarketing] = useState(false);

  // Clinical notes
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

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
    setCustomField1(patient.custom_field_1 ?? "");
    setCustomField2(patient.custom_field_2 ?? "");
    setReferralSource(patient.referral_source ?? "");
  }, [patient]);

  // Financial calculations
  const totalServiceCost = appointments
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + Number(a.services?.base_price ?? 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingBalance = totalServiceCost - totalPaid;

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
      })
      .eq("id", patient.id);

    setSavingInfo(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Este DNI ya está registrado en otro paciente");
      } else {
        toast.error(t("patients.save_error"));
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
    fetchHistory();
  };

  const tabs: { key: DrawerTab; label: string; icon: typeof Clock }[] = [
    { key: "info", label: "Datos", icon: Edit2 },
    { key: "history", label: t("patients.tab_history"), icon: Clock },
    { key: "clinical", label: "Clínico", icon: Stethoscope },
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

        {/* Debt alert */}
        {pendingBalance > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {t("patients.pending_balance")}: S/. {pendingBalance.toFixed(2)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 shrink-0",
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

        {/* ===== INFO TAB (EDIT PATIENT) ===== */}
        {activeTab === "info" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Edita los datos personales del paciente.</p>

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
        )}

        {/* ===== CLINICAL TAB ===== */}
        {activeTab === "clinical" && (
          <div className="space-y-3">
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
                      cn_note.is_signed && "border-l-4 border-l-emerald-500"
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
                        <span className="text-xs font-semibold">
                          {new Date(cn_note.created_at).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {doctorInfo && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: doctorInfo.color }}
                            />
                            {doctorInfo.full_name}
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
                              <p className="text-xs text-foreground pl-[22px] whitespace-pre-wrap">
                                {content}
                              </p>
                            </div>
                          );
                        })}

                        {/* Diagnosis */}
                        {(cn_note.diagnosis_code || cn_note.diagnosis_label) && (
                          <div className="pl-[22px] text-xs">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Diagnóstico: </span>
                            {cn_note.diagnosis_code && (
                              <span className="font-mono font-medium text-primary">{cn_note.diagnosis_code}</span>
                            )}
                            {cn_note.diagnosis_code && cn_note.diagnosis_label && " — "}
                            {cn_note.diagnosis_label}
                          </div>
                        )}

                        {/* Vitals summary */}
                        {hasVitals && (
                          <div className="pl-[22px]">
                            <div className="flex items-center gap-1 mb-1">
                              <Heart className="h-3 w-3 text-red-500" />
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Signos Vitales</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
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
              <VitalsTrendsChart patientId={patient.id} />
              <DiagnosisHistoryPanel patientId={patient.id} />
              <TreatmentPlansPanel patientId={patient.id} canEdit={false} />
              <PrescriptionsPanel patientId={patient.id} canEdit={false} />
              <ClinicalFollowupsPanel patientId={patient.id} canEdit={false} />
              <ClinicalAttachmentsPanel patientId={patient.id} canEdit={false} />
            </div>
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
                <label className="text-xs font-medium">{t("patients.referral_source")}</label>
                <input
                  value={referralSource}
                  onChange={(e) => setReferralSource(e.target.value)}
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
