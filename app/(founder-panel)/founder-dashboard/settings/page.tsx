"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { founderFetch } from "@/lib/founder-fetch";
import { SystemSubNav } from "../subnav";

interface Settings {
  alert_email: string | null;
  notify_new_ticket: boolean;
  notify_new_message: boolean;
  notify_new_org: boolean;
  notify_payment: boolean;
  updated_at?: string | null;
}
interface Payload {
  settings: Settings;
  effective_email: string | null;
  source: "settings" | "env" | "profile" | "none";
  profile_email: string | null;
  delivery_configured: boolean;
}

type ToggleKey = "notify_new_ticket" | "notify_new_message" | "notify_new_org" | "notify_payment";

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "notify_new_ticket",
    label: "Ticket de soporte nuevo",
    hint: "Cuando una clínica abre una consulta.",
  },
  {
    key: "notify_new_message",
    label: "Respuesta en un ticket",
    hint: "Cuando una clínica escribe en una conversación existente.",
  },
  {
    key: "notify_new_org",
    label: "Organización nueva registrada",
    hint: "Cuando una clínica termina su registro.",
  },
  {
    key: "notify_payment",
    label: "Pagos (próximamente)",
    hint: "Aún no implementado — el aviso se enviará cuando exista.",
  },
];

const SOURCE_LABEL: Record<Payload["source"], string> = {
  settings: "configurado en esta pantalla",
  env: "definido en el entorno (FOUNDER_ALERT_EMAIL)",
  profile: "por defecto, el correo de tu cuenta de founder",
  none: "sin destinatario — no llegará ningún aviso",
};

export default function FounderSettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    try {
      const d = await founderFetch<Payload>("/api/founder/settings");
      setData(d);
      setForm(d.settings);
      setEmailInput(d.settings.alert_email ?? "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/founder/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, alert_email: emailInput.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "No se pudo guardar");
      } else {
        toast.success("Ajustes guardados");
        await load();
      }
    } catch {
      toast.error("Error de red");
    }
    setSaving(false);
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/founder/settings", { method: "PUT" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "No se pudo enviar la prueba", { duration: 8000 });
      } else {
        toast.success(`Correo de prueba enviado a ${d.to}`, { duration: 6000 });
      }
    } catch {
      toast.error("Error de red");
    }
    setTesting(false);
  };

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm font-semibold text-red-500">No se pudieron cargar los ajustes</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!data || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Salud de la plataforma, plugins y ajustes de tus alertas.
        </p>
      </div>
      <SystemSubNav />

      {/* A dónde llegan hoy */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-amber-500" /> A dónde llegan tus avisos
        </h2>

        <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="text-lg font-bold">{data.effective_email ?? "— sin destinatario —"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[data.source]}</p>
        </div>

        {!data.delivery_configured && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-red-600 dark:text-red-400">
              <span className="font-semibold">El envío de correos no está configurado.</span>{" "}
              Faltan las claves del proveedor de email en el entorno, así que los
              avisos no se están enviando. Usa el correo de prueba para confirmarlo.
            </p>
          </div>
        )}

        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Cambiar destinatario
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={data.profile_email ?? "tucorreo@ejemplo.com"}
            className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={sendTest}
            disabled={testing}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar correo de prueba
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Déjalo vacío para volver al correo de tu cuenta
          {data.profile_email ? ` (${data.profile_email})` : ""}.
        </p>
      </div>

      {/* Qué avisos recibir */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold">Qué avisos quieres recibir</h2>
        <ul className="mt-3 divide-y divide-border/40">
          {TOGGLES.map(({ key, label, hint }) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              <button
                role="switch"
                aria-checked={Boolean(form[key])}
                onClick={() => setForm({ ...form, [key]: !form[key] })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  form[key] ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    form[key] ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-end gap-3">
          {data.settings.updated_at && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              Guardado {new Date(data.settings.updated_at).toLocaleString("es-PE")}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
