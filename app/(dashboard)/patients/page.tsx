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
  ChevronLeft,
  ChevronDown,
  Tag,
  Calendar,
  DollarSign,
  MapPin,
  Stethoscope,
  Download,
  Cake,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrganization } from "@/components/organization-provider";
import { usePlan } from "@/hooks/use-plan";
import { PatientDrawer } from "./patient-drawer";
import { PatientFormModal } from "./patient-form-modal";
import { BulkImportModal } from "./bulk-import-modal";
import { RecurringBadge } from "@/components/patients/recurring-badge";
import { exportToCSV, calculateAge } from "@/lib/export";

type StatusFilter = "all" | "active" | "inactive";
type RecurrenceFilter = "all" | "new" | "recurring";

const PAGE_SIZE = 25;

// Extra data per patient — loaded on-demand only when debt/service filter or CSV export is used
type PatientExtraData = {
  appointments: { service_id: string; status: string; price_snapshot: number | null; origin: string | null; services: { id: string; name: string } }[];
  patient_payments: { amount: number }[];
};

export default function PatientsPage() {
  const { t } = useLanguage();
  const { isDoctor } = useOrgRole();
  const { organization } = useOrganization();
  const { plan } = usePlan();
  const canExport = plan?.feature_export !== false;
  const isDoctorRestricted =
    isDoctor &&
    (organization as any)?.settings?.restrict_doctor_patients === true;
  const [patients, setPatients] = useState<PatientWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingPage, setChangingPage] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceFilter>("all");
  const [selectedPatient, setSelectedPatient] = useState<PatientWithTags | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Extra data (appointments/payments) — loaded on-demand for debt/service filters and CSV
  const [extraData, setExtraData] = useState<Record<string, PatientExtraData>>({});
  const [loadingExtra, setLoadingExtra] = useState(false);

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
      .select("id, label, display_order, lookup_categories!inner(slug)")
      .eq("lookup_categories.slug", "origin")
      .eq("is_active", true)
      .or(`organization_id.is.null${organization?.id ? `,organization_id.eq.${organization.id}` : ""}`)
      .order("display_order")
      .then(({ data }) =>
        setOriginOptions(
          (data ?? []).map((v: { label: string }) => ({ label: v.label, value: v.label }))
        )
      );
  }, []);

  // Debounce search input — wait 300ms before querying DB
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset pagination when DB-side filters change
  useEffect(() => {
    setPage(0);
    setPatients([]);
    setExtraData({});
  }, [statusFilter, debouncedSearch, dateFrom, dateTo, origenFilter]);

  // Lightweight list query — only patient data + tags, NO appointments/payments
  const fetchPatients = useCallback(async (pageNum: number) => {
    setLoading(true);
    setChangingPage(true);
    const supabase = createClient();

    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("patients")
      .select(
        "id, first_name, last_name, dni, document_type, phone, email, birth_date, status, is_recurring, created_at, referral_source, origin, departamento, distrito, notes, custom_field_1, custom_field_2, is_foreigner, nationality, patient_tags(id, tag)",
        { count: "exact" }
      )
      .order("last_name")
      .range(from, to);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (recurrenceFilter === "recurring") {
      query = query.eq("is_recurring", true);
    } else if (recurrenceFilter === "new") {
      query = query.eq("is_recurring", false);
    }
    if (debouncedSearch.trim()) {
      const q = `%${debouncedSearch.trim()}%`;
      query = query.or(`first_name.ilike.${q},last_name.ilike.${q},dni.ilike.${q},phone.ilike.${q}`);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo + "T23:59:59");
    }
    if (origenFilter) {
      query = query.or(`referral_source.eq.${origenFilter},origin.eq.${origenFilter}`);
    }

    const { data, count } = await query;
    setPatients((data as unknown as PatientWithTags[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
    setChangingPage(false);
  }, [statusFilter, recurrenceFilter, debouncedSearch, dateFrom, dateTo, origenFilter]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
    fetchPatients(0);
  }, [fetchPatients]);

  // Fetch when page changes (but not on filter change — that's handled above)
  useEffect(() => {
    if (page > 0) fetchPatients(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  // On-demand: fetch appointments/payments for loaded patients (debt/service filter + CSV)
  const fetchExtraData = useCallback(async (patientIds: string[]): Promise<Record<string, PatientExtraData>> => {
    const missing = patientIds.filter((id) => !extraData[id]);
    if (missing.length === 0) return extraData;

    setLoadingExtra(true);
    const supabase = createClient();
    const [apptRes, payRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("patient_id, service_id, status, price_snapshot, origin, services(id, name)")
        .in("patient_id", missing),
      supabase
        .from("patient_payments")
        .select("patient_id, amount")
        .in("patient_id", missing),
    ]);

    const appts = (apptRes.data ?? []) as unknown as (PatientExtraData["appointments"][number] & { patient_id: string })[];
    const pays = (payRes.data ?? []) as unknown as (PatientExtraData["patient_payments"][number] & { patient_id: string })[];

    const updated = { ...extraData };
    for (const id of missing) {
      updated[id] = {
        appointments: appts.filter((a) => a.patient_id === id),
        patient_payments: pays.filter((p) => p.patient_id === id),
      };
    }
    setExtraData(updated);
    setLoadingExtra(false);
    return updated;
  }, [extraData]);

  // Auto-fetch extra data when debt or service filter is turned on
  useEffect(() => {
    if ((!debtFilter && !serviceFilter) || patients.length === 0) return;
    fetchExtraData(patients.map((p) => p.id));
  }, [debtFilter, serviceFilter, patients, fetchExtraData]);

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

  // Client-side filtering (only for filters that can't easily run DB-side)
  const filteredPatients = useMemo(() => {
    if (tagFilter.length === 0 && !serviceFilter && !debtFilter) return patients;

    return patients.filter((p) => {
      // Tag filter
      if (tagFilter.length > 0) {
        const patientTags = p.patient_tags.map((pt) => pt.tag);
        if (!tagFilter.every((tag) => patientTags.includes(tag))) return false;
      }

      // Service & debt filters need extra data — skip patient if not loaded yet
      const extra = extraData[p.id];

      if (serviceFilter) {
        if (!extra) return false;
        const hasService = extra.appointments?.some(
          (a) => a.service_id === serviceFilter && a.status !== "cancelled"
        );
        if (!hasService) return false;
      }

      if (debtFilter) {
        if (!extra) return false;
        const totalBilled =
          extra.appointments
            ?.filter((a) => a.status !== "cancelled")
            .reduce((sum, a) => sum + (Number(a.price_snapshot) || 0), 0) ?? 0;
        const totalPaid =
          extra.patient_payments?.reduce((sum, pay) => sum + Number(pay.amount), 0) ?? 0;
        if (totalBilled - totalPaid <= 0) return false;
      }

      return true;
    });
  }, [patients, tagFilter, serviceFilter, debtFilter, extraData]);

  const handleSaved = () => {
    setPage(0);
    setPatients([]);
    setExtraData({});
    fetchPatients(0);
    setShowForm(false);
    setSelectedPatient(null);
  };

  const handlePatientUpdated = () => {
    setPage(0);
    setPatients([]);
    setExtraData({});
    fetchPatients(0);
    if (selectedPatient) {
      const supabase = createClient();
      supabase
        .from("patients")
        .select("id, first_name, last_name, dni, document_type, phone, email, birth_date, status, is_recurring, created_at, referral_source, origin, departamento, distrito, notes, custom_field_1, custom_field_2, is_foreigner, nationality, patient_tags(id, tag)")
        .eq("id", selectedPatient.id)
        .single()
        .then(({ data }) => {
          if (data) setSelectedPatient(data as unknown as PatientWithTags);
        });
    }
  };

  const toggleTag = (tag: string) => {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const [exporting, setExporting] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    // Fetch extra data for all visible patients (on-demand)
    const ids = filteredPatients.map((p) => p.id);
    const allExtra = await fetchExtraData(ids);

    const headers = [
      "Apellido", "Nombre", "DNI", "Tipo Doc.", "Teléfono", "Email",
      "Fecha Nac.", "Edad", "Estado", "Tags", "Departamento", "Distrito",
      "Origen", "Total Facturado", "Total Pagado", "Deuda",
    ];
    const rows = filteredPatients.map((p) => {
      const extra = allExtra[p.id];
      const totalBilled = extra?.appointments
        ?.filter((a) => a.status !== "cancelled")
        .reduce((sum, a) => sum + (Number(a.price_snapshot) || 0), 0) ?? 0;
      const totalPaid = extra?.patient_payments?.reduce((sum, pay) => sum + Number(pay.amount), 0) ?? 0;
      const age = calculateAge(p.birth_date);
      return [
        p.last_name, p.first_name, p.dni, p.document_type, p.phone, p.email,
        p.birth_date, age != null ? age : "",
        p.status, p.patient_tags.map((t) => t.tag).join("; "),
        p.departamento, p.distrito, p.referral_source ?? p.origin,
        totalBilled.toFixed(2), totalPaid.toFixed(2), Math.max(0, totalBilled - totalPaid).toFixed(2),
      ];
    });
    const date = new Date().toISOString().slice(0, 10);
    exportToCSV(headers, rows, `pacientes_${date}.csv`);
    setExporting(false);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Main List */}
      <div className={cn("flex flex-1 flex-col overflow-hidden", selectedPatient && "hidden md:flex")}>
        {/* Header */}
        <div className="border-b border-border bg-card px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowBulkImport(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Importar pacientes desde CSV"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Importar</span>
              </button>
              <button
                onClick={canExport ? handleExportCSV : undefined}
                disabled={!canExport || filteredPatients.length === 0 || exporting}
                className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={canExport ? "Exportar CSV" : "Disponible en plan Centro Médico"}
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                CSV
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                {t("patients.add")}
              </button>
            </div>
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
            <div className="flex flex-wrap gap-1.5">
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
              {/* Recurrence filter */}
              <div className="mx-1 h-7 w-px self-center bg-border" />
              {(["new", "recurring"] as RecurrenceFilter[]).map((f) => {
                const active = recurrenceFilter === f;
                const label = f === "new" ? "Nuevos" : "Recurrentes";
                return (
                  <button
                    key={f}
                    onClick={() =>
                      setRecurrenceFilter(active ? "all" : f)
                    }
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? f === "recurring"
                          ? "bg-emerald-500 text-white"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">
                          {patient.last_name}, {patient.first_name}
                        </p>
                        {patient.is_recurring && <RecurringBadge size="xs" />}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {patient.dni && <span>DNI: {patient.dni}</span>}
                        {patient.phone && <span>{patient.phone}</span>}
                        {patient.birth_date && (() => {
                          const age = calculateAge(patient.birth_date);
                          return age != null ? (
                            <span className="flex items-center gap-0.5">
                              <Cake className="h-3 w-3" />
                              {age} años
                            </span>
                          ) : null;
                        })()}
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => p - 1)}
                      disabled={!canPrev || changingPage}
                      className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium tabular-nums min-w-[4rem] text-center">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!canNext || changingPage}
                      className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer count */}
        <div className="border-t border-border bg-card px-6 py-2 text-xs text-muted-foreground flex items-center gap-2">
          {totalCount} {totalCount === 1 ? "paciente" : "pacientes"}{totalPages > 1 ? ` · Página ${page + 1} de ${totalPages}` : ""}
          {loadingExtra && (
            <span className="flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando filtros...
            </span>
          )}
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

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onSuccess={handleSaved}
        />
      )}
    </div>
  );
}
