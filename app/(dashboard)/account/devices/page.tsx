"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Laptop,
  Smartphone,
  MapPin,
  Clock,
  Loader2,
  LogOut,
  Check,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceId } from "@/hooks/use-device-id";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Session {
  id: string;
  device_id: string;
  device_label: string | null;
  ip_city: string | null;
  ip_country: string | null;
  last_seen_at: string;
  created_at: string;
}

interface ApiResponse {
  limit: number;
  sessions: Session[];
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Activo ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} ${d === 1 ? "día" : "días"}`;
}

function deviceIconFor(label: string | null) {
  const l = (label ?? "").toLowerCase();
  if (l.includes("iphone") || l.includes("android")) return Smartphone;
  return Laptop;
}

export default function DevicesPage() {
  const currentDeviceId = useDeviceId();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/session/list");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as ApiResponse;
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    const ok = await confirm({
      title: "¿Cerrar esta sesión?",
      description: "El dispositivo va a tener que iniciar sesión de nuevo.",
      confirmText: "Cerrar sesión",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch("/api/auth/session/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, reason: "user_explicit" }),
    });
    if (res.ok) {
      toast.success("Sesión cerrada");
      void load();
    } else {
      toast.error("No se pudo cerrar la sesión");
    }
  };

  const revokeAll = async () => {
    const current = data?.sessions.find((s) => s.device_id === currentDeviceId);
    const ok = await confirm({
      title: "¿Cerrar todas las demás sesiones?",
      description: "Vas a mantener esta sesión activa. Los otros dispositivos tendrán que iniciar sesión de nuevo.",
      confirmText: "Cerrar las demás",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch("/api/auth/session/revoke-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current ? { keep_current_session_id: current.id } : {}),
    });
    if (res.ok) {
      const json = (await res.json()) as { revoked_count: number };
      toast.success(`${json.revoked_count} ${json.revoked_count === 1 ? "sesión cerrada" : "sesiones cerradas"}`);
      void load();
    } else {
      toast.error("No se pudieron cerrar las sesiones");
    }
  };

  const saveLabel = async (sessionId: string) => {
    const trimmed = editLabel.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    const res = await fetch("/api/auth/session/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, label: trimmed }),
    });
    if (res.ok) {
      toast.success("Nombre actualizado");
      setEditingId(null);
      void load();
    } else {
      toast.error("No se pudo renombrar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la lista de dispositivos.
        </p>
      </div>
    );
  }

  const otherSessionsCount = data.sessions.filter((s) => s.device_id !== currentDeviceId).length;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis dispositivos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sesiones activas en tu cuenta. Tu plan permite hasta {data.limit}{" "}
          {data.limit === 1 ? "dispositivo" : "dispositivos"} simultáneos.
        </p>
      </div>

      {data.sessions.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No hay sesiones activas.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.sessions.map((s) => {
            const Icon = deviceIconFor(s.device_label);
            const isCurrent = s.device_id === currentDeviceId;
            const location =
              [s.ip_city, s.ip_country].filter(Boolean).join(", ") || "Ubicación desconocida";
            const isEditing = editingId === s.id;

            return (
              <li
                key={s.id}
                className={`rounded-xl border bg-card p-4 ${
                  isCurrent ? "border-emerald-500/50" : "border-border/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                      isCurrent ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => void saveLabel(s.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium">
                            {s.device_label ?? "Dispositivo desconocido"}
                          </p>
                          {isCurrent && (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              Este dispositivo
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {relativeTime(s.last_seen_at)}
                      </span>
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        title="Renombrar"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditLabel(s.device_label ?? "");
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                          title="Cerrar sesión"
                          onClick={() => void revoke(s.id)}
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {otherSessionsCount > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Cerrar todas las sesiones excepto esta.
          </p>
          <Button variant="outline" size="sm" onClick={() => void revokeAll()}>
            Cerrar las demás
          </Button>
        </div>
      )}
    </div>
  );
}
