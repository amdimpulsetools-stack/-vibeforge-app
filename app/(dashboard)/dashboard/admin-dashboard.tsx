"use client";

import { useLanguage } from "@/components/language-provider";
import {
  Users,
  CalendarDays,
  Stethoscope,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

interface TodayAppointment {
  id: string;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
  doctors: { full_name: string; color: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

interface AdminDashboardProps {
  userName: string;
  stats: {
    totalPatients: number;
    activeDoctors: number;
    todayAppts: number;
    thisMonthAppts: number;
    growth: number;
  };
  todayAppointments: TodayAppointment[];
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-gray-400/20 text-gray-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS_ES: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

const STATUS_LABELS_EN: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function AdminDashboard({
  userName,
  stats,
  todayAppointments,
}: AdminDashboardProps) {
  const { t, language } = useLanguage();
  const statusLabels = language === "es" ? STATUS_LABELS_ES : STATUS_LABELS_EN;

  const statCards = [
    {
      titleKey: "dashboard.total_patients",
      value: stats.totalPatients.toLocaleString(),
      icon: Users,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      titleKey: "dashboard.today_appointments",
      value: stats.todayAppts.toLocaleString(),
      icon: CalendarDays,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
    {
      titleKey: "dashboard.active_doctors",
      value: stats.activeDoctors.toLocaleString(),
      icon: Stethoscope,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      titleKey: "dashboard.monthly_appointments",
      value: stats.thisMonthAppts.toLocaleString(),
      subtitle:
        stats.growth >= 0
          ? `+${stats.growth}%`
          : `${stats.growth}%`,
      subtitlePositive: stats.growth >= 0,
      icon: stats.growth >= 0 ? TrendingUp : TrendingDown,
      color: stats.growth >= 0 ? "text-emerald-400" : "text-red-400",
      bgColor:
        stats.growth >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
    },
  ];

  const formatTime = (time: string) => time.slice(0, 5); // "08:30:00" → "08:30"

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {t("dashboard.welcome")}, {userName.split(" ")[0] || userName}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.titleKey}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-card/80"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t(card.titleKey)}
              </span>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bgColor}`}
              >
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{card.value}</span>
              {card.subtitle && (
                <span
                  className={`text-xs font-medium ${
                    card.subtitlePositive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {card.subtitle} {t("dashboard.vs_last_month")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Today's Appointments */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">{t("dashboard.today_schedule")}</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {todayAppointments.length}
            </span>
          </div>
          <Link
            href="/scheduler"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {t("dashboard.view_scheduler")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {todayAppointments.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("dashboard.no_appointments_today")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todayAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
              >
                {/* Time */}
                <div className="w-24 shrink-0 text-sm font-mono text-muted-foreground">
                  {formatTime(appt.start_time)} - {formatTime(appt.end_time)}
                </div>

                {/* Doctor color dot */}
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: appt.doctors?.color ?? "#6b7280",
                  }}
                />

                {/* Patient & details */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {appt.patient_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {appt.doctors?.full_name}
                    {appt.services?.name ? ` · ${appt.services.name}` : ""}
                    {appt.offices?.name ? ` · ${appt.offices.name}` : ""}
                  </p>
                </div>

                {/* Status badge */}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLORS[appt.status] ?? STATUS_COLORS.scheduled
                  }`}
                >
                  {statusLabels[appt.status] ?? appt.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
