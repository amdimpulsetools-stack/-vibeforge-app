"use client";

/**
 * <DatePicker /> — reemplazo de <input type="date"> con formato fijo
 * dd/mm/aaaa. Los inputs nativos muestran la fecha según el locale del
 * NAVEGADOR (un Chrome en inglés renderiza mm/dd/yyyy aunque la app
 * esté en español), así que la única forma de garantizar dd/mm/aaaa
 * para todos los usuarios es un picker propio.
 *
 * Contrato de valor: igual que el input nativo — string "yyyy-MM-dd"
 * (o "" vacío) — para que el swap no toque schemas, APIs ni DB.
 */

import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ISO = "yyyy-MM-dd";

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

  const parsed = value ? parse(value, ISO, new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          selected={selected}
          defaultMonth={selected}
          captionLayout={withYearDropdown ? "dropdown" : "label"}
          startMonth={
            withYearDropdown ? new Date(fromYear, 0) : undefined
          }
          endMonth={withYearDropdown ? new Date(toYear, 11) : undefined}
          classNames={
            withYearDropdown
              ? {
                  dropdowns: "flex items-center justify-center gap-1.5",
                  dropdown:
                    "rounded-md border border-input bg-background px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50",
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
