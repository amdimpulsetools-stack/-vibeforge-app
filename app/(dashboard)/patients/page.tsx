"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import type { PatientWithTags } from "@/types/admin";
import { PATIENT_STATUS_COLORS } from "@/types/admin";
import {
  Search,
  Plus,
  Users,
  SlidersHorizontal,
  X,
  Loader2,
  ChevronRight,
  ChevronDown,
  Tag,
  Calendar,
  DollarSign,
  MapPin,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrganization } from "@/components/organization-provider";
import { PatientDrawer } from "./patient-drawer";
import { PatientFormModal } from "./patient-form-modal";

type StatusFilter = "all" | "active" | "inactive";

// Extended patient type with appointment/payment data for filtering
type PatientExtended = PatientWithTags & {
  appointments: { service_id: string; status: string; price_snapshot: number | null; origin: string | null; services: { id: string; name: string } }[];
  patient_payments: { amount: number }[];
};

export default function PatientsPage() {
  const { t } = useLanguage();
  const { isDoctor } = useOrgRole();
  const { organization } = useOrganization();
  const isDoctorRestricted =
    isDoctor &&
    (organization as any)?.settings?.restrict_doctor_patients === true;
  const [patients, setPatients] = useState<PatientExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPatient, setSelectedPatient] = useState<PatientWithTags | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [serviceFilter, setServiceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [debtFilter, setDebtFilter] = useState(false);
  const [origenFilter, setOrigenFilter] = useState("");

  // Services + Origins from lookup_values
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [originOptions, setOriginOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("services")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setServices(data ?? []));
    supabase
      .from("lookup_values")
      .select("*, lookup_categories!inner(slug)")
      .eq("lookup_categories.slug", "origin")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) =>
        setOriginOptions(
          (data ?? []).map((v: { label: string }) => ({ label: v.label, value: v.label }))
        )
      );
  }, []);

  const fetchPatients = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("patients")
      .select("*, patient_tags(*), appointments(service_id, status, price_snapshot, origin, services(id, name)), patient_payments(amount)")
      .order("last_name");

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    setPatients((data as PatientExtended[]) ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Derived data for filter dropdowns
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    patients.forEach((p) => p.patient_tags.forEach((t) => tagSet.add(t.tag)));
    return Array.from(tagSet).sort();
  }, [patients]);


  // Active filter count
  const activeFilterCount = [
    tagFilter.length > 0,
    serviceFilter !== "",
    dateFrom !== "",
    dateTo !== "",
    debtFilter,
    origenFilter !== "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setTagFilter([]);
    setServiceFilter("");
    setDateFrom("");
    setDateTo("");
    setDebtFilter(false);
    setOrigenFilter("");
  };

  // Client-side filtering
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        if (
          !fullName.includes(q) &&
          !(p.dni && p.dni.toLowerCase().includes(q)) &&
          !(p.phone && p.phone.includes(q))
        ) {
          return false;
        }
      }

      // Tag filter — patient must have ALL selected tags
      if (tagFilter.length > 0) {
        const patientTags = p.patient_tags.map((pt) => pt.tag);
        if (!tagFilter.every((tag) => patientTags.includes(tag))) return false;
      }

      // Service filter — patient must have at least one non-cancelled appointment with this service
      if (serviceFilter) {
        const hasService = p.appointments?.some(
          (a) => a.service_id === serviceFilter && a.status !== "cancelled"
        );
        if (!hasService) return false;
      }

      // Date range filter (on created_at)
      if (dateFrom && p.created_at < dateFrom) return false;
      if (dateTo && p.created_at > dateTo + "T23:59:59") return false;

      // Debt filter
      if (debtFilter) {
        const totalBilled =
          p.appointments
            ?.filter((a) => a.status !== "cancelled")
            .reduce((sum, a) => sum + (Number(a.price_snapshot) || 0), 0) ?? 0;
        const totalPaid =
          p.patient_payments?.reduce((sum, pay) => sum + Number(pay.amount), 0) ?? 0;
        if (totalBilled - totalPaid <= 0) return false;
      }

      // Origin filter — check patient.viene_desde, patient.origin, and appointment origins
      if (origenFilter) {
        const matchesPatient = p.viene_desde === origenFilter || p.origin === origenFilter;
        const matchesAppointment = p.appointments?.some((a) => a.origin === origenFilter);
        if (!matchesPatient && !matchesAppointment) return false;
      }

      return true;
    });
  }, [patients, search, tagFilter, serviceFilter, dateFrom, dateTo, debtFilter, origenFilter]);

  const handleSaved = () => {
    fetchPatients();
    setShowForm(false);
    setSelectedPatient(null);
  };

  const handlePatientUpdated = () => {
    fetchPatients();
    if (selectedPatient) {
      const supabase = createClient();
      supabase
        .from("patients")
        .select("*, patient_tags(*)")
        .eq("id", selectedPatient.id)
        .single()
        .then(({ data }) => {
          if (data) setSelectedPatient(data as PatientWithTags);
        });
    }
  };

  const toggleTag = (tag: string) => {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Main List */}
      <div className={cn("flex flex-1 flex-col overflow-hidden", selectedPatient && "hidden md:flex")}>
        {/* Header */}
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{t("patients.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("patients.subtitle")}</p>
              {isDoctorRestricted && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-cyan-400">
                  <Stethoscope className="h-3 w-3" />
                  {t("patients.doctor_restricted_badge")}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              {t("patients.add")}
            </button>
          </div>

          {/* Search & Status + Filter toggle */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("patients.search_placeholder")}
                className="w-full rounded-lg border border-input bg-background pl-10 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {(["all", "active", "inactive"] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {t(`patients.filter_${f}`)}
                </button>
              ))}
              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  showFilters || activeFilterCount > 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("patients.filters")}
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className={cn("h-3 w-3 transition-transform", showFilters && "rotate-180")} />
              </button>
            </div>
          </div>

          {/* Advanced Filter Panel */}
          {showFilters && (
            <div className="mt-3 rounded-lg border border-border bg-background p-4 space-y-4">
              {/* Row 1: Tags */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  {t("patients.filter_tags")}
                </label>
                {availableTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                          tagFilter.includes(tag)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60">{t("patients.filter_tags_placeholder")}</p>
                )}
              </div>

              {/* Row 2: Service + Origin */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Stethoscope className="h-3.5 w-3.5" />
                    {t("patients.filter_service")}
                  </label>
                  <select
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  >
                    <option value="">{t("patients.filter_service_placeholder")}</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("patients.filter_origin")}
                  </label>
                  <select
                    value={origenFilter}
                    onChange={(e) => setOrigenFilter(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  >
                    <option value="">{t("patients.filter_origin_placeholder")}</option>
                    {originOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Date range + Debt toggle */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {t("patients.filter_date_from")}
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {t("patients.filter_date_to")}
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setDebtFilter(!debtFilter)}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      debtFilter
                        ? "bg-red-500/10 text-red-500 border border-red-500/30"
                        : "bg-muted text-muted-foreground hover:bg-accent border border-transparent"
                    )}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    {t("patients.filter_with_debt")}
                  </button>
                </div>
              </div>

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                    {t("patients.filter_clear")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active filter chips (visible when panel is collapsed) */}
          {!showFilters && activeFilterCount > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {tagFilter.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                >
                  {tag}
                  <button onClick={() => toggleTag(tag)} className="hover:text-primary/70">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {serviceFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-500">
                  {services.find((s) => s.id === serviceFilter)?.name}
                  <button onClick={() => setServiceFilter("")} className="hover:text-blue-400">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {(dateFrom || dateTo) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-500">
                  {dateFrom || "..."} — {dateTo || "..."}
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="hover:text-orange-400">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {debtFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                  {t("patients.filter_with_debt")}
                  <button onClick={() => setDebtFilter(false)} className="hover:text-red-400">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {origenFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-500">
                  {origenFilter}
                  <button onClick={() => setOrigenFilter("")} className="hover:text-violet-400">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              <button
                onClick={clearFilters}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("patients.filter_clear")}
              </button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">{search || activeFilterCount > 0 ? t("common.no_results") : t("patients.no_patients")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredPatients.map((patient) => {
                const isSelected = selectedPatient?.id === patient.id;
                return (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className={cn(
                      "flex w-full items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-accent/50",
                      isSelected && "bg-primary/5 border-l-2 border-l-primary"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{
                        backgroundColor: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af",
                      }}
                    >
                      {patient.first_name[0]}{patient.last_name[0]}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {patient.last_name}, {patient.first_name}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {patient.dni && <span>DNI: {patient.dni}</span>}
                        {patient.phone && <span>{patient.phone}</span>}
                      </div>
                      {/* Tags */}
                      {patient.patient_tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {patient.patient_tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                            >
                              {tag.tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer count */}
        <div className="border-t border-border bg-card px-6 py-2 text-xs text-muted-foreground">
          {filteredPatients.length} {filteredPatients.length === 1 ? "paciente" : "pacientes"}
        </div>
      </div>

      {/* Drawer - 360° Profile */}
      {selectedPatient && (
        <PatientDrawer
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onUpdate={handlePatientUpdated}
        />
      )}

      {/* New Patient Modal */}
      {showForm && (
        <PatientFormModal
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
