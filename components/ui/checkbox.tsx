"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox component (shadcn-style, no Radix dependency).
 *
 * Renders a native <input type="checkbox"> visually replaced by a styled
 * box with a Lucide check icon. Keeps full keyboard / form / a11y semantics
 * because it is a real input under the hood.
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, disabled, ...props }, ref) => {
    return (
      <span
        className={cn(
          "relative inline-flex h-4 w-4 shrink-0 items-center justify-center",
          disabled && "opacity-50",
          className
        )}
      >
        {/* El input es transparente y, en móvil, se extiende más allá de la
            caja visible (16 px) sin mover un pixel del layout: 44 px de alto
            y 36 px de ancho. La expansión horizontal se queda en 10 px por
            lado a propósito — es justo el `gap-2.5` habitual con la etiqueta,
            así el área tocable no se come el texto ni los enlaces que suelen
            ir al lado (p. ej. los Términos del registro). Desde md vuelve a
            coincidir exactamente con la caja.
            La caja visible pasa a un <span> hermano pintado con
            `peer-checked:` — así el estado se refleja también cuando el
            checkbox se usa sin controlar (defaultChecked). */}
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            onChange?.(e);
            onCheckedChange?.(e.target.checked);
          }}
          className="peer absolute -inset-y-3.5 -inset-x-2.5 z-[1] m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed md:inset-0"
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[4px] border border-input bg-card shadow-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
        />
        <Check
          className={cn(
            "pointer-events-none relative h-3 w-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100",
            checked && "opacity-100"
          )}
          strokeWidth={3}
        />
      </span>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
