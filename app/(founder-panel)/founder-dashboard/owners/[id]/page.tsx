"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Building2,
  Crown,
  Mail,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  Bot,
  StickyNote,
  Send,
  Trash2,
  Clock,
  Milestone,
  CreditCard,
  Headphones,
} from "lucide-react";
import { toast } from "sonner";

interface OwnerDossier {
  organization: {
    id: string;
    name: string;
    slug: string;
    type: string;
    is_active: boolean;
    created_at: string;
  };
  owner: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  subscription: {
    status: string;
    plan_name: string | null;
    price_monthly: number;
    billing_cycle: string;
    current_period_end: string | null;
    trial_ends_at: string | null;
    cancelled_at: string | null;
  } | null;
  team: {
    user_id: string;
    role: string;
    is_active: boolean;
    created_at: string;
    name: string | null;
    avatar_url: string | null;
  }[];
  stats: {
    total_patients: number;
    total_appointments: number;
    total_revenue: number;
    total_ai_queries: number;
    monthly: {
      label: string;
      appointments: number;
      revenue: number;
      new_patients: number;
    }[];
  };
  tickets: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }[];
  notes: {
    id: string;
    content: string;
    created_at: string;
    updated_at: string;
  }[];
  lifecycle: {
    id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  signup: { label: "Registro", color: "bg-blue-500" },
  first_appointment: { label: "Primera cita", color: "bg-emerald-500" },
  first_payment: { label: "Primer pago", color: "bg-green-500" },
  first_team_member: { label: "Primer miembro añadido", color: "bg-purple-500" },
  plan_upgraded: { label: "Plan upgrade", color: "bg-amber-500" },
  plan_downgraded: { label: "Plan downgrade", color: "bg-orange-500" },
  trial_expired: { label: "Trial expirado", color: "bg-red-400" },
  churned: { label: "Churn", color: "bg-red-500" },
  reactivated: { label: "Reactivación", color: "bg-emerald-600" },
  ticket_opened: { label: "Ticket de soporte", color: "bg-slate-500" },
  milestone_100_appointments: { label: "100 citas alcanzadas", color: "bg-amber-500" },
  milestone_500_patients: { label: "500 pacientes alcanzados", color: "bg-amber-500" },
};

