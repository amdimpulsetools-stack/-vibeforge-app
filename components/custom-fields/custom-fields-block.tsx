"use client";

import { useCustomFieldDefinitions } from "@/hooks/use-custom-field-definitions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type {
  CustomFieldDefinition,
  CustomFieldEntity,
  CustomFieldValue,
  CustomFieldValues,
} from "@/types/custom-fields";

interface CustomFieldsBlockProps {
  entityType: CustomFieldEntity;
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
  className?: string;
  /** Heading shown above the fields. Pass null to hide. */
  heading?: string | null;
  disabled?: boolean;
}

/**
 * Renders all active custom field definitions for an entity, wired as a
 * controlled block. The parent owns the `values` map (keyed by field_key) and
 * receives a new map on every change. Returns null when the org has no
 * definitions, so callers can drop it into any form without conditionals.
 */
export function CustomFieldsBlock({
  entityType,
  values,
  onChange,
  className,
  heading = "Campos personalizados",
  disabled = false,
}: CustomFieldsBlockProps) {
  const { definitions, loading } = useCustomFieldDefinitions(entityType);

  if (loading) return null;
  if (definitions.length === 0) return null;

  const setField = (key: string, value: CustomFieldValue) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {heading && (
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      )}
      <div className="space-y-4">
        {definitions.map((def) => (
          <CustomFieldRow
            key={def.id}
            definition={def}
            value={values[def.field_key] ?? null}
            onChange={(v) => setField(def.field_key, v)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function CustomFieldRow({
  definition,
  value,
  onChange,
  disabled,
}: {
  definition: CustomFieldDefinition;
  value: CustomFieldValue;
  onChange: (v: CustomFieldValue) => void;
  disabled: boolean;
}) {
  const labelEl = (
    <label
      htmlFor={`cf-${definition.id}`}
      className="block text-xs font-medium text-muted-foreground"
    >
      {definition.label}
      {definition.required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );

  const help = definition.help_text ? (
    <p className="text-[11px] text-muted-foreground/70">{definition.help_text}</p>
  ) : null;

  switch (definition.field_type) {
    case "text":
      return (
        <div className="space-y-1">
          {labelEl}
          <Input
            id={`cf-${definition.id}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={definition.placeholder ?? ""}
            disabled={disabled}
          />
          {help}
        </div>
      );
    case "textarea":
      return (
        <div className="space-y-1">
          {labelEl}
          <Textarea
            id={`cf-${definition.id}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={definition.placeholder ?? ""}
            disabled={disabled}
            rows={3}
          />
          {help}
        </div>
      );
    case "number":
      return (
        <div className="space-y-1">
          {labelEl}
          <Input
            id={`cf-${definition.id}`}
            type="number"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            placeholder={definition.placeholder ?? ""}
            disabled={disabled}
          />
          {help}
        </div>
      );
    case "date":
      return (
        <div className="space-y-1">
          {labelEl}
          <Input
            id={`cf-${definition.id}`}
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
          />
          {help}
        </div>
      );
    case "select":
      return (
        <div className="space-y-1">
          {labelEl}
          <select
            id={`cf-${definition.id}`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{definition.placeholder ?? "Seleccionar..."}</option>
            {definition.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    case "checkbox":
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`cf-${definition.id}`}
              checked={Boolean(value)}
              onCheckedChange={(checked) => onChange(checked === true)}
              disabled={disabled}
            />
            <label
              htmlFor={`cf-${definition.id}`}
              className="text-sm text-foreground"
            >
              {definition.label}
              {definition.required && (
                <span className="ml-0.5 text-destructive">*</span>
              )}
            </label>
          </div>
          {help}
        </div>
      );
  }
}
