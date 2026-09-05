/**
 * Ocupación de la agenda — UNA fórmula para Día y Semana.
 *
 * Antes el header del scheduler dividía "citas del día" entre
 * `slots_globales × 2`, con slots de constantes fijas de la app
 * (8:00–20:00 cada 15 min = 48) y un "dos consultorios" hardcodeado:
 * 7 citas en una agenda de 10 slots daban 7 %. Ignoraba el horario real
 * de la org, el intervalo, los consultorios activos, la duración de las
 * citas, los bloqueos y la vista Semana.
 *
 *   ocupación = minutos ocupados por citas no canceladas
 *             ÷ minutos disponibles
 *
 *   disponibles = Σ (días hábiles del período visibles)
 *                 Σ (consultorios activos/filtrados)
 *                   [ventana de la org] − [bloqueos de ese día/consultorio]
 *
 * - Ventana y días deshabilitados salen de la config de agenda de la org
 *   (lib/scheduler-config, la misma que dibuja la grilla).
 * - Consultorios: los ACTIVOS que están en el filtro del header. Una org
 *   "independiente" con un solo consultorio tiene un solo carril.
 * - Bloqueos (schedule_blocks) restan capacidad: no era tiempo disponible.
 *   Un bloqueo sin office_id aplica a todos los consultorios.
 * - Citas: cuentan las no canceladas (no-show sí ocupó el hueco), solo el
 *   tramo que cae dentro de la ventana y solo en consultorios del filtro.
 * - Tope 100 %: una cita fuera de ventana o en día deshabilitado no puede
 *   inflar el porcentaje por encima del total.
 *
 * Función pura sin React ni Supabase para que el dashboard admin (hoy con
 * `12 slots por doctor` hardcodeado) pueda importar la misma fórmula.
 */

import { getDay, parseISO } from "date-fns";
import type { SchedulerConfig } from "@/lib/scheduler-config";
import {
  getScheduleEndMinutes,
  getScheduleStartMinutes,
} from "@/lib/scheduler-config";

export interface OccupancyAppointment {
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  office_id: string | null;
}

export interface OccupancyBlock {
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  office_id: string | null;
  all_day: boolean;
}

export interface OccupancyInput {
  /** Días visibles del período, en formato yyyy-MM-dd. */
  days: string[];
  /** Consultorios activos considerados (los del filtro del header). */
  officeIds: string[];
  appointments: OccupancyAppointment[];
  blocks: OccupancyBlock[];
  config: SchedulerConfig;
}

export interface OccupancyResult {
  /** 0–100, redondeado, con tope en 100. */
  percent: number;
  occupiedMinutes: number;
  capacityMinutes: number;
  /** Días del período que cuentan como hábiles según la config. */
  workingDays: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/** Minutos del tramo [aStart, aEnd) que caen dentro de [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function computeOccupancy(input: OccupancyInput): OccupancyResult {
  const { days, officeIds, appointments, blocks, config } = input;
  const windowStart = getScheduleStartMinutes(config);
  const windowEnd = getScheduleEndMinutes(config);
  const windowMinutes = Math.max(0, windowEnd - windowStart);
  const disabled = new Set<number>(config.disabledWeekdays ?? []);
  const officeSet = new Set(officeIds);

  const workingDays = days.filter((d) => !disabled.has(getDay(parseISO(d))));

  // ── Capacidad: ventana × consultorios × días hábiles, menos bloqueos ──
  let capacityMinutes = 0;
  for (const day of workingDays) {
    for (const officeId of officeIds) {
      let blocked = 0;
      for (const b of blocks) {
        if (b.block_date !== day) continue;
        if (b.office_id && b.office_id !== officeId) continue;
        if (b.all_day) {
          blocked = windowMinutes;
          break;
        }
        const bs = b.start_time ? toMinutes(b.start_time) : 0;
        const be = b.end_time ? toMinutes(b.end_time) : 24 * 60;
        blocked += overlap(bs, be, windowStart, windowEnd);
      }
      capacityMinutes += Math.max(0, windowMinutes - Math.min(blocked, windowMinutes));
    }
  }

  // ── Ocupado: citas no canceladas dentro de la ventana y del filtro ──
  const daySet = new Set(days);
  let occupiedMinutes = 0;
  for (const a of appointments) {
    if (!daySet.has(a.appointment_date)) continue;
    if (a.status === "cancelled") continue;
    if (a.office_id && !officeSet.has(a.office_id)) continue;
    // En un día deshabilitado no hay capacidad; la cita se cuenta igual y el
    // tope a 100 evita que distorsione.
    occupiedMinutes += overlap(
      toMinutes(a.start_time),
      toMinutes(a.end_time),
      windowStart,
      windowEnd,
    );
  }

  const percent =
    capacityMinutes > 0
      ? Math.min(100, Math.round((occupiedMinutes / capacityMinutes) * 100))
      : 0;

  return {
    percent,
    occupiedMinutes,
    capacityMinutes,
    workingDays: workingDays.length,
  };
}
