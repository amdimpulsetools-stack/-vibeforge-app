"use client";

import Link from "next/link";
import { Lock, ListChecks } from "lucide-react";
import {
  REQUIRED_FIELD_KEYS,
  type RequiredFieldKey,
  type AppointmentRequiredFields,
} from "@/lib/scheduler-config";

interface AgendaRequiredFieldsSectionProps {
  /** Current per-org override map (mig 176). */
  value: AppointmentRequiredFields;
  /** Called with the full next map whenever a toggle flips (auto-save). */
  onChange: (next: AppointmentRequiredFields) => void;
  language: "es" | "en";
}

/** Field label + one-line description per configurable key. */
const FIELD_META: Record<RequiredFieldKey, { es: string; en: string; descEs: string; descEn: string }> = {
  patient_dni: {
    es: "Documento (DNI / CE)",
    en: "Document (DNI / CE)",
    descEs: "Identifica al paciente y evita duplicados",
    descEn: "Identifies the patient and avoids duplicates",
  },
  patient_phone: {
    es: "Teléfono",
    en: "Phone",
    descEs: "Necesario para confirmar por WhatsApp",
    descEn: "Needed to confirm via WhatsApp",
  },
  patient_email: {
    es: "Email",
    en: "Email",
    descEs: "Para enviar la confirmación por correo",
    descEn: "To send the confirmation by email",
  },
  patient_birth_date: {
    es: "Fecha de nacimiento",
    en: "Birth date",
    descEs: "Permite calcular la edad del paciente",
    descEn: "Lets you compute the patient's age",
  },
  patient_location: {
    es: "Ubicación (departamento y distrito)",
    en: "Location (department and district)",
    descEs: "Útil para estadísticas de procedencia",
    descEn: "Useful for origin statistics",
  },
  origin: {
    es: "Origen",
    en: "Origin",
    descEs: "Cómo se enteró el paciente de la clínica",
    descEn: "How the patient heard about the clinic",
  },
  payment_method: {
    es: "Método de pago",
    en: "Payment method",
    descEs: "Forma de pago prevista para la cita",
    descEn: "Expected payment method for the visit",
  },
  responsible: {
    es: "Responsable",
    en: "Responsible",
    descEs: "Quién agenda o atiende la cita",
    descEn: "Who schedules or handles the appointment",
  },
  notes: {
    es: "Notas",
    en: "Notes",
    descEs: "Observaciones adicionales de la cita",
    descEn: "Additional notes for the appointment",
  },
};

export default function AgendaRequiredFieldsSection({
  value,
  onChange,
  language,
}: AgendaRequiredFieldsSectionProps) {
  const es = language === "es";

  const alwaysRequired = es
    ? ["Nombre y apellido", "Fecha y hora", "Doctor", "Consultorio", "Servicio"]
    : ["First & last name", "Date & time", "Doctor", "Office", "Service"];

  const toggle = (key: RequiredFieldKey, checked: boolean) => {
    onChange({ ...value, [key]: checked });
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ListChecks className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {es ? "Campos de la cita" : "Appointment fields"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {es
              ? "Elige qué datos son obligatorios al agendar una cita nueva."
              : "Choose which data is required when scheduling a new appointment."}
          </p>
        </div>
      </div>

      {/* Always required (read-only) */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          {es ? "Siempre obligatorios" : "Always required"}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground/80">
          {alwaysRequired.map((label, i) => (
            <span key={label} className="flex items-center gap-3">
              {i > 0 && <span className="text-muted-foreground/40">·</span>}
              {label}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {es
            ? "Sin estos datos la cita no puede existir."
            : "Without these the appointment cannot exist."}
        </p>
      </div>

      {/* Configurable */}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {es ? "Configurables" : "Configurable"}
        </p>
        <div className="divide-y divide-border/50">
          {REQUIRED_FIELD_KEYS.map((key) => {
            const meta = FIELD_META[key];
            const checked = value[key] === true;
            return (
              <label
                key={key}
                className="flex items-center justify-between gap-4 py-3 select-none cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{es ? meta.es : meta.en}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {es ? meta.descEs : meta.descEn}
                  </p>
                </div>
                <div className="relative ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground border-t border-border/40 pt-4">
        {es ? "¿Necesitas campos propios? Créalos en " : "Need your own fields? Create them in "}
        <Link
          href="/admin/custom-fields"
          className="font-medium text-primary hover:underline"
        >
          {es ? "Campos personalizados" : "Custom fields"}
        </Link>
        .
      </p>
    </div>
  );
}
