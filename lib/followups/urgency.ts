import { AlertTriangle, Clock, Flag, type LucideIcon } from "lucide-react";
import { FOLLOWUP_PRIORITY_CONFIG } from "@/types/clinical-history";

/**
 * Urgencia OPERATIVA de un seguimiento, derivada en lectura.
 *
 * `clinical_followups.priority` (semáforo de la mig 053) es la severidad
 * CLÍNICA que eligió el médico: es estática a propósito y nada la escala
 * con el tiempo. Pero la bandeja de la asesora necesita responder otra
 * pregunta —«¿a quién llamo primero?»— y ahí lo que manda es la fecha
 * comprometida, no la severidad. Antes las dos señales competían: badge
 * "Moderado" ámbar arriba y un "Vencido hace 12 días" rojo escondido en
 * la fila de metadatos.
 *
 * Este helper resuelve UN solo badge principal: si la fecha ya venció (o
 * vence hoy) esa es la señal; si no, cae a la prioridad clínica. Puro y
 * sin estado — no toca la base y no necesita cron.
 */

export type FollowupPriority = keyof typeof FOLLOWUP_PRIORITY_CONFIG;

export type FollowupUrgencyKind = "overdue" | "due_today" | "priority";

export interface FollowupUrgency {
  kind: FollowupUrgencyKind;
  label: string;
  icon: LucideIcon;
  /** Clase Tailwind de color de texto (mismo vocabulario que FOLLOWUP_PRIORITY_CONFIG). */
  textColor: string;
  /** Clase Tailwind de fondo tenue. */
  bgLight: string;
  /** Texto para el `title` del badge — explica de dónde sale la señal. */
  title: string;
}

export function resolveFollowupUrgency(
  priority: FollowupPriority,
  daysDiff: number | null | undefined
): FollowupUrgency {
  const clinical = FOLLOWUP_PRIORITY_CONFIG[priority];

  if (typeof daysDiff === "number") {
    if (daysDiff < 0) {
      const days = Math.abs(daysDiff);
      return {
        kind: "overdue",
        label: `Vencido · ${days}d`,
        icon: AlertTriangle,
        textColor: "text-red-600 dark:text-red-400",
        bgLight: "bg-red-500/10",
        title: `Venció hace ${days} ${days === 1 ? "día" : "días"} · Prioridad clínica: ${clinical.label}`,
      };
    }
    if (daysDiff === 0) {
      return {
        kind: "due_today",
        label: "Vence hoy",
        icon: Clock,
        textColor: "text-amber-600 dark:text-amber-400",
        bgLight: "bg-amber-500/10",
        title: `Vence hoy · Prioridad clínica: ${clinical.label}`,
      };
    }
  }

  return {
    kind: "priority",
    label: clinical.label,
    icon: Flag,
    textColor: clinical.textColor,
    bgLight: clinical.bgLight,
    title: `Prioridad clínica: ${clinical.label}`,
  };
}

/** Etiqueta corta del último contacto para el micro-texto de la card. */
export function formatLastContacted(
  lastContactedAt: string | null | undefined,
  now: Date = new Date()
): string {
  if (!lastContactedAt) return "Sin contactar aún";
  const then = new Date(lastContactedAt);
  if (Number.isNaN(then.getTime())) return "Sin contactar aún";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Último contacto: hoy";
  if (days === 1) return "Último contacto: ayer";
  return `Último contacto: hace ${days} d`;
}
