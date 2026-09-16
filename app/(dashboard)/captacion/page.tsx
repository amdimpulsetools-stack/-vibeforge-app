"use client";

import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
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
  Users,
  CalendarRange,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgToday } from "@/hooks/use-org-today";
import { zonedNow } from "@/lib/org-time";

/**
 * Módulo Captación — panel de campañas (Fase 2, beta oculta).
 *
 * Solo visible para orgs con el grant del addon `captacion` (el sidebar
 * ya lo filtra; el API lo vuelve a validar). Responde una pregunta:
 * "de los que escribieron por WhatsApp en ESTE rango, ¿cuántos eran
 * nuevos, cuántos agendaron, cuántos vinieron y cuánto pagaron?",
 * campaña por campaña (mig 262).
 *
 * El rango es una COHORTE por fecha del primer mensaje, en el reloj de
 * la org. Las citas y cobros se miran hacia adelante sin tope: "junio"
 * responde cuántos de los de junio agendaron hasta hoy.
 */

interface CampaignRow {
  ad_id: string; // 'organic' = sin anuncio
  headline: string | null;
  /** Nombre que la clínica le puso al anuncio (mig 263); null si no lo nombró. */
  label: string | null;
  source_type: string | null;
  chats: number;
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
  created_at: string;
  last_message_at: string;
  patient_id: string | null;
  patient_name: string | null;
  is_new_lead: boolean;
  agendo: boolean;
}
interface Summary {
  range: { from: string; to: string; timezone: string };
  msgs: number;
  convs: number;
  leads: number;
  existing: number;
  campaigns_count: number;
  agendaron: number;
  asistieron: number;
  facturado_total: number;
  campaigns: CampaignRow[];
  recientes: RecentRow[];
}
interface Payload {
  whatsapp_connected: boolean;
  range: { from: string; to: string; timezone: string; today: string };
  summary: Summary;
}

type PresetKey = "30" | "90" | "180" | "365" | "custom";
const PRESETS: ReadonlyArray<{ key: PresetKey; label: string; days?: number }> = [
  { key: "30", label: "30 días", days: 30 },
  { key: "90", label: "90 días", days: 90 },
  { key: "180", label: "6 meses", days: 180 },
  { key: "365", label: "12 meses", days: 365 },
  { key: "custom", label: "Personalizado" },
];

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

