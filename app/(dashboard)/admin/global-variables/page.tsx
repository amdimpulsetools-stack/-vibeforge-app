"use client";

import { useState, useRef } from "react";
import { GripVertical, Plus, Pencil, Trash2, Save, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_GLOBAL_VARIABLES, type GlobalVariable, type GlobalVariableType } from "@/lib/clinic-data";
import { toast } from "sonner";

const TYPE_LABELS: Record<GlobalVariableType, string> = {
  text: "Texto",
  number: "Número",
  boolean: "Sí/No",
  color: "Color",
};

const TYPE_COLORS: Record<GlobalVariableType, string> = {
  text: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  number: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  boolean: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function GlobalVariablesPage() {
  const [variables, setVariables] = useState<GlobalVariable[]>(
    [...MOCK_GLOBAL_VARIABLES].sort((a, b) => a.sort_order - b.sort_order)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<GlobalVariable>>({});

  // ============================================================
  // Drag and Drop — HTML5 nativo (Requisito #5)
  // ============================================================
  const dragItemRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    dragItemRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    // Efecto visual en el elemento arrastrado
    setTimeout(() => {
      const el = document.getElementById(`var-row-${id}`);
      if (el) el.style.opacity = "0.4";
    }, 0);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    const sourceId = dragItemRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      return;
    }

    setVariables((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((v) => v.id === sourceId);
      const toIdx = arr.findIndex((v) => v.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);

      // Actualizar sort_order
      return arr.map((v, idx) => ({ ...v, sort_order: idx }));
    });

    dragItemRef.current = null;
    setDragOverId(null);
    toast.success("Orden actualizado");
  }

  function handleDragEnd() {
    if (dragItemRef.current) {
      const el = document.getElementById(`var-row-${dragItemRef.current}`);
      if (el) el.style.opacity = "1";
    }
    dragItemRef.current = null;
    setDragOverId(null);
  }

  // ============================================================
  // Edición inline
  // ============================================================
  function startEditing(variable: GlobalVariable) {
    setEditingId(variable.id);
    setEditValues({
      key: variable.key,
      value: variable.value,
      description: variable.description ?? "",
      type: variable.type,
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditValues({});
  }

  function saveEditing(id: string) {
    setVariables((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              key: editValues.key ?? v.key,
              value: editValues.value ?? v.value,
              description: (editValues.description as string) || null,
              type: editValues.type ?? v.type,
              updated_at: new Date().toISOString(),
            }
          : v
      )
    );
    setEditingId(null);
    setEditValues({});
    toast.success("Variable actualizada");
  }

  function deleteVariable(id: string) {
    setVariables((prev) => prev.filter((v) => v.id !== id));
    toast.success("Variable eliminada");
  }

  function addVariable() {
    const newVar: GlobalVariable = {
      id: `gv-${Date.now()}`,
      key: "nueva_variable",
      value: "",
      type: "text",
      description: null,
      sort_order: variables.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setVariables((prev) => [...prev, newVar]);
    setEditingId(newVar.id);
    setEditValues({
      key: newVar.key,
      value: "",
      description: "",
      type: "text",
    });
  }

  function renderValue(variable: GlobalVariable) {
    switch (variable.type) {
      case "color":
        return (
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full border border-border shadow-sm"
              style={{ backgroundColor: variable.value }}
            />
            <span className="text-sm font-mono text-foreground">{variable.value}</span>
          </div>
        );
      case "boolean":
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              variable.value === "true"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {variable.value === "true" ? (
              <>
                <Check className="h-3 w-3" /> Sí
              </>
            ) : (
              "No"
            )}
          </span>
        );
      default:
        return (
          <span className="text-sm font-mono text-foreground">
            {variable.value || <span className="italic text-muted-foreground">vacío</span>}
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Variables Globales</h1>
          <p className="text-sm text-muted-foreground">
            Configura parámetros globales del sistema. Arrastra para reordenar.
          </p>
        </div>
        <button
          onClick={addVariable}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva variable
        </button>
      </div>

      {/* Instrucción de DnD */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-2.5">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Arrastra el ícono <span className="font-semibold">⠿</span> para cambiar el orden de las variables
        </p>
      </div>

      {/* Lista de variables */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Encabezado tabla */}
        <div className="grid grid-cols-[40px_1fr_1fr_120px_80px_96px] gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
          <div />
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clave</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Orden</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Acciones</div>
        </div>

        {variables.map((variable, index) => {
          const isEditing = editingId === variable.id;
          const isDragOver = dragOverId === variable.id;

          return (
            <div
              key={variable.id}
              id={`var-row-${variable.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, variable.id)}
              onDragOver={(e) => handleDragOver(e, variable.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, variable.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                "grid grid-cols-[40px_1fr_1fr_120px_80px_96px] gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 transition-colors",
                isDragOver
                  ? "bg-primary/10 border-primary/40"
                  : "hover:bg-muted/20",
                isEditing && "bg-primary/5"
              )}
            >
              {/* Drag handle */}
              <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Clave */}
              <div className="flex items-center min-w-0">
                {isEditing ? (
                  <input
                    type="text"
                    value={editValues.key ?? ""}
                    onChange={(e) =>
                      setEditValues((prev) => ({ ...prev, key: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="clave_variable"
                    autoFocus
                  />
                ) : (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-mono font-semibold text-foreground">
                      {variable.key}
                    </p>
                    {variable.description && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        {variable.description}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Valor */}
              <div className="flex items-center min-w-0">
                {isEditing ? (
                  editValues.type === "boolean" ? (
                    <select
                      value={editValues.value ?? "false"}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, value: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="true">Sí (true)</option>
                      <option value="false">No (false)</option>
                    </select>
                  ) : editValues.type === "color" ? (
                    <input
                      type="color"
                      value={editValues.value ?? "#000000"}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, value: e.target.value }))
                      }
                      className="h-8 w-16 cursor-pointer rounded-md border border-border bg-background p-1"
                    />
                  ) : (
                    <input
                      type={editValues.type === "number" ? "number" : "text"}
                      value={editValues.value ?? ""}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, value: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="valor"
                    />
                  )
                ) : (
                  <div className="truncate">{renderValue(variable)}</div>
                )}
              </div>

              {/* Tipo */}
              <div className="flex items-center">
                {isEditing ? (
                  <select
                    value={editValues.type ?? "text"}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        type: e.target.value as GlobalVariableType,
                      }))
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                    <option value="boolean">Sí/No</option>
                    <option value="color">Color</option>
                  </select>
                ) : (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      TYPE_COLORS[variable.type]
                    )}
                  >
                    {TYPE_LABELS[variable.type]}
                  </span>
                )}
              </div>

              {/* Orden */}
              <div className="flex items-center">
                <span className="text-xs font-mono text-muted-foreground">
                  #{index + 1}
                </span>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => saveEditing(variable.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      title="Guardar"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Cancelar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEditing(variable)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteVariable(variable.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {variables.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No hay variables definidas</p>
            <button
              onClick={addVariable}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Agregar primera variable
            </button>
          </div>
        )}
      </div>

      {/* Footer info */}
      <p className="text-xs text-muted-foreground">
        {variables.length} variable{variables.length !== 1 ? "s" : ""} en total
        {" · "}El orden se guarda automáticamente al soltar
      </p>
    </div>
  );
}
