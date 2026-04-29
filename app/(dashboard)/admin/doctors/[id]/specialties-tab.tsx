"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { SPECIALTIES, findSpecialtyByName } from "@/lib/specialties";
import { useOrgRole } from "@/hooks/use-org-role";

interface DoctorSpecialtyRow {
  id: string;
  doctor_id: string;
  specialty: string;
  is_primary: boolean;
  created_at: string;
}

interface SpecialtiesTabProps {
  doctorId: string;
}

export function SpecialtiesTab({ doctorId }: SpecialtiesTabProps) {
  const { isAdmin } = useOrgRole();
  const [rows, setRows] = useState<DoctorSpecialtyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetchRows = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("doctor_specialties")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("created_at");
    if (error) {
      toast.error("No se pudieron cargar las especialidades: " + error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as DoctorSpecialtyRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  const assignedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const match = findSpecialtyByName(r.specialty);
      if (match) set.add(match.slug);
      else set.add(r.specialty.toLowerCase());
    }
    return set;
  }, [rows]);

  const available = useMemo(
    () => SPECIALTIES.filter((s) => !assignedSlugs.has(s.slug)),
    [assignedSlugs],
  );

  const handleAdd = async (slug: string) => {
    const opt = SPECIALTIES.find((s) => s.slug === slug);
    if (!opt) return;
    setAdding(slug);
    setPickerOpen(false);
    const supabase = createClient();
    const isPrimary = rows.length === 0;
    const { error } = await supabase.from("doctor_specialties").insert({
      doctor_id: doctorId,
      specialty: opt.name,
      is_primary: isPrimary,
    });
    setAdding(null);
    if (error) {
      toast.error("No se pudo agregar: " + error.message);
      return;
    }
    toast.success("Especialidad agregada");
    void fetchRows();
  };

  const handleRemove = async (row: DoctorSpecialtyRow) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("doctor_specialties")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo eliminar: " + error.message);
      return;
    }
    toast.success("Especialidad eliminada");
    void fetchRows();
  };

  const handleSetPrimary = async (row: DoctorSpecialtyRow) => {
    if (row.is_primary) return;
    const supabase = createClient();
    // Clear current primary first to satisfy the partial unique index.
    const { error: clearError } = await supabase
      .from("doctor_specialties")
      .update({ is_primary: false })
      .eq("doctor_id", doctorId)
      .eq("is_primary", true);
    if (clearError) {
      toast.error("No se pudo actualizar la principal: " + clearError.message);
      return;
    }
    const { error } = await supabase
      .from("doctor_specialties")
      .update({ is_primary: true })
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo marcar como principal: " + error.message);
      return;
    }
    toast.success("Principal actualizada");
    void fetchRows();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Solo el propietario o administrador puede gestionar las especialidades del doctor.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Especialidades del doctor</h2>
          <p className="text-sm text-muted-foreground">
            Una especialidad puede marcarse como principal. Las demás complementan.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Aún no hay especialidades asignadas.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(r)}
                    title={r.is_primary ? "Principal" : "Marcar como principal"}
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                      r.is_primary
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Star className={`h-4 w-4 ${r.is_primary ? "fill-current" : ""}`} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.specialty}</p>
                    {r.is_primary && (
                      <p className="text-[11px] text-primary">Principal</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(r)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={available.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Agregar especialidad
          </button>

          {pickerOpen && available.length > 0 && (
            <div className="absolute z-50 mt-2 w-full max-w-md rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
              <div className="max-h-72 overflow-y-auto py-1">
                {available.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => handleAdd(s.slug)}
                    disabled={adding === s.slug}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 disabled:opacity-50"
                  >
                    <div className="flex-1 text-left">
                      <p className="font-medium">{s.name}</p>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.description}
                        </p>
                      )}
                    </div>
                    {adding === s.slug ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Check className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
