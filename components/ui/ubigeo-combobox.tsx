"use client";

import * as React from "react";
import { Check, ChevronsUpDown, MapPin, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type UbigeoOption,
  searchUbigeo,
  findUbigeoByCode,
} from "@/lib/sunat/ubigeo";

interface UbigeoComboboxProps {
  /** 6-digit code currently selected, or null. */
  value: string | null;
  /** Called when the user picks an entry. Receives both the code and the full option for convenience (so the caller can persist `district` too). */
  onChange: (option: UbigeoOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function UbigeoCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Selecciona distrito...",
  className,
  id,
}: UbigeoComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = React.useMemo(() => findUbigeoByCode(value), [value]);
  const results = React.useMemo(() => searchUbigeo(query, 80), [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {selected ? (
              <span className="truncate">
                <span>{selected.label}</span>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {selected.code}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar distrito, provincia, departamento o código…"
              className="flex h-7 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {results.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Sin resultados. Probá con otro término o el código de 6 dígitos.
              </div>
            ) : (
              results.map((opt) => {
                const isActive = opt.code === value;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      isActive && "bg-accent/60"
                    )}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="truncate font-medium">{opt.distrito}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {opt.provincia} · {opt.departamento}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {opt.code}
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {selected && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px]">
              <span className="text-muted-foreground">
                Seleccionado:{" "}
                <span className="font-mono text-foreground">{selected.code}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setQuery("");
                }}
                className="text-destructive hover:underline"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