/** dd MMM en la zona de la org (nunca la del navegador). */
function formatDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone });
}

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export default function CaptacionPage() {
  const { organizationId } = useOrganization();
  const { timezone, today } = useOrgToday();
  const { isAdmin } = useOrgRole();

  const [preset, setPreset] = useState<PresetKey>("90");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Rango efectivo: presets = "últimos N días hasta hoy" en el reloj de
  // la org; personalizado = lo que escriba el usuario (si está completo).
  const range = useMemo(() => {
    const to = today();
    if (preset !== "custom") {
      const days = PRESETS.find((p) => p.key === preset)?.days ?? 90;
      return { from: format(subDays(zonedNow(timezone), days - 1), "yyyy-MM-dd"), to };
    }
    if (customFrom && customTo && customFrom <= customTo) {
      return { from: customFrom, to: customTo };
    }
    return null;
  }, [preset, customFrom, customTo, today, timezone]);

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!organizationId || !range) return;
    void reloadKey; // "Reintentar" fuerza una recarga con el mismo rango.
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const qs = new URLSearchParams({ org_id: organizationId, from: range.from, to: range.to });
        const res = await fetch(`/api/captacion/summary?${qs.toString()}`, { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(d.error || "No se pudo cargar Captación");
        } else {
          setData(d as Payload);
        }
      } catch {
        if (!cancelled) setLoadError("Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, range, reloadKey]);

  const s = data?.summary ?? null;
  const tz = data?.range.timezone ?? timezone;

  // Etiqueta propia del anuncio (mig 263): Meta no manda el nombre de la
  // campaña, la clínica se lo pone aquí. Solo owner/admin (la API y la RLS
  // lo vuelven a comprobar). Actualización optimista de la fila.
  const saveLabel = async (adId: string, label: string) => {
    if (!organizationId) return;
    const res = await fetch("/api/captacion/ad-labels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: organizationId, ad_id: adId, label }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error || "No se pudo guardar el nombre");
      return false;
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            summary: {
              ...prev.summary,
              campaigns: prev.summary.campaigns.map((c) =>
                c.ad_id === adId ? { ...c, label: d.label ?? null } : c,
              ),
            },
          }
        : prev,
    );
    return true;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-14 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Megaphone className="h-6 w-6 text-primary" /> Captación
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              Beta
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            De tus anuncios de Meta a tu agenda, campaña por campaña.
          </p>
        </div>

        {/* Cohorte por fecha del primer mensaje */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> Escribieron entre
          </span>
          <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-card p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  preset === p.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customFrom}
                max={customTo || today()}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
              />
              <span className="text-muted-foreground">a</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={today()}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {range && (
        <p className="text-xs text-muted-foreground">
          Cohorte: conversaciones cuyo <strong>primer mensaje</strong> llegó entre{" "}
          {formatYmd(range.from)} y {formatYmd(range.to)}. Las citas, asistencias y cobros
          se cuentan desde ese primer mensaje hasta hoy, sin límite de días.
        </p>
      )}

      {loadError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <p className="text-sm font-semibold text-red-500">No se pudo cargar Captación</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Reintentar
          </button>
        </div>
      ) : !data || !s ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data.whatsapp_connected ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <PhoneOff className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">Sin número de WhatsApp conectado</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Captación escucha los mensajes que llegan a tu número de WhatsApp API.
            Conéctalo desde Ajustes → Integraciones.
          </p>
        </div>
      ) : s.convs === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Hourglass className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">Sin conversaciones en este rango</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Cuando un paciente escriba a tu número de WhatsApp, la conversación
            aparecerá acá, y si vino de un anuncio de Meta, sabrás de cuál.
          </p>
        </div>
      ) : (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi icon={MessageCircle} label="Chats" value={String(s.convs)} hint={`${s.msgs} mensajes`} />
            <Kpi icon={Users} label="Leads nuevos" value={String(s.leads)} hint={`${s.existing} pacientes ya conocidos`} />
            <Kpi icon={Megaphone} label="Anuncios detectados" value={String(s.campaigns_count)} />
            <Kpi icon={CalendarCheck} label="Agendaron" value={String(s.agendaron)} hint="de los leads nuevos" />
            <Kpi icon={UserCheck} label="Asistieron" value={String(s.asistieron)} hint="de los leads nuevos" />
            <Kpi
              icon={Banknote}
              label="Facturado clínico"
              value={formatPEN(s.facturado_total)}
              hint="sin farmacia"
              accent
            />
          </div>

          {/* Por campaña */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <h2 className="border-b border-border/60 px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Por anuncio
            </h2>
            {s.campaigns.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Aún ningún mensaje trajo identificador de anuncio. Llegan cuando el
                anuncio es del tipo &quot;Enviar mensaje&quot; (click-to-WhatsApp).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Anuncio</th>
                      <th className="px-4 py-2.5 font-semibold">Chats</th>
                      <th className="px-4 py-2.5 font-semibold">Leads nuevos</th>
                      <th className="px-4 py-2.5 font-semibold">Agendaron</th>
                      <th className="px-4 py-2.5 font-semibold">Asistieron</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Facturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.campaigns.map((c) => {
                      const organic = c.ad_id === "organic";
                      return (
                        <tr
                          key={c.ad_id}
                          className={cn("border-t border-border/40", organic && "text-muted-foreground")}
                        >
                          <td className="px-4 py-3">
                            {organic ? (
                              <p className="font-medium">Sin anuncio (orgánico)</p>
                            ) : (
                              <AdNameCell row={c} canEdit={isAdmin} onSave={saveLabel} />
                            )}
                          </td>
                          <td className="px-4 py-3">{c.chats}</td>
                          <td className="px-4 py-3 font-semibold">{c.leads}</td>
                          <td className="px-4 py-3">{c.agendados}</td>
                          <td className="px-4 py-3">{c.asistieron}</td>
                          <td className={cn("px-4 py-3 text-right font-bold", !organic && "text-primary")}>
                            {formatPEN(c.facturado)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
                  Meta envía el titular y el ID del anuncio, no el nombre de la campaña:
                  {isAdmin ? " ponle el nombre que uses en tu Administrador de anuncios con el lápiz." : " el administrador puede ponerle nombre."}
                  {" "}Agendaron, asistieron y facturado se cuentan solo sobre leads nuevos
                  (sin ficha previa en Yenda).
                </p>
              </div>
            )}
          </div>

          {/* Conversaciones de la cohorte */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <h2 className="border-b border-border/60 px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Últimas conversaciones del rango
            </h2>
            <ul className="divide-y divide-border/40">
              {s.recientes.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.patient_name?.trim() || r.display_name || formatPhone(r.phone_normalized)}
                      {r.patient_id && (
                        <span
                          className={cn(
                            "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                            r.is_new_lead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.is_new_lead ? "Paciente nuevo" : "Ya era paciente"}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.first_referral_headline
                        ? `Vino del anuncio: ${r.first_referral_headline}`
                        : "Sin anuncio detectado"}
                      {" · escribió el "}
                      {formatDay(r.created_at, tz)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      r.agendo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                    role="status"
                  >
                    {r.agendo ? "Agendó ✓" : "Sin cita"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** Celda "Anuncio": nombre propio (editable por admin) + titular + ID. */
function AdNameCell({
  row,
  canEdit,
  onSave,
}: {
  row: CampaignRow;
  canEdit: boolean;
  onSave: (adId: string, label: string) => Promise<boolean | undefined>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.label ?? "");
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(row.ad_id, draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={80}
          placeholder={row.headline ?? "Nombre del anuncio"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-56 min-w-0 rounded-lg border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving}
          aria-label="Guardar nombre"
          className="rounded-md p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancelar"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1.5">
      <div className="min-w-0">
        <p className="font-medium">{row.label || row.headline || "Sin titular"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {row.label && row.headline ? `${row.headline} · ` : ""}
          ID {row.ad_id}
          {row.source_type ? ` · ${row.source_type}` : ""}
        </p>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setDraft(row.label ?? "");
            setEditing(true);
          }}
          aria-label="Ponerle nombre al anuncio"
          title="Ponerle nombre al anuncio"
          className="mt-0.5 rounded-md p-1 text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", accent && "text-primary")}>
        {/* key={String(value)}: re-anima solo si el número cambia. */}
        <NumberPopIn key={value} value={value} />
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
