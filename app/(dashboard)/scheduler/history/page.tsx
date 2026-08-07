"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { format, subDays, addDays } from "date-fns";
import type { AppointmentWithRelations, Doctor, Service } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { exportToCSV } from "@/lib/export";
import {
  SHEET_EXPORT_COLUMNS,
  buildExportRow,
  type SheetExportAppointment,
} from "@/lib/sheets-columns";
import {
  CalendarDays,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  User,
  Stethoscope,
  Building2,
  ClipboardList,
  DollarSign,
  Download,
} from "lucide-react";

const PAGE_SIZE = 50;
// Hard cap for a single CSV export (rango filtrado completo).
const EXPORT_CAP = 5000;

export default function AppointmentHistoryPage() {
  const { t, language } = useLanguage();
  const es = language === "es";
  const { organizationId } = useOrganization();
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDoctor, setFilterDoctor] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<"date" | "patient" | "price">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Master data para los dropdowns de filtros — solo las columnas que usan
  // los <option> (antes `*`: doctors arrastra bio/signature_url y services
  // toda la config). Cacheado 5 min por org: volver a la página no lo repite.
  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", "filter-names", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data } = await createClient()
        .from("doctors")
        .select("id, full_name")
        .order("full_name");
      return (data ?? []) as Doctor[];
    },
  });
  const doctors = doctorsData ?? [];

  const { data: servicesData } = useQuery({
    queryKey: ["services", "filter-names", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data } = await createClient()
        .from("services")
        .select("id, name")
        .order("name");
      return (data ?? []) as Service[];
    },
  });
  const services = servicesData ?? [];

  // El ORDER BY del servidor solo depende de la dirección cuando se ordena
  // por fecha; ordenar por paciente/precio es client-side sobre la página
  // cargada, así que alternar esos sorts NO refetchea (antes sí: sortDir
  // estaba en la key del fetch y cada toggle repetía la query).
  const dateSortAsc = sortField === "date" && sortDir === "asc";

  // Listado sobre React Query: key = filtros + página. Volver a una
  // combinación ya vista dentro del staleTime renderiza desde caché sin
  // query ni spinner; una página/filtro nuevo muestra el mismo spinner de
  // siempre (sin keepPreviousData a propósito — comportamiento idéntico).
  //
  // PERF: columnas explícitas en lugar de `*`. La tabla del historial solo
  // lee estos 7 campos (+ las relaciones, que ya eran explícitas); `*` traía
  // los 40+ de la fila, incluido `notes` (TEXT libre, el campo más pesado).
  //
  // El COUNT exact solo se pide en la primera página: recorre todo el rango
  // filtrado y su resultado no cambia al paginar, así que repetirlo en cada
  // "siguiente" era trabajo tirado. Al cambiar filtros siempre se vuelve a
  // page 0, o sea que el total mostrado en el pie sigue siendo correcto.
  const { data: listData, isPending: listPending } = useQuery({
    queryKey: [
      "history",
      "list",
      organizationId,
      { dateFrom, dateTo, filterStatus, filterDoctor, filterService, dateSortAsc, page },
    ],
    enabled: !!organizationId,
    queryFn: async () => {
      const supabase = createClient();
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const columns =
        "id, appointment_date, start_time, end_time, patient_name, status, price_snapshot, doctors(id, full_name, color), offices(id, name), services(id, name, duration_minutes, base_price)";

      let query = supabase
        .from("appointments")
        .select(columns, page === 0 ? { count: "exact" } : undefined)
        .gte("appointment_date", dateFrom)
        .lte("appointment_date", dateTo)
        .order("appointment_date", { ascending: dateSortAsc })
        .order("start_time", { ascending: dateSortAsc })
        .range(from, to);

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      if (filterDoctor !== "all") {
        query = query.eq("doctor_id", filterDoctor);
      }

      if (filterService !== "all") {
        query = query.eq("service_id", filterService);
      }

      const { data, count } = await query;
      return {
        rows: (data as unknown as AppointmentWithRelations[]) ?? [],
        count: count ?? null,
      };
    },
  });

  const appointments = listData?.rows ?? [];
  const loading = !organizationId || listPending;

  // El total llega solo con la página 0; se conserva mientras se pagina.
  useEffect(() => {
    const c = listData?.count;
    if (c != null) setTotalCount(c);
  }, [listData]);

  // Cambio de filtros (o de dirección del sort por fecha) → página 0.
  const filtersKey = `${dateFrom}|${dateTo}|${filterStatus}|${filterDoctor}|${filterService}|${dateSortAsc}`;
  useEffect(() => {
    setPage(0);
  }, [filtersKey]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

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

  // Export the FULL filtered range (not just the current page) to CSV with BOM,
  // using the same columns as the Google Sheets mirror.
  const handleExport = async () => {
    setExporting(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from("appointments")
        .select(
          "id, patient_name, patient_phone, appointment_date, start_time, end_time, status, origin, payment_method, price_snapshot, created_at, doctors(full_name), offices(name), services(name)"
        )
        .gte("appointment_date", dateFrom)
        .lte("appointment_date", dateTo)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(EXPORT_CAP + 1);

      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterDoctor !== "all") query = query.eq("doctor_id", filterDoctor);
      if (filterService !== "all") query = query.eq("service_id", filterService);

      const { data, error } = await query;
      if (error) {
        toast.error(es ? "Error al exportar." : "Export failed.");
        return;
      }

      let rows = (data ?? []) as unknown as SheetExportAppointment[];

      // Apply the same client-side text filter as the visible table.
      const term = searchText.trim().toLowerCase();
      if (term) {
        rows = rows.filter(
          (a) =>
            (a.patient_name ?? "").toLowerCase().includes(term) ||
            (a.doctors?.full_name ?? "").toLowerCase().includes(term) ||
            (a.services?.name ?? "").toLowerCase().includes(term) ||
            (a.offices?.name ?? "").toLowerCase().includes(term)
        );
      }

      if (rows.length > EXPORT_CAP) {
        rows = rows.slice(0, EXPORT_CAP);
        toast.warning(
          es
            ? `Se exportaron las primeras ${EXPORT_CAP} filas. Acota el rango de fechas para exportar menos.`
            : `Exported the first ${EXPORT_CAP} rows. Narrow the date range to export fewer.`
        );
      }

      if (rows.length === 0) {
        toast.info(t("common.no_results"));
        return;
      }

      const csvRows = rows.map(buildExportRow);
      const date = new Date().toISOString().slice(0, 10);
      exportToCSV([...SHEET_EXPORT_COLUMNS], csvRows, `citas_${date}.csv`);
    } finally {
      setExporting(false);
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
    /* Full-bleed en los dos ejes de breakpoint (pedido del founder: fuera
       el marco flotante también en escritorio).

       Móvil: los márgenes negativos cancelan el `p-4` del div interno del
       `main` (arriba y a los lados; el p-4 inferior se conserva) y la
       altura se recalibra: topbar 4rem + solo el p-4 inferior = 5rem.

       Desde md: se cancela el `p-7` por los cuatro lados (incluido el
       inferior) y la altura pasa a ser exactamente la del `main`
       (100dvh − topbar 4rem). El `px-4 md:px-6` de los headers internos
       queda como único gutter visible, igual que en Presupuestos.

       `dvh` porque 100vh en iOS incluye la barra de URL colapsable; en
       escritorio dvh == vh. */
    <div className="-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)]">
      {/* Header */}
      {/* En móvil el `main` del layout ya no aporta gutter lateral: el px-4
          de aquí es el único margen del contenido. */}
      <div className="border-b border-border bg-background px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{t("history.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("history.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors md:h-auto"
              title="Exportar CSV"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">{es ? "Exportar" : "Export"}</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors md:h-auto"
            >
              <Filter className="h-4 w-4" />
              {t("history.filters")}
              {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
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
                <option value="no_show">{t("scheduler.status_no_show")}</option>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{totalCount} {t("history.records")}</span>
            <span className="text-success-500">{completedCount} {t("scheduler.status_completed").toLowerCase()}</span>
            <span className="text-red-500">{cancelledCount} {t("scheduler.status_cancelled").toLowerCase()}</span>
            <span className="font-medium text-foreground">S/. {totalRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      {/* El scroll vertical vive en el MISMO contenedor que el horizontal
          (el div de abajo): si no, el `thead sticky` no tiene su scroller
          como ancestro y nunca se queda fijo. La paginación cuelga fuera
          de ese scroller para no viajar con el scroll horizontal. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
          <>
          <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm min-w-[780px] md:min-w-[900px]">
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
                {/* Consultorio: se oculta solo por debajo de md para
                    acortar el scroll lateral en móvil. Desde md, idéntico. */}
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">
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
                    <td className="px-4 py-3 whitespace-nowrap">{appt.appointment_date.split("-").reverse().join("/")}</td>
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
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{appt.offices?.name}</td>
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
          </div>
          {totalPages > 1 && (
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!canPrev}
                  className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                </button>
                <span className="text-sm font-medium tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!canNext}
                  className="flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
