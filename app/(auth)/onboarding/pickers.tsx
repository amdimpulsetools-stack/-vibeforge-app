"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { COUNTRIES, type Country, type Specialty } from "./types";

// ── Country dial picker ────────────────────────────────────────────
interface CountryPickerProps {
  value: Country;
  onChange: (c: Country) => void;
}

export function CountryPicker({ value, onChange }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-11 items-center gap-1.5 rounded-xl border border-input bg-background/50 px-3 text-sm transition-all hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        <span className="text-lg leading-none">{value.flag}</span>
        <span className="text-muted-foreground">{value.dial}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto py-1">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/50 ${
                  c.code === value.code ? "bg-primary/10 text-primary" : ""
                }`}
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-muted-foreground text-xs">{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Specialty picker (searchable) ──────────────────────────────────
interface SpecialtyPickerProps {
  specialties: Specialty[];
  value: Specialty | null;
  onChange: (s: Specialty) => void;
}

export function SpecialtyPicker({ specialties, value, onChange }: SpecialtyPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return specialties;
    const term = search.toLowerCase();
    return specialties.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.description?.toLowerCase().includes(term)
    );
  }, [specialties, search]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-11 w-full items-center justify-between rounded-xl border bg-background/50 px-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring/50 ${
          value ? "border-primary/50 text-foreground" : "border-input text-muted-foreground/60"
        }`}
      >
        <span>{value?.name || "Selecciona tu especialidad"}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
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
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No se encontraron resultados</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 ${
                    value?.id === s.id ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  <div className="flex-1 text-left">
                    <p className="font-medium">{s.name}</p>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                    )}
                  </div>
                  {value?.id === s.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
