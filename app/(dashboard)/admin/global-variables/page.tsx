"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import {
  Settings2,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

interface GlobalVariable {
  id: string;
  name: string;
  key: string;
  value: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface EditState {
  id: string;
  field: "name" | "key" | "value" | "description";
  value: string;
}

const emptyNew = () => ({
  name: "",
  key: "",
  value: "",
  description: "",
});

export default function GlobalVariablesPage() {
  const { organizationId } = useOrganization();
  const [variables, setVariables] = useState<GlobalVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newVar, setNewVar] = useState(emptyNew());
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("global_variables")
      .select("*")
      .order("sort_order");
    setVariables((data as GlobalVariable[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // ─── Inline edit ──────────────────────────────────────────────────────────
  const startEdit = (id: string, field: EditState["field"], current: string) => {
    setEditing({ id, field, value: current });
  };

  const commitEdit = async () => {
    if (!editing) return;
    const { id, field, value } = editing;
    setEditing(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("global_variables")
      .update({ [field]: value.trim() })
      .eq("id", id);

    if (error) {
      toast.error("Error al guardar: " + error.message);
      fetch();
      return;
    }

    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value.trim() } : v))
    );
  };

  const cancelEdit = () => setEditing(null);

  // ─── Toggle active ────────────────────────────────────────────────────────
  const toggleActive = async (variable: GlobalVariable) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("global_variables")
      .update({ is_active: !variable.is_active })
      .eq("id", variable.id);

    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    setVariables((prev) =>
      prev.map((v) =>
        v.id === variable.id ? { ...v, is_active: !v.is_active } : v
      )
    );
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("global_variables").delete().eq("id", id);
    setDeletingId(null);

