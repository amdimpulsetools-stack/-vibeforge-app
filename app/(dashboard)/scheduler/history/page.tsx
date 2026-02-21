"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { format, subDays } from "date-fns";
import type { AppointmentWithRelations, Doctor, Service } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import {
  CalendarDays,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  User,
  Stethoscope,
  Building2,
  ClipboardList,
  DollarSign,
} from "lucide-react";

export default function AppointmentHistoryPage() {
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDoctor, setFilterDoctor] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<"date" | "patient" | "price">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch master data
  useEffect(() => {
    const fetchMaster = async () => {
      const supabase = createClient();
      const [doctorsRes, servicesRes] = await Promise.all([
        supabase.from("doctors").select("*").order("full_name"),
        supabase.from("services").select("*").order("name"),
      ]);
      setDoctors(doctorsRes.data ?? []);
      setServices(servicesRes.data ?? []);
    };
    fetchMaster();
  }, []);

  // Fetch appointments
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("appointments")
      .select("*, doctors(*), offices(*), services(*)")
      .gte("appointment_date", dateFrom)
      .lte("appointment_date", dateTo)
      .order("appointment_date", { ascending: sortDir === "asc" })
      .order("start_time", { ascending: sortDir === "asc" });

    if (filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    if (filterDoctor !== "all") {
      query = query.eq("doctor_id", filterDoctor);
    }

    if (filterService !== "all") {
      query = query.eq("service_id", filterService);
    }

    const { data } = await query;
    setAppointments((data as AppointmentWithRelations[]) ?? []);
    setLoading(false);
  }, [dateFrom, dateTo, filterStatus, filterDoctor, filterService, sortDir]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Client-side text filter
  const filtered = appointments.filter((a) => {
    if (!searchText.trim()) return true;
    const term = searchText.toLowerCase();
    return (
      a.patient_name.toLowerCase().includes(term) ||
      a.doctors?.full_name?.toLowerCase().includes(term) ||
      a.services?.name?.toLowerCase().includes(term) ||
      a.offices?.name?.toLowerCase().includes(term)
    );
  });

  // Client-side sort for patient/price
  const sorted = [...filtered].sort((a, b) => {
    if (sortField === "patient") {
      const cmp = a.patient_name.localeCompare(b.patient_name);
      return sortDir === "asc" ? cmp : -cmp;
    }
    if (sortField === "price") {
      const priceA = a.price_snapshot ?? a.services?.base_price ?? 0;
      const priceB = b.price_snapshot ?? b.services?.base_price ?? 0;
      return sortDir === "asc" ? priceA - priceB : priceB - priceA;
    }
    // date sort is handled by the query
    return 0;
  });

  const toggleSort = (field: "date" | "patient" | "price") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  // Stats
  const totalRevenue = sorted.reduce((sum, a) => {
    if (a.status === "cancelled") return sum;
    return sum + (a.price_snapshot ?? Number(a.services?.base_price ?? 0));
  }, 0);

  const completedCount = sorted.filter((a) => a.status === "completed").length;
  const cancelledCount = sorted.filter((a) => a.status === "cancelled").length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{t("history.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("history.subtitle")}</p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <Filter className="h-4 w-4" />
            {t("history.filters")}
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("history.date_from")}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("history.date_to")}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("scheduler.status")}</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              >
                <option value="all">{t("patients.filter_all")}</option>
                <option value="scheduled">{t("scheduler.status_scheduled")}</option>
                <option value="confirmed">{t("scheduler.status_confirmed")}</option>
                <option value="completed">{t("scheduler.status_completed")}</option>
                <option value="cancelled">{t("scheduler.status_cancelled")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("scheduler.doctor")}</label>
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              >
                <option value="all">{t("patients.filter_all")}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("scheduler.service")}</label>
              <select
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              >
                <option value="all">{t("patients.filter_all")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Search + Stats */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("patients.search_placeholder")}
              className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{sorted.length} {t("history.records")}</span>
            <span className="text-emerald-500">{completedCount} {t("scheduler.status_completed").toLowerCase()}</span>
            <span className="text-red-500">{cancelledCount} {t("scheduler.status_cancelled").toLowerCase()}</span>
            <span className="font-medium text-foreground">S/. {totalRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">{t("common.no_results")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleSort("date")}
                >
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {t("scheduler.date")}
                    <SortIcon field="date" />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {t("scheduler.time")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleSort("patient")}
                >
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {t("scheduler.patient_name")}
                    <SortIcon field="patient" />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" />
                    {t("scheduler.doctor")}
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <ClipboardList className="h-3 w-3" />
                    {t("scheduler.service")}
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {t("scheduler.office")}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-right font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleSort("price")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <DollarSign className="h-3 w-3" />
                    {t("history.price")}
                    <SortIcon field="price" />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium">{t("scheduler.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((appt) => {
                const statusColor = APPOINTMENT_STATUS_COLORS[appt.status] ?? "#9ca3af";
                const displayPrice = appt.price_snapshot ?? Number(appt.services?.base_price ?? 0);

                return (
                  <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{appt.appointment_date}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {appt.start_time.slice(0, 5)} — {appt.end_time.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3 font-medium">{appt.patient_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: appt.doctors?.color }}
                        />
                        {appt.doctors?.full_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{appt.services?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{appt.offices?.name}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      S/. {displayPrice.toFixed(2)}
                      {appt.price_snapshot != null && (
                        <span className="ml-1 text-[10px] text-muted-foreground/60" title={t("history.price_locked")}>*</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: statusColor + "20",
                          color: statusColor,
                        }}
                      >
                        {t(`scheduler.status_${appt.status}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
