"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import type { FollowupDashboardItem } from "@/types/clinical-history";
import { FOLLOWUP_PRIORITY_CONFIG } from "@/types/clinical-history";
import type { Doctor } from "@/types/admin";
import {
  AlertTriangle,
  Clock,
  CalendarCheck,
  Loader2,
  Phone,
  Copy,
  MessageCircle,
  CheckCircle2,
  CalendarPlus,
  Stethoscope,
  User,
  Flag,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface DashboardData {
  overdue: FollowupDashboardItem[];
  this_week: FollowupDashboardItem[];
  upcoming: FollowupDashboardItem[];
}

interface DashboardCounts {
  overdue: number;
  this_week: number;
  upcoming: number;
  total: number;
}

export default function FollowUpsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardData>({ overdue: [], this_week: [], upcoming: [] });
  const [counts, setCounts] = useState<DashboardCounts>({ overdue: 0, this_week: 0, upcoming: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filterDoctor, setFilterDoctor] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchDoctors = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("doctors").select("*").eq("is_active", true).order("full_name");
      setDoctors(data ?? []);
    };
    fetchDoctors();
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDashboard = useCallback(async (doctor: string, priority: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (doctor !== "all") params.set("doctor_id", doctor);
    if (priority !== "all") params.set("priority", priority);

    const res = await fetch(`/api/clinical-followups/dashboard?${params}`);
    if (res.ok) {
      const json = await res.json();
      setData(json.data);
      setCounts(json.counts);
    }
    setLoading(false);
  }, []);

  // Debounce filter changes to avoid double-fetch when both change quickly
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDashboard(filterDoctor, filterPriority);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterDoctor, filterPriority, fetchDashboard]);

  const handleMarkContacted = async (id: string) => {
    setMarkingId(id);
    const res = await fetch(`/api/clinical-followups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_contacted: true }),
    });
    if (res.ok) {
      toast.success(t("followups.contacted_success"));
      fetchDashboard(filterDoctor, filterPriority);
    } else {
      toast.error(t("followups.contacted_error"));
    }
    setMarkingId(null);
  };

  const handleCopyWhatsApp = (item: FollowupDashboardItem) => {
    const patientName = item.patients
      ? `${item.patients.first_name} ${item.patients.last_name}`
      : "";
    const message = t("followups.whatsapp_template")
      .replace("{name}", patientName)
      .replace("{reason}", item.reason);

    navigator.clipboard.writeText(message);
    toast.success(t("followups.whatsapp_copied"));
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success(t("followups.phone_copied"));
  };

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    items: FollowupDashboardItem[],
    colorClass: string,
    borderClass: string
  ) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className={`flex items-center gap-2 px-1 py-2`}>
          {icon}
          <h2 className={`text-sm font-semibold ${colorClass}`}>{title}</h2>
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorClass} bg-current/10`}>
            {items.length}
          </span>
        </div>

        <div className="space-y-2">
          {items.map((item) => {
            const patient = item.patients;
            const patientName = patient
              ? `${patient.first_name} ${patient.last_name}`
              : "—";
            const priorityConfig = FOLLOWUP_PRIORITY_CONFIG[item.priority];
            const isMarking = markingId === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-xl border ${borderClass} bg-card p-4 transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Patient info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm">{patientName}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityConfig.bgLight} ${priorityConfig.textColor}`}
                      >
                        <Flag className="h-3 w-3" />
                        {priorityConfig.label}
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {item.reason}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Stethoscope className="h-3 w-3" />
                        {item.doctors?.full_name ?? "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarCheck className="h-3 w-3" />
                        {item.follow_up_date}
                      </span>
                      <span
                        className={`font-medium ${
                          item.days_diff < 0
                            ? "text-red-500"
                            : item.days_diff <= 7
                            ? "text-amber-500"
                            : "text-emerald-500"
                        }`}
                      >
                        {item.days_diff < 0
                          ? t("followups.days_overdue").replace("{n}", String(Math.abs(item.days_diff)))
                          : item.days_diff === 0
                          ? t("followups.today")
                          : t("followups.days_remaining").replace("{n}", String(item.days_diff))}
                      </span>
                      {item.last_contacted_at && (
                        <span className="text-blue-400">
                          {t("followups.last_contacted")}: {new Date(item.last_contacted_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Phone copy */}
                    {patient?.phone && (
                      <button
                        onClick={() => handleCopyPhone(patient.phone!)}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title={patient.phone}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <Copy className="h-3 w-3" />
                      </button>
                    )}

                    {/* WhatsApp message */}
                    <button
                      onClick={() => handleCopyWhatsApp(item)}
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                      title="WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </button>

                    {/* Mark contacted */}
                    <button
                      onClick={() => handleMarkContacted(item.id)}
                      disabled={isMarking}
                      className="flex items-center gap-1 rounded-lg border border-blue-500/30 px-2.5 py-1.5 text-xs text-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                      title={t("followups.mark_contacted")}
                    >
                      {isMarking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{t("followups.contacted")}</span>
                    </button>

                    {/* Schedule appointment */}
                    <button
                      onClick={() => {
                        // Navigate to scheduler with patient pre-selected
                        const params = new URLSearchParams();
                        if (patient) params.set("patient_name", `${patient.first_name} ${patient.last_name}`);
                        if (item.doctor_id) params.set("doctor_id", item.doctor_id);
                        window.location.href = `/scheduler?new=1&${params}`;
                      }}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/30 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors"
                      title={t("followups.schedule_appointment")}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("followups.schedule")}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{t("followups.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("followups.subtitle")}</p>
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

        {showFilters && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <label className="text-xs font-medium text-muted-foreground">{t("followups.priority")}</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              >
                <option value="all">{t("patients.filter_all")}</option>
                <option value="red">{FOLLOWUP_PRIORITY_CONFIG.red.label}</option>
                <option value="yellow">{FOLLOWUP_PRIORITY_CONFIG.yellow.label}</option>
                <option value="green">{FOLLOWUP_PRIORITY_CONFIG.green.label}</option>
              </select>
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <span>{counts.total} {t("followups.total")}</span>
          {counts.overdue > 0 && (
            <span className="text-red-500 font-medium">{counts.overdue} {t("followups.overdue_label")}</span>
          )}
          {counts.this_week > 0 && (
            <span className="text-amber-500">{counts.this_week} {t("followups.this_week_label")}</span>
          )}
          {counts.upcoming > 0 && (
            <span className="text-emerald-500">{counts.upcoming} {t("followups.upcoming_label")}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : counts.total === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <CalendarCheck className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">{t("followups.empty")}</p>
            <p className="text-xs mt-1">{t("followups.empty_description")}</p>
          </div>
        ) : (
          <>
            {renderSection(
              t("followups.section_overdue"),
              <AlertTriangle className="h-4 w-4 text-red-500" />,
              data.overdue,
              "text-red-500",
              "border-red-500/20"
            )}

            {renderSection(
              t("followups.section_this_week"),
              <Clock className="h-4 w-4 text-amber-500" />,
              data.this_week,
              "text-amber-500",
              "border-amber-500/20"
            )}

            {renderSection(
              t("followups.section_upcoming"),
              <CalendarCheck className="h-4 w-4 text-emerald-500" />,
              data.upcoming,
              "text-emerald-500",
              "border-emerald-500/20"
            )}
          </>
        )}
      </div>
    </div>
  );
}
