"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/role-gate";
import { CIE10_CATALOG } from "@/lib/cie10-catalog";
import { createClient } from "@/lib/supabase/client";
import type { CustomDiagnosisCode } from "@/app/api/custom-diagnosis-codes/route";
import { BookOpen, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";

interface Specialty {
  id: string;
  name: string;
}

export default function DiagnosisCodesPage() {
  const [codes, setCodes] = useState<CustomDiagnosisCode[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomDiagnosisCode | null>(null);
  const [filter, setFilter] = useState("");

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const fetchData = async () => {
    try {
      const supabase = createClient();
      const [codesRes, specRes] = await Promise.all([
        fetch("/api/custom-diagnosis-codes"),
        supabase.from("specialties").select("id, name").order("name"),
      ]);
      const codesJson = await codesRes.json();
      setCodes(codesJson.data ?? []);
      if (!specRes.error) {
        setSpecialties(specRes.data ?? []);
      }
    } catch {
      toast.error("Error al cargar códigos");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setCode("");
    setLabel("");
    setSpecialtyId("");
    setNotes("");
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (entry: CustomDiagnosisCode) => {
    setEditing(entry);
    setCode(entry.code);
    setLabel(entry.label);
    setSpecialtyId(entry.specialty_id ?? "");
    setNotes(entry.notes ?? "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !label.trim()) {
      toast.error("Código y descripción son obligatorios");
      return;
    }

    setSaving(true);
    try {
      const url = "/api/custom-diagnosis-codes";
      const method = editing ? "PATCH" : "POST";
      const body = editing
        ? { id: editing.id, label, specialty_id: specialtyId || null, notes }
        : { code, label, specialty_id: specialtyId || null, notes };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        if (json.error === "code_already_exists") {
          toast.error("Ya existe un código con ese identificador");
        } else {
          toast.error(json.error || "Error al guardar");
        }
        return;
      }

      toast.success(editing ? "Código actualizado" : "Código agregado");
      setShowForm(false);
      resetForm();
      fetchData();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este código? Las notas existentes no se verán afectadas.")) return;
    try {
      const res = await fetch(`/api/custom-diagnosis-codes?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Error al eliminar");
        return;
      }
      toast.success("Código eliminado");
      fetchData();
    } catch {
      toast.error("Error de red");
    }
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) return codes;
    const q = filter.toLowerCase();
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [codes, filter]);

  const globalCount = CIE10_CATALOG.length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <RoleGate minRole="admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Diagnósticos CIE-10</h1>
            <p className="text-muted-foreground">
              Extiende el catálogo global con códigos específicos de tu especialidad.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="self-start flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Nuevo código
          </button>
        </div>

        {/* Stats banner */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-6">
          <div>
            <div className="text-xs text-muted-foreground">Catálogo global</div>
            <div className="text-lg font-semibold">{globalCount} códigos</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Códigos personalizados</div>
            <div className="text-lg font-semibold text-primary">{codes.length}</div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar por código o descripción..."
                className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? "Editar código" : "Nuevo código personalizado"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded-lg p-1 hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[140px,1fr]">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Código CIE-10 *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Ej: E28.2"
                    disabled={!!editing}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Descripción *</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Ej: Síndrome de ovario poliquístico"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Especialidad (opcional)</label>
                <select
                  value={specialtyId}
                  onChange={(e) => setSpecialtyId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Sin especialidad</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Notas internas (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Referencias, aclaraciones o uso recomendado"
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing ? "Guardar cambios" : "Agregar código"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-2">
              {codes.length === 0
                ? "Aún no has agregado códigos personalizados"
                : "Ningún código coincide con la búsqueda"}
            </p>
            {codes.length === 0 && (
              <>
                <p className="text-xs text-muted-foreground/70 mb-4">
                  Agrega códigos CIE-10 que tu especialidad necesita y que no estén en el
                  catálogo global
                </p>
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-4 w-4" />
                  Agregar primer código
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Código</th>
                  <th className="px-4 py-2 text-left">Descripción</th>
                  <th className="px-4 py-2 text-left">Especialidad</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const specialty = specialties.find((s) => s.id === entry.specialty_id);
                  return (
                    <tr
                      key={entry.id}
                      className="border-t border-border hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-primary">
                        {entry.code}
                      </td>
                      <td className="px-4 py-3">
                        <div>{entry.label}</div>
                        {entry.notes && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {entry.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {specialty?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(entry)}
                            className="rounded-lg p-2 hover:bg-muted transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="rounded-lg p-2 hover:bg-red-500/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGate>
  );
}
