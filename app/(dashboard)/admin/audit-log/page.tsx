"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  Pencil,
  PlusCircle,
  Trash2,
  FileDown,
  Printer,
  ListFilter,
  Activity,
  Download,
  Loader2,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ============================================================
// Audit log admin page (NTS 139 + Ley 29733 compliance).
//
// Lists every access to clinical data in the org, with filters
// and CSV export. Owner/admin only — enforced by both the
// admin layout and the API endpoint.
// ============================================================

interface AuditRow {
  id: string;
  user_id: string;
  user: { full_name: string | null; email: string | null } | null;
  patient_id: string | null;
  // Supabase embed for many-to-one FK can come back as object OR
  // single-element array depending on PostgREST inference.
  patients:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  resource_id: string | null;
  resource_type: string;
  action: string;
  at: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  patient: "Paciente",
  clinical_note: "Nota clínica",
  prescription: "Receta",
  attachment: "Archivo / consentimiento",
  lab_result: "Examen / lab",
  treatment_plan: "Plan de tratamiento",
  medical_history: "Antecedentes / biometría",
  appointment: "Seguimiento clínico",
  ai_query: "Consulta IA",
  other: "Otro",
};

const ACTION_LABELS: Record<string, string> = {
  view: "Ver",
  list: "Listar",
  create: "Crear",
  update: "Editar",
  delete: "Eliminar",
  export: "Exportar",
  print: "Imprimir",
  download: "Descargar",
};

const ACTION_ICONS: Record<string, typeof Eye> = {
  view: Eye,
  list: ListFilter,
  create: PlusCircle,
  update: Pencil,
  delete: Trash2,
  export: FileDown,
  print: Printer,
  download: Download,
};

const ACTION_TONE: Record<string, string> = {
  view: "text-blue-400",
  list: "text-slate-400",
  create: "text-success-400",
  update: "text-amber-400",
  delete: "text-red-400",
  export: "text-purple-400",
  print: "text-purple-400",
  download: "text-purple-400",
};

const PAGE_SIZE = 50;

interface Filters {
  from: string;
  to: string;
  resource_type: string;
  action: string;
}

const emptyFilters: Filters = { from: "", to: "", resource_type: "", action: "" };

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const buildQS = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", new Date(filters.from).toISOString());
      if (filters.to) params.set("to", new Date(filters.to).toISOString());
      if (filters.resource_type) params.set("resource_type", filters.resource_type);
      if (filters.action) params.set("action", filters.action);
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
      return params.toString();
    },
    [filters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQS({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/audit-log?${qs}`);
      if (!res.ok) {
        toast.error("No se pudo cargar el registro de auditoría");
        return;
      }
      const data = (await res.json()) as { rows: AuditRow[]; total: number };
      setRows(data.rows);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [buildQS, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/audit-log/export?${buildQS()}`);
      if (!res.ok) {
        toast.error("No se pudo exportar el CSV");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV descargado");
    } finally {
      setExporting(false);
    }
  };

  const applyFilters = () => {
    setPage(0);
    void load();
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-500" />
            Registro de auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Quién accedió a qué dato clínico, cuándo y desde dónde. Cumple NTS 139 y Ley 29733 de protección de datos.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={exporting || total === 0}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Exportar CSV
        </Button>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Desde
            </label>
            <Input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Hasta
            </label>
            <Input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1">
              Tipo de recurso
            </label>
            <select
              value={filters.resource_type}
              onChange={(e) =>
                setFilters({ ...filters, resource_type: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todos</option>
              {Object.entries(RESOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1">
              Acción
            </label>
            <select
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar
          </Button>
          <Button size="sm" onClick={applyFilters}>
            Aplicar
          </Button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No hay registros con esos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Usuario</th>
                  <th className="px-3 py-2 text-left font-medium">Acción</th>
                  <th className="px-3 py-2 text-left font-medium">Recurso</th>
                  <th className="px-3 py-2 text-left font-medium">Paciente</th>
                  <th className="px-3 py-2 text-left font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const Icon = ACTION_ICONS[r.action] ?? Eye;
                  const tone = ACTION_TONE[r.action] ?? "text-slate-400";
                  return (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.at).toLocaleString("es-PE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm">
                          {r.user?.full_name ?? "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {r.user?.email ?? r.user_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
                          <Icon className="h-3 w-3" />
                          {ACTION_LABELS[r.action] ?? r.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {RESOURCE_LABELS[r.resource_type] ?? r.resource_type}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {(() => {
                          // Supabase embed returns array or object depending on PostgREST cardinality inference.
                          const p = Array.isArray(r.patients) ? r.patients[0] : r.patients;
                          if (p) return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
                          return r.patient_id ? r.patient_id.slice(0, 8) : "—";
                        })()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[10px] text-muted-foreground font-mono">
                        {r.ip_address ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────── */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
