"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plug, Plus, Power, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ──────────────────────────────────────────────────────────────────
// Founder Panel — Plugins
//
// Internal admin surface for installing the per-org plugins
// (org_plugins). The page is intentionally functional-not-pretty:
// it's only ever used by us, not by customers.
//
// Operations:
//   • List all installed rows (org + plugin + enabled + config).
//   • Install a plugin on a chosen org (with optional initial JSON
//     config).
//   • Toggle enabled / edit config JSONB in-place.
//   • Uninstall (DELETE) — instant, no soft-delete.
//
// Server enforces: caller must be a founder (`user_profiles.is_founder
// = true`) AND the org_plugins table itself has founder-only RLS on
// writes (defense in depth).
// ──────────────────────────────────────────────────────────────────

interface PluginRow {
  id: string;
  plugin_key: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installed_at: string;
  organization_id: string;
  org_name: string;
  org_legal_name: string | null;
  registry: {
    name: string;
    description: string;
    requires_addons: string[];
  } | null;
}

interface AvailablePlugin {
  key: string;
  name: string;
  description: string;
  requires_addons: string[];
  family: string;
}

interface OrgOption {
  id: string;
  name: string;
  legal_name: string | null;
}

export default function FounderPluginsPage() {
  const [rows, setRows] = useState<PluginRow[]>([]);
  const [available, setAvailable] = useState<AvailablePlugin[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [pluginsRes, orgsClient] = await Promise.all([
      fetch("/api/founder/plugins", { cache: "no-store" }),
      // Founders have wide RLS access; this returns all orgs for
      // the installer dropdown.
      createClient()
        .from("organizations")
        .select("id, name, legal_name")
        .order("name"),
    ]);
    if (pluginsRes.ok) {
      const data = await pluginsRes.json();
      setRows(data.rows ?? []);
      setAvailable(data.available_plugins ?? []);
    } else {
      toast.error("No se pudieron cargar los plugins");
    }
    setOrgs((orgsClient.data as OrgOption[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const toggleEnabled = async (row: PluginRow) => {
    const next = !row.enabled;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)),
    );
    const res = await fetch(`/api/founder/plugins/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) {
      // revert
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, enabled: !next } : r)),
      );
      toast.error("No se pudo actualizar");
    }
  };

  const saveConfig = async (row: PluginRow, newConfigStr: string) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = newConfigStr.trim() ? JSON.parse(newConfigStr) : {};
    } catch {
      toast.error("JSON inválido");
      return;
    }
    const res = await fetch(`/api/founder/plugins/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: parsed }),
    });
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Config guardada");
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, config: parsed } : r)),
    );
  };

  const uninstall = async (row: PluginRow) => {
    if (!confirm(`Desinstalar ${row.plugin_key} de ${row.org_name}?`)) return;
    const res = await fetch(`/api/founder/plugins/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("No se pudo desinstalar");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success("Desinstalado");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Plugins
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activación per-org de features ultra-específicos (templates de
            PDF custom, etc.). No se exponen al admin de la clínica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInstallOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Instalar plugin
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No hay plugins instalados todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PluginRowCard
              key={row.id}
              row={row}
              onToggle={() => toggleEnabled(row)}
              onSaveConfig={(s) => saveConfig(row, s)}
              onUninstall={() => uninstall(row)}
            />
          ))}
        </div>
      )}

      {installOpen && (
        <InstallModal
          orgs={orgs}
          plugins={available}
          installedKeysByOrg={rows.reduce<Record<string, Set<string>>>(
            (acc, r) => {
              if (!acc[r.organization_id]) acc[r.organization_id] = new Set();
              acc[r.organization_id].add(r.plugin_key);
              return acc;
            },
            {},
          )}
          onClose={() => setInstallOpen(false)}
          onInstalled={() => {
            setInstallOpen(false);
            void fetchAll();
          }}
        />
      )}
    </div>
  );
}

function PluginRowCard({
  row,
  onToggle,
  onSaveConfig,
  onUninstall,
}: {
  row: PluginRow;
  onToggle: () => void;
  onSaveConfig: (newConfigStr: string) => void;
  onUninstall: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [configText, setConfigText] = useState(
    JSON.stringify(row.config ?? {}, null, 2),
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {row.registry?.name ?? row.plugin_key}
            </span>
            {!row.registry && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                Key desconocida en registry
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                row.enabled
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {row.enabled ? "Activo" : "Apagado"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <code className="font-mono">{row.plugin_key}</code> en{" "}
            <span className="font-medium text-foreground">
              {row.org_legal_name ?? row.org_name}
            </span>
          </p>
          {row.registry && (
            <p className="text-xs text-muted-foreground mt-1">
              {row.registry.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
            title={row.enabled ? "Apagar" : "Encender"}
          >
            <Power className="h-3.5 w-3.5" />
            {row.enabled ? "Apagar" : "Encender"}
          </button>
          <button
            type="button"
            onClick={onUninstall}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-500/10"
            title="Desinstalar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {editing ? "Cerrar editor" : "Editar config JSON"}
        </button>
        {editing && (
          <div className="mt-2 space-y-2">
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSaveConfig(configText)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfigText(JSON.stringify(row.config ?? {}, null, 2))
                }
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
              >
                Restaurar
              </button>
              <p className="text-[11px] text-muted-foreground">
                Campos no presentes se llenan con los defaults del plugin.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InstallModal({
  orgs,
  plugins,
  installedKeysByOrg,
  onClose,
  onInstalled,
}: {
  orgs: OrgOption[];
  plugins: AvailablePlugin[];
  installedKeysByOrg: Record<string, Set<string>>;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [orgId, setOrgId] = useState("");
  const [pluginKey, setPluginKey] = useState("");
  const [configText, setConfigText] = useState("{}");
  const [saving, setSaving] = useState(false);

  const alreadyInstalled =
    orgId && installedKeysByOrg[orgId]?.has(pluginKey);

  const submit = async () => {
    if (!orgId || !pluginKey) return;
    let parsed: Record<string, unknown> = {};
    if (configText.trim()) {
      try {
        parsed = JSON.parse(configText);
      } catch {
        toast.error("JSON inválido");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/founder/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: orgId,
          plugin_key: pluginKey,
          config: parsed,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "No se pudo instalar");
        return;
      }
      toast.success("Plugin instalado");
      onInstalled();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Instalar plugin</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Organización
            </label>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seleccionar…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.legal_name ?? o.name} ({o.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plugin
            </label>
            <select
              value={pluginKey}
              onChange={(e) => setPluginKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seleccionar…</option>
              {plugins.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
            {pluginKey && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {plugins.find((p) => p.key === pluginKey)?.description}
                {(() => {
                  const p = plugins.find((x) => x.key === pluginKey);
                  if (!p || p.requires_addons.length === 0) return null;
                  return (
                    <>
                      {" "}
                      Requiere addon(s):{" "}
                      <code className="font-mono">
                        {p.requires_addons.join(", ")}
                      </code>
                      .
                    </>
                  );
                })()}
              </p>
            )}
            {alreadyInstalled && (
              <p className="mt-1 text-[11px] text-amber-600">
                Esta org ya tiene este plugin instalado.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Config JSON inicial (opcional)
            </label>
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-[11px]"
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Dejá <code className="font-mono">{`{}`}</code> para usar los
              defaults del plugin.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!orgId || !pluginKey || saving || Boolean(alreadyInstalled)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