    if (error) {
      toast.error("Error al eliminar: " + error.message);
      return;
    }
    toast.success("Variable eliminada");
    setVariables((prev) => prev.filter((v) => v.id !== id));
  };

  // ─── Add new ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newVar.name.trim() || !newVar.key.trim()) {
      toast.error("Nombre y clave son requeridos");
      return;
    }
    if (!organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const maxOrder = variables.length > 0
      ? Math.max(...variables.map((v) => v.sort_order)) + 1
      : 1;

    const { data, error } = await supabase
      .from("global_variables")
      .insert({
        name: newVar.name.trim(),
        key: newVar.key.trim().toLowerCase().replace(/\s+/g, "_"),
        value: newVar.value.trim(),
        description: newVar.description.trim() || null,
        sort_order: maxOrder,
        organization_id: organizationId,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      toast.error("Error al crear: " + error.message);
      return;
    }

    toast.success("Variable creada");
    setVariables((prev) => [...prev, data as GlobalVariable]);
    setNewVar(emptyNew());
    setShowAdd(false);
  };

  // ─── HTML5 Drag & Drop ────────────────────────────────────────────────────
  const handleDragStart = (id: string) => {
    dragId.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragId.current !== id) setDragOverId(id);
  };

  const handleDrop = async (targetId: string) => {
    setDragOverId(null);
    const sourceId = dragId.current;
    dragId.current = null;
    if (!sourceId || sourceId === targetId) return;
    if (!organizationId) return;

    // Re-order locally
    const reordered = [...variables];
    const srcIdx = reordered.findIndex((v) => v.id === sourceId);
    const tgtIdx = reordered.findIndex((v) => v.id === targetId);
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);

    // Reassign sort_order sequentially
    const updated = reordered.map((v, i) => ({ ...v, sort_order: i + 1 }));
    setVariables(updated);

    // Persist to DB
    const supabase = createClient();
    const upserts = updated.map(({ id, sort_order }) => ({
      id,
      sort_order,
      // required non-null fields for upsert (pass-through, no change)
      name: variables.find((v) => v.id === id)?.name ?? "",
      key: variables.find((v) => v.id === id)?.key ?? "",
      value: variables.find((v) => v.id === id)?.value ?? "",
      is_active: variables.find((v) => v.id === id)?.is_active ?? true,
      organization_id: organizationId,
    }));

    const { error } = await supabase
      .from("global_variables")
      .upsert(upserts, { onConflict: "id" });

    if (error) {
      toast.error("Error al guardar orden: " + error.message);
      fetch();
    }
  };

  const handleDragEnd = () => {
    dragId.current = null;
    setDragOverId(null);
  };

  // ─── Editable cell helper ─────────────────────────────────────────────────
  const EditableCell = ({
    id,
    field,
    value,
    placeholder,
    className = "",
  }: {
    id: string;
    field: EditState["field"];
    value: string;
    placeholder?: string;
    className?: string;
  }) => {
    const isEditing = editing?.id === id && editing.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={editing.value}
            onChange={(e) =>
              setEditing((prev) => prev && { ...prev, value: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={commitEdit}
            className={`min-w-0 flex-1 rounded border border-primary/50 bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); commitEdit(); }}
            className="text-emerald-500 hover:text-emerald-600"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }

    return (
      <span
        onClick={() => startEdit(id, field, value)}
        title="Click para editar"
        className={`cursor-text rounded px-1 py-0.5 hover:bg-accent transition-colors ${className}`}
      >
        {value || (
          <span className="text-muted-foreground/50 italic text-xs">
            {placeholder ?? "—"}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Variables Globales</h1>
            <p className="text-sm text-muted-foreground">
              Parámetros de configuración del sistema — arrastra ⠿ para reordenar
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Nueva variable
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-medium text-primary">Nueva variable</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <input
                value={newVar.name}
                onChange={(e) => setNewVar((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Nombre de la Clínica"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Clave * (snake_case)</label>
              <input
                value={newVar.key}
                onChange={(e) => setNewVar((p) => ({ ...p, key: e.target.value }))}
                placeholder="clinic_name"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor</label>
              <input
                value={newVar.value}
                onChange={(e) => setNewVar((p) => ({ ...p, value: e.target.value }))}
                placeholder="valor"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descripción</label>
              <input
                value={newVar.description}
                onChange={(e) => setNewVar((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descripción opcional"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAdd(false); setNewVar(emptyNew()); }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" />
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : variables.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No hay variables configuradas.{" "}
            <button
              onClick={() => setShowAdd(true)}
              className="text-primary hover:underline"
            >
              Crear la primera
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Clave
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Valor
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Descripción
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">
                  Activo
                </th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {variables.map((variable) => (
                <tr
                  key={variable.id}
                  draggable
                  onDragStart={() => handleDragStart(variable.id)}
                  onDragOver={(e) => handleDragOver(e, variable.id)}
                  onDrop={() => handleDrop(variable.id)}
                  onDragEnd={handleDragEnd}
                  className={`border-b border-border/60 transition-colors ${
                    dragOverId === variable.id
                      ? "bg-primary/10 border-primary/40"
                      : "hover:bg-muted/30"
                  } ${!variable.is_active ? "opacity-50" : ""}`}
                >
                  {/* Drag handle */}
                  <td className="px-3 py-3 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3 font-medium">
                    <EditableCell
                      id={variable.id}
                      field="name"
                      value={variable.name}
                      placeholder="Sin nombre"
                    />
                  </td>

                  {/* Key */}
                  <td className="px-4 py-3">
                    <EditableCell
                      id={variable.id}
                      field="key"
                      value={variable.key}
                      placeholder="clave"
                      className="font-mono text-xs text-primary"
                    />
                  </td>

                  {/* Value */}
                  <td className="px-4 py-3">
                    <EditableCell
                      id={variable.id}
                      field="value"
                      value={variable.value}
                      placeholder="valor"
                    />
                  </td>

                  {/* Description */}
                  <td className="hidden sm:table-cell px-4 py-3 text-muted-foreground max-w-[200px]">
                    <EditableCell
                      id={variable.id}
                      field="description"
                      value={variable.description ?? ""}
                      placeholder="sin descripción"
                      className="text-xs"
                    />
                  </td>

                  {/* Active toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(variable)}
                      title={variable.is_active ? "Desactivar" : "Activar"}
                      className="mx-auto block transition-colors"
                    >
                      {variable.is_active ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  </td>

                  {/* Delete */}
                  <td className="px-4 py-3">
                    {deletingId === variable.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Eliminar la variable "${variable.name}"? Esta acción no se puede deshacer.`
                            )
                          ) {
                            handleDelete(variable.id);
                          }
                        }}
                        className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Eliminar variable"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Haz click en cualquier celda para editar · Arrastra ⠿ para reordenar
      </p>
    </div>
  );
}
