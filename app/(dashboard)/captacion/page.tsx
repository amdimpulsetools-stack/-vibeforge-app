"use client";

import { useEffect, useState } from "react";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import {
  Loader2,
  Megaphone,
  MessageCircle,
  CalendarCheck,
  UserCheck,
  Banknote,
  AlertTriangle,
  PhoneOff,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";

/**
 * Módulo Captación — panel de campañas (Fase 2, beta oculta).
 *
 * Solo visible para orgs con el grant del addon `captacion` (el sidebar
 * ya lo filtra; el API lo vuelve a validar). Muestra el embudo
 * campaña → leads → agendados → asistieron → facturado que produce el
 * capturador (Fase 1) cruzado contra la agenda por teléfono.
 */

interface CampaignRow {
  ad_id: string;
  headline: string;
  leads: number;
  agendados: number;
  asistieron: number;
  facturado: number;
}
interface RecentRow {
  id: string;
  phone_normalized: string;
  display_name: string | null;
  lead_status: string;
  first_referral_headline: string | null;
  last_message_at: string;
  patient_id: string | null;
  patient_name: string | null;
  agendo: boolean;
}
interface Summary {
  msgs_30d: number;
  convs_30d: number;
  campaigns_30d: number;
  sin_responder: number;
  agendaron: number;
  asistieron: number;
  facturado_total: number;
  campaigns: CampaignRow[];
  recientes: RecentRow[];
}
interface Payload {
  whatsapp_connected: boolean;
  summary: Summary;
}

const LEAD_STATUS_META: Record<string, { label: string; cls: string }> = {
  nuevo: { label: "Nuevo", cls: "bg-red-500/10 text-red-500" },
  conversando: { label: "Conversando", cls: "bg-blue-500/10 text-blue-500" },
  agendado: { label: "Agendado", cls: "bg-primary/10 text-primary" },
  perdido: { label: "Perdido", cls: "bg-muted text-muted-foreground" },
  no_interesado: { label: "No interesado", cls: "bg-muted text-muted-foreground" },
};

function formatPEN(n: number): string {
  return `S/ ${Number(n).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

function formatPhone(p: string): string {
  // 51987654321 → +51 987 654 321 (solo estética)
  if (p.length === 11 && p.startsWith("51")) {
    return `+51 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}`;
  }
  return `+${p}`;
}

export default function CaptacionPage() {
  const { organizationId } = useOrganization();
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/captacion/summary?org_id=${organizationId}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(d.error || "No se pudo cargar Captación");
        } else {
          setData(d as Payload);
        }
      } catch {
        if (!cancelled) setLoadError("Error de red");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="text-sm font-semibold text-red-500">No se pudo cargar Captación</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-14 pt-6 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Megaphone className="h-6 w-6 text-primary" /> Captación
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            Beta · últimos 30 días
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          De tus anuncios de Meta a tu caja, campaña por campaña.
        </p>
      </div>

      {!data.whatsapp_connected ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <PhoneOff className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">Sin número de WhatsApp conectado</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Captación escucha los mensajes que llegan a tu número de WhatsApp API.
            Conéctalo desde Ajustes → WhatsApp (o escríbenos por Soporte y lo
            configuramos contigo).
          </p>
        </div>
      ) : s.msgs_30d === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Hourglass className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">Esperando tus primeros mensajes</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Cuando un paciente escriba a tu número de WhatsApp, la conversación
            aparecerá acá — y si vino de un anuncio de Meta, sabrás de cuál.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi icon={MessageCircle} label="Leads (conversaciones)" value={String(s.convs_30d)} />
            <Kpi icon={Megaphone} label="Campañas detectadas" value={String(s.campaigns_30d)} />
            <Kpi icon={CalendarCheck} label="Agendaron" value={String(s.agendaron)} />
            <Kpi icon={UserCheck} label="Asistieron" value={String(s.asistieron)} />
            <Kpi
              icon={Banknote}
              label="Facturado (atribuido)"
              value={formatPEN(s.facturado_total)}
              accent
            />
          </div>

          {s.sin_responder > 0 && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-600 dark:text-red-400">
                <span className="font-semibold">
                  {s.sin_responder} {s.sin_responder === 1 ? "lead sigue" : "leads siguen"} sin respuesta.
                </span>{" "}
                Cada mensaje sin contestar es inversión publicitaria desperdiciada.
              </p>
            </div>
          )}

          {/* Por campaña */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <h2 className="border-b border-border/60 px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Por campaña
            </h2>
            {s.campaigns.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Aún ningún mensaje trajo identificador de campaña. Llegan cuando el
                anuncio es del tipo &quot;Enviar mensaje&quot; (click-to-WhatsApp).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Campaña</th>
                      <th className="px-4 py-2.5 font-semibold">Leads</th>
                      <th className="px-4 py-2.5 font-semibold">Agendaron</th>
                      <th className="px-4 py-2.5 font-semibold">Asistieron</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Facturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.campaigns.map((c) => (
                      <tr key={c.ad_id} className="border-t border-border/40">
                        <td className="px-4 py-3 font-medium">{c.headline}</td>
                        <td className="px-4 py-3">{c.leads}</td>
                        <td className="px-4 py-3">{c.agendados}</td>
                        <td className="px-4 py-3">{c.asistieron}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary">
                          {formatPEN(c.facturado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Conversaciones recientes */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <h2 className="border-b border-border/60 px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Conversaciones recientes
            </h2>
            <ul className="divide-y divide-border/40">
              {s.recientes.map((r) => {
                const st = LEAD_STATUS_META[r.lead_status] ?? LEAD_STATUS_META.nuevo;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.patient_name?.trim() || r.display_name || formatPhone(r.phone_normalized)}
                        {r.patient_id && (
                          <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            Paciente
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.first_referral_headline
                          ? `Vino del anuncio: ${r.first_referral_headline}`
                          : "Sin campaña detectada"}
                        {" · "}
                        {new Date(r.last_message_at).toLocaleDateString("es-PE", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        r.agendo ? "bg-primary/10 text-primary" : st.cls,
                      )}
                      role="status"
                    >
                      {r.agendo ? "Agendó ✓" : st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-extrabold tabular-nums",
          accent && "text-primary",
        )}
      >
        {/* key={String(value)}: re-anima solo si el número cambia. */}
        {typeof value === "string" || typeof value === "number" ? (
          <NumberPopIn key={String(value)} value={String(value)} />
        ) : (
          value
        )}
      </p>
    </div>
  );
}