export default function OwnerDossierPage() {
  const params = useParams();
  const orgId = params.id as string;

  const [data, setData] = useState<OwnerDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [sendingNote, setSendingNote] = useState(false);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/founder/stats/owners/${orgId}`);
    if (!res.ok) { setLoading(false); return; }
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    setSendingNote(true);
    const res = await fetch("/api/founder/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: orgId, content: noteText.trim() }),
    });
    setSendingNote(false);
    if (!res.ok) {
      toast.error("Error al guardar nota");
      return;
    }
    setNoteText("");
    toast.success("Nota guardada");
    loadData();
  };

  const deleteNote = async (noteId: string) => {
    const res = await fetch(`/api/founder/notes?id=${noteId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Nota eliminada");
      loadData();
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { organization: org, owner, subscription: sub, team, stats, tickets, notes, lifecycle } = data;
  const daysSinceSignup = Math.floor((Date.now() - new Date(org.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const maxAppts = Math.max(...stats.monthly.map((m) => m.appointments), 1);
  const maxRev = Math.max(...stats.monthly.map((m) => m.revenue), 1);

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Link
          href="/founder-dashboard/owners"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight truncate">{org.name}</h1>
            {sub && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                  sub.status === "active"
                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/30"
                    : sub.status === "trialing"
                      ? "text-blue-500 bg-blue-500/10 border-blue-500/30"
                      : "text-red-500 bg-red-500/10 border-red-500/30"
                }`}
              >
                {sub.status === "active" ? "Activo" : sub.status === "trialing" ? "Trial" : sub.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3 text-amber-500" />
              {owner.name ?? "—"}
            </span>
            {owner.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {owner.email}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(org.created_at).toLocaleDateString("es-PE")} ({daysSinceSignup} días)
            </span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <KPICard icon={CreditCard} label="Plan" value={sub?.plan_name ?? "Sin plan"} sub={sub ? `S/${sub.price_monthly}/mes` : ""} color="bg-emerald-500/10 text-emerald-500" />
        <KPICard icon={Users} label="Pacientes" value={stats.total_patients.toLocaleString()} color="bg-blue-500/10 text-blue-500" />
        <KPICard icon={Calendar} label="Citas totales" value={stats.total_appointments.toLocaleString()} color="bg-purple-500/10 text-purple-500" />
        <KPICard icon={DollarSign} label="Revenue total" value={`S/${stats.total_revenue.toLocaleString()}`} color="bg-green-500/10 text-green-500" />
        <KPICard icon={Bot} label="Queries IA" value={stats.total_ai_queries.toLocaleString()} color="bg-violet-500/10 text-violet-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: charts + team */}
        <div className="lg:col-span-2 space-y-6">
          {/* Monthly charts */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Actividad últimos 6 meses</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Appointments chart */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Citas / mes</p>
                <div className="flex items-end gap-1.5 h-24">
                  {stats.monthly.map((m) => (
                    <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-mono text-muted-foreground">{m.appointments}</span>
                      <div
                        className="w-full rounded-t bg-emerald-500/70 transition-all"
                        style={{ height: `${Math.max((m.appointments / maxAppts) * 100, 4)}%` }}
                      />
                      <span className="text-[9px] text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue chart */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Revenue / mes</p>
                <div className="flex items-end gap-1.5 h-24">
                  {stats.monthly.map((m) => (
                    <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-mono text-muted-foreground">{m.revenue > 0 ? `S/${m.revenue}` : "0"}</span>
                      <div
                        className="w-full rounded-t bg-blue-500/70 transition-all"
                        style={{ height: `${Math.max((m.revenue / maxRev) * 100, 4)}%` }}
                      />
                      <span className="text-[9px] text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Equipo ({team.length})
            </h3>
            <div className="space-y-2">
              {team.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground">
                      {(m.name ?? "?")[0]}
                    </div>
                    <div>
                      <p className="text-xs font-medium">{m.name ?? "Sin nombre"}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium ${m.is_active ? "text-emerald-500" : "text-red-400"}`}>
                    {m.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
              ))}
              {team.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">Sin miembros</p>
              )}
            </div>
          </div>

          {/* Tickets */}
          {tickets.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Headphones className="h-4 w-4 text-muted-foreground" />
                Tickets recientes
              </h3>
              <div className="space-y-2">
                {tickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                    <div>
                      <p className="text-xs font-medium">{t.subject}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("es-PE")}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.status === "open"
                          ? "text-amber-500 bg-amber-500/10"
                          : "text-emerald-500 bg-emerald-500/10"
                      }`}
                    >
                      {t.status === "open" ? "Abierto" : "Resuelto"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: timeline + notes */}
        <div className="space-y-6">
          {/* Lifecycle timeline */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Milestone className="h-4 w-4 text-muted-foreground" />
              Timeline
            </h3>
            <div className="relative ml-3 border-l-2 border-border/40 pl-5 space-y-4">
              {lifecycle.map((ev) => {
                const cfg = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, color: "bg-slate-400" };
                return (
                  <div key={ev.id} className="relative">
                    <div className={`absolute -left-[27px] top-0.5 h-3 w-3 rounded-full ${cfg.color} ring-2 ring-card`} />
                    <p className="text-xs font-medium">{cfg.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(ev.created_at).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })}
              {lifecycle.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin eventos registrados</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              Notas internas
            </h3>

            {/* Add note */}
            <div className="flex gap-2 mb-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Escribe una nota sobre este cliente..."
                rows={2}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              />
              <button
                onClick={addNote}
                disabled={!noteText.trim() || sendingNote}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity self-end"
              >
                {sendingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="group rounded-lg bg-muted/20 p-3">
                  <p className="text-xs whitespace-pre-wrap">{n.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(n.created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin notas aún</p>
              )}
            </div>
          </div>

          {/* Subscription details */}
          {sub && (
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                Suscripción
              </h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium">{sub.plan_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Precio</dt>
                  <dd className="font-mono">S/{sub.price_monthly}/mes</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ciclo</dt>
                  <dd className="capitalize">{sub.billing_cycle}</dd>
                </div>
                {sub.current_period_end && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Renueva</dt>
                    <dd>{new Date(sub.current_period_end).toLocaleDateString("es-PE")}</dd>
                  </div>
                )}
                {sub.trial_ends_at && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Trial expira</dt>
                    <dd className="text-amber-500">{new Date(sub.trial_ends_at).toLocaleDateString("es-PE")}</dd>
                  </div>
                )}
                {sub.cancelled_at && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cancelado</dt>
                    <dd className="text-red-500">{new Date(sub.cancelled_at).toLocaleDateString("es-PE")}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
