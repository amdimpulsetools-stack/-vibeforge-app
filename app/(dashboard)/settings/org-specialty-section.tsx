"use client";

import { useEffect, useMemo, useState } from "react";
import { Stethoscope, Loader2, Check, Lock, ChevronDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { SPECIALTIES, type SpecialtyOption } from "@/lib/specialties";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";

interface SpecialtyRow {
  id: string;
  slug: string;
  name: string;
}

export default function OrgSpecialtySection() {
  const { organizationId, refetchOrg } = useOrganization();
  const { isOwner } = useOrgRole();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // The DB stores `primary_specialty_id` — a uuid of the catalog row
  // in `specialties`. We round-trip slug ↔ id through the catalog so
  // the picker can speak in slugs (matches lib/specialties.ts) while
  // persistence keeps the existing schema.
  const [catalog, setCatalog] = useState<SpecialtyRow[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    const supabase = createClient();
    let cancelled = false;

    void Promise.all([
      supabase.from("specialties").select("id, slug, name").order("sort_order"),
      supabase
        .from("organizations")
        .select("primary_specialty_id")
        .eq("id", organizationId)
        .single(),
    ]).then(([catalogRes, orgRes]) => {
      if (cancelled) return;
      const rows = (catalogRes.data ?? []) as SpecialtyRow[];
      setCatalog(rows);

      const orgRow = orgRes.data as { primary_specialty_id?: string | null } | null;
      const id = orgRow?.primary_specialty_id ?? null;
      const match = id ? rows.find((r) => r.id === id) : null;
      setCurrentSlug(match?.slug ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const currentSpecialty: SpecialtyOption | undefined = useMemo(
    () => SPECIALTIES.find((s) => s.slug === currentSlug),
    [currentSlug],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return SPECIALTIES;
    return SPECIALTIES.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.description ?? "").toLowerCase().includes(term),
    );
  }, [search]);

  const handleSelect = async (option: SpecialtyOption) => {
    if (!organizationId) return;
    setOpen(false);
    setSearch("");
    if (option.slug === currentSlug) return;

    const catalogRow = catalog.find((c) => c.slug === option.slug);
    if (!catalogRow) {
      toast.error("La especialidad no está disponible en el catálogo");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ primary_specialty_id: catalogRow.id })
      .eq("id", organizationId);

    setSaving(false);
    if (error) {
      toast.error("No se pudo actualizar la especialidad: " + error.message);
      return;
    }

    setCurrentSlug(option.slug);
    refetchOrg();
    toast.success("Especialidad actualizada");
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando especialidad…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Stethoscope className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Especialidad de la organización</h2>
          <p className="text-sm text-muted-foreground">
            Determina los addons recomendados y los flujos clínicos por defecto.
          </p>
        </div>
      </div>

      {!isOwner && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Solo el propietario (owner) puede cambiar la especialidad.
        </div>
      )}

      <div className="relative max-w-md">
        <button
          type="button"
          onClick={() => isOwner && setOpen(!open)}
          disabled={!isOwner || saving}
          className={`flex h-11 w-full items-center justify-between rounded-xl border bg-background px-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring/50 ${
            currentSpecialty
              ? "border-primary/50 text-foreground"
              : "border-input text-muted-foreground/60"
          } ${!isOwner ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span>{currentSpecialty?.name || "Selecciona la especialidad principal"}</span>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
        {open && isOwner && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar especialidad..."
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  No se encontraron resultados
                </p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 ${
                      currentSlug === s.slug ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <div className="flex-1 text-left">
                      <p className="font-medium">{s.name}</p>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.description}
                        </p>
                      )}
                    </div>
                    {currentSlug === s.slug && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
