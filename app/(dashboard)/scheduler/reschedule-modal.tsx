"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { AppointmentWithRelations, Office, Doctor } from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import { X, Loader2, CalendarDays, Clock, RefreshCw } from "lucide-react";

interface RescheduleModalProps {
  appointment: AppointmentWithRelations;
  offices: Office[];
  doctors: Doctor[];
  existingAppointments: AppointmentWithRelations[];
  onClose: () => void;
  onSaved: () => void;
}

function generateTimeOptions() {
  const opts: string[] = [];
  for (let h = SCHEDULER_START_HOUR; h < SCHEDULER_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SCHEDULER_INTERVAL) {
      opts.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return opts;
}

const TIME_OPTIONS = generateTimeOptions();

export function RescheduleModal({
  appointment,
  offices,
  doctors,
  existingAppointments,
  onClose,
  onSaved,
}: RescheduleModalProps) {
  const [newDate, setNewDate] = useState(appointment.appointment_date);
  const [newTime, setNewTime] = useState(appointment.start_time.slice(0, 5));
  const [newOfficeId, setNewOfficeId] = useState(appointment.office_id);
  const [newDoctorId, setNewDoctorId] = useState(appointment.doctor_id);
  const [saving, setSaving] = useState(false);

  // Compute new end time based on original duration
  const newEndTime = useMemo(() => {
    const origStart = appointment.start_time.slice(0, 5);
    const origEnd = appointment.end_time.slice(0, 5);
    const [sh, sm] = origStart.split(":").map(Number);
    const [eh, em] = origEnd.split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);

    const [nh, nm] = newTime.split(":").map(Number);
    const newEndMinutes = nh * 60 + nm + duration;
    const endH = Math.floor(newEndMinutes / 60);
    const endM = newEndMinutes % 60;
    return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
  }, [newTime, appointment.start_time, appointment.end_time]);

  // Conflict check (exclude this appointment itself)
  const conflict = useMemo(() => {
    const others = existingAppointments.filter((a) => a.id !== appointment.id);

    const officeConflict = others.find(
      (a) =>
        a.appointment_date === newDate &&
        a.office_id === newOfficeId &&
        a.start_time.slice(0, 5) < newEndTime &&
        a.end_time.slice(0, 5) > newTime
    );
    if (officeConflict) return "Conflicto con otra cita en ese consultorio y horario";

    const doctorConflict = others.find(
      (a) =>
        a.appointment_date === newDate &&
        a.doctor_id === newDoctorId &&
        a.start_time.slice(0, 5) < newEndTime &&
        a.end_time.slice(0, 5) > newTime
    );
    if (doctorConflict) return "El doctor ya tiene una cita en ese horario";

    return null;
  }, [newDate, newTime, newEndTime, newOfficeId, newDoctorId, existingAppointments, appointment.id]);

  const handleSave = async () => {
    if (conflict) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: newDate,
        start_time: newTime,
        end_time: newEndTime,
        office_id: newOfficeId,
        doctor_id: newDoctorId,
      })
      .eq("id", appointment.id);

    setSaving(false);
    if (error) {
      toast.error("Error al reprogramar: " + error.message);
      return;
    }
    toast.success("Cita reprogramada correctamente");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Reprogramar Cita</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Current appointment info */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Cita actual:</p>
            <p>{appointment.patient_name} — {appointment.services?.name}</p>
            <p>{appointment.appointment_date} · {appointment.start_time.slice(0, 5)} – {appointment.end_time.slice(0, 5)}</p>
            <p>{appointment.offices?.name} · {appointment.doctors?.full_name}</p>
          </div>

          {/* Conflict warning */}
          {conflict && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              ⚠ {conflict}
            </div>
          )}

          {/* New date */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays className="h-4 w-4" /> Nueva fecha *
            </label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* New time */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4" /> Nueva hora *
            </label>
            <div className="flex gap-2">
              <select
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="flex items-center px-3 py-2 rounded-lg border border-input bg-muted text-sm text-muted-foreground min-w-[80px]">
                → {newEndTime}
              </div>
            </div>
          </div>

          {/* Office */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Consultorio *</label>
            <select
              value={newOfficeId}
              onChange={(e) => setNewOfficeId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            >
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Doctor */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Doctor *</label>
            <select
              value={newDoctorId}
              onChange={(e) => setNewDoctorId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!conflict}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <RefreshCw className="h-4 w-4" />
            Reprogramar
          </button>
        </div>
      </div>
    </div>
  );
}
