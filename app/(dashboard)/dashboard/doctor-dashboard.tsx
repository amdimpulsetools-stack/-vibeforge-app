"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useUser } from "@/hooks/use-user";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import {
  CalendarDays,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
  Stethoscope,
  AlertCircle,
} from "lucide-react";

interface DoctorStats {
  linked: boolean;
  doctor_id?: string;
  today_appointments?: number;
  month_appointments?: number;
  month_completed?: number;
  month_revenue?: number;
  total_patients?: number;
  upcoming_appointments?: {
    id: string;
    patient_name: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: string;
    service_name: string | null;
    office_name: string | null;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-muted/60 text-muted-foreground",
  confirmed: "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

export function DoctorDashboard({ userName }: { userName: string }) {
  const { user } = useUser();
  const { organizationId } = useOrganization();
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !organizationId) return;

    const fetchStats = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_doctor_personal_stats", {
        p_user_id: user.id,
        org_id: organizationId,
      });

      if (!error && data) {
        setStats(data as unknown as DoctorStats);
      }
      setLoading(false);
    };

    fetchStats();
  }, [user, organizationId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats?.linked) {
    return (
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Mi Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">
            Bienvenido, {userName.split(" ")[0] || userName}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <h2 className="text-lg font-bold mb-2">
            Cuenta no vinculada
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Tu cuenta de usuario aún no está vinculada a un registro de doctor.
            Contacta al administrador de tu organización para vincular tu perfil.
          </p>
        </div>
      </div>
    );
  }

  const completionRate =
    stats.month_appointments && stats.month_appointments > 0
      ? Math.round(
          ((stats.month_completed ?? 0) / stats.month_appointments) * 100
        )
      : 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Mi Dashboard
              </h1>
              <p className="text-muted-foreground">
                Bienvenido, {userName.split(" ")[0] || userName}
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/scheduler"
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:bg-accent/50"
        >
          <CalendarDays className="h-4 w-4" />
          Ver agenda
        </Link>
      </div>

      {/* Personal KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Citas hoy"
          value={(stats.today_appointments ?? 0).toLocaleString()}
          icon={CalendarDays}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          title="Citas este mes"
          value={(stats.month_appointments ?? 0).toLocaleString()}
          icon={CalendarDays}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
          subtitle={`${completionRate}% completadas`}
        />
        <KpiCard
          title="Ingresos del mes"
          value={formatCurrency(stats.month_revenue ?? 0)}
          icon={DollarSign}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
          subtitle={`${stats.month_completed ?? 0} completadas`}
        />
        <KpiCard
          title="Mis pacientes"
          value={(stats.total_patients ?? 0).toLocaleString()}
          icon={Users}
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
          subtitle="pacientes únicos atendidos"
        />
      </div>

      {/* Upcoming Appointments */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-bold">Próximas citas</h2>
          </div>
          <Link
            href="/scheduler"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Ver agenda
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {!stats.upcoming_appointments ||
        stats.upcoming_appointments.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No tienes citas próximas programadas
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {stats.upcoming_appointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="shrink-0 text-xs font-mono text-muted-foreground">
                  <div>{appt.appointment_date}</div>
                  <div>{appt.start_time?.slice(0, 5)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {appt.patient_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {appt.service_name ?? ""}{" "}
                    {appt.office_name ? `• ${appt.office_name}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                    STATUS_COLORS[appt.status] ?? STATUS_COLORS.scheduled
                  }`}
                >
                  {STATUS_LABELS[appt.status] ?? appt.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  subtitle,
}: {
  title: string;
  value: string;
  icon: typeof CalendarDays;
  color: string;
  bgColor: string;
  subtitle?: string;
}) {
  return (
    <div className="card-hover rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${bgColor}`}
        >
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-2xl font-extrabold tracking-tight">{value}</span>
      </div>
      {subtitle && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
