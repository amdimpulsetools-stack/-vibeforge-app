"use client";

/**
 * <DatePicker /> — reemplazo de <input type="date"> con formato fijo
 * dd/mm/aaaa. Los inputs nativos muestran la fecha según el locale del
 * NAVEGADOR (un Chrome en inglés renderiza mm/dd/yyyy aunque la app
 * esté en español), así que la única forma de garantizar dd/mm/aaaa
 * para todos los usuarios es un picker propio.
 *
 * Se puede TECLEAR la fecha (máscara dd/mm/aaaa que inserta las barras
 * sola) o elegirla del calendario con el botón. Contrato de valor:
 * igual que el input nativo — string "yyyy-MM-dd" (o "" vacío) — para
 * que el swap no toque schemas, APIs ni DB.
 */

import { useEffect, useState } from "react";
import { format, isValid, parse } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ISO = "yyyy-MM-dd";
const DISPLAY = "dd/MM/yyyy";

function isoToDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO, new Date());
  return isValid(parsed) ? parsed : undefined;
}

function isoToDisplay(value: string): string {
  const d = isoToDate(value);
  return d ? format(d, DISPLAY) : "";
}

/** "1503199" → "15/03/199" — inserta las barras mientras se teclea. */
function maskDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

interface DatePickerProps {
  /** "yyyy-MM-dd" o "" */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Dropdowns de mes/año para fechas lejanas (ej. nacimiento). */
  withYearDropdown?: boolean;
  fromYear?: number;
  toYear?: number;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  disabled = false,
  className,
  withYearDropdown = false,
  fromYear = 1930,
  toYear = new Date().getFullYear(),
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => isoToDisplay(value));

  // Sincroniza el texto cuando el valor cambia desde afuera (prefill del
  // slot clickeado, reset del form, selección en el calendario).
  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  const selected = isoToDate(value);

  const handleType = (raw: string) => {
    const masked = maskDigits(raw);
    setText(masked);
    const digits = masked.replace(/\D/g, "");
    if (digits.length === 0) {
      onChange("");
      return;
    }
    if (digits.length === 8) {
      const parsed = parse(masked, DISPLAY, new Date());
      if (isValid(parsed)) onChange(format(parsed, ISO));
    }
  };

  // Al salir del campo, un texto incompleto/ inválido vuelve al último
  // valor válido (o queda vacío) — nunca dejamos basura visible.
  const handleBlur = () => {
    const digits = text.replace(/\D/g, "");
    if (digits.length === 8) {
      const parsed = parse(text, DISPLAY, new Date());
      if (isValid(parsed)) return;
    }
    if (digits.length === 0) {
      onChange("");
      setText("");
      return;
    }
    setText(isoToDisplay(value));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex w-full items-center rounded-lg border border-input bg-background transition-colors",
            "focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          <input
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => handleType(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full min-w-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              tabIndex={-1}
              aria-label="Abrir calendario"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          selected={selected}
          defaultMonth={selected}
          captionLayout={withYearDropdown ? "dropdown" : "label"}
          startMonth={withYearDropdown ? new Date(fromYear, 0) : undefined}
          endMonth={withYearDropdown ? new Date(toYear, 11) : undefined}
          classNames={
            withYearDropdown
              ? {
                  // Patrón oficial de react-day-picker v9 para dropdowns:
                  // el <select> real queda invisible ENCIMA de la etiqueta
                  // (caption_label) y captura el click. Sin estos estilos
                  // se pintaban select + etiqueta duplicados
                  // ("julio julio 2026 2026").
                  month_caption: "flex justify-center pt-2 pb-1 w-full",
                  dropdowns: "flex items-center justify-center gap-2",
                  dropdown_root:
                    "relative inline-flex items-center rounded-md border border-input bg-background px-2 py-1 hover:bg-accent transition-colors",
                  dropdown:
                    "absolute inset-0 w-full opacity-0 cursor-pointer appearance-none",
                  caption_label:
                    "flex items-center gap-1 text-sm font-medium capitalize",
                }
              : undefined
          }
          onSelect={(day) => {
            onChange(day ? format(day, ISO) : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
