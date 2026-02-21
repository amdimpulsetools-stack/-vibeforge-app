"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useUserProfile } from "@/hooks/use-user-profile";
import { toast } from "sonner";
import type { AppointmentWithRelations, Doctor, Service, LookupValue } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import {
  X,
  User,
  Phone,
  Stethoscope,
  Building2,
  ClipboardList,
  Clock,
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  RefreshCw,
  Pencil,
  Save,
} from "lucide-react";

interface AppointmentSidebarProps {
  appointment: AppointmentWithRelations;
  onClose: () => void;
  onUpdate: () => void;
  onReschedule?: () => void;
  doctors?: Doctor[];
  services?: Service[];
  lookupOrigins?: LookupValue[];
  lookupPayments?: LookupValue[];
  lookupResponsibles?: LookupValue[];
}

const STATUS_ICONS = {
  scheduled: AlertCircle,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
};

export function AppointmentSidebar({
  appointment,
  onClose,
  onUpdate,
  onReschedule,
  doctors = [],
  services = [],
  lookupOrigins = [],
  lookupPayments = [],
  lookupResponsibles = [],
}: AppointmentSidebarProps) {
  const { t } = useLanguage();
  const { profile } = useUserProfile();
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);

  // Edit form state
  const [editDoctor, setEditDoctor] = useState(appointment.doctor_id);
  const [editService, setEditService] = useState(appointment.service_id);
  const [editOrigin, setEditOrigin] = useState(appointment.origin ?? "");
  const [editPayment, setEditPayment] = useState(appointment.payment_method ?? "");
  const [editResponsible, setEditResponsible] = useState(appointment.responsible ?? "");
  const [editNotes, setEditNotes] = useState(appointment.notes ?? "");

  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status] ?? "#9ca3af";
  const StatusIcon = STATUS_ICONS[appointment.status] ?? AlertCircle;

  const selectedService = useMemo(
    () => services.find((s) => s.id === editService),
    [services, editService]
  );

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({ status: newStatus })
      .eq("id", appointment.id);

    setUpdating(false);
    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }
    toast.success(t("scheduler.save_success"));
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm(t("scheduler.delete_confirm"))) return;
    setUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    setUpdating(false);
    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }
    toast.success(t("scheduler.delete_success"));
    onUpdate();
  };

  const handleStartEdit = () => {
    setEditDoctor(appointment.doctor_id);
    setEditService(appointment.service_id);
    setEditOrigin(appointment.origin ?? "");
    setEditPayment(appointment.payment_method ?? "");
    setEditResponsible(appointment.responsible ?? "");
    setEditNotes(appointment.notes ?? "");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    setUpdating(true);
    const supabase = createClient();

    // Recalculate end_time if service changed
    let newEndTime = appointment.end_time;
    if (editService !== appointment.service_id && selectedService) {
      const [h, m] = appointment.start_time.slice(0, 5).split(":").map(Number);
      const totalMin = h * 60 + m + selectedService.duration_minutes;
      newEndTime = `${Math.floor(totalMin / 60).toString().padStart(2, "0")}:${(totalMin % 60).toString().padStart(2, "0")}`;
    }

    const userName = profile?.full_name || "Usuario";

    const { error } = await supabase
      .from("appointments")
      .update({
        doctor_id: editDoctor,
        service_id: editService,
        end_time: newEndTime,
        origin: editOrigin || null,
        payment_method: editPayment || null,
        responsible: editResponsible || null,
        notes: editNotes || null,
        edited_by_name: userName,
        edited_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    setUpdating(false);

    if (error) {
      toast.error(t("scheduler.save_error"));
      return;
    }

    toast.success(t("scheduler.save_success"));
    setEditing(false);
    onUpdate();
  };

  const selectClass =
    "w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{t("scheduler.details")}</h3>
        <div className="flex items-center gap-1">
          {/* Edit toggle */}
          {appointment.status !== "cancelled" && !editing && (
            <button
              onClick={handleStartEdit}
              className="rounded-lg p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              title={t("common.edit")}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <StatusIcon className="h-4 w-4" style={{ color: statusColor }} />
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: statusColor + "20",
              color: statusColor,
            }}
          >
            {t(`scheduler.status_${appointment.status}`)}
          </span>
          {editing && (
            <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {t("scheduler.editing")}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3">
          {/* Patient info — always read-only */}
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{appointment.patient_name}</p>
              {appointment.patient_phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {appointment.patient_phone}
                </p>
              )}
            </div>
          </div>

          {/* Date & Time — read-only (use Reprogramar for these) */}
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.appointment_date}</p>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">
              {appointment.start_time.slice(0, 5)} — {appointment.end_time.slice(0, 5)}
            </p>
          </div>

          {/* Doctor — editable */}
          <div className="flex items-center gap-3">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            {editing && doctors.length > 0 ? (
              <select
                value={editDoctor}
                onChange={(e) => setEditDoctor(e.target.value)}
                className={selectClass}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: appointment.doctors?.color }}
                />
                <p className="text-sm">{appointment.doctors?.full_name}</p>
              </div>
            )}
          </div>

          {/* Office — read-only (use Reprogramar) */}
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.offices?.name}</p>
          </div>

          {/* Service — editable */}
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            {editing && services.length > 0 ? (
              <select
                value={editService}
                onChange={(e) => setEditService(e.target.value)}
                className={selectClass}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — S/. {Number(s.base_price).toFixed(2)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm">{appointment.services?.name}</p>
            )}
          </div>

          {/* Notes — editable */}
          {editing ? (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-1.5" />
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                placeholder={t("scheduler.notes")}
              />
            </div>
          ) : (
            appointment.notes && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-sm text-muted-foreground">{appointment.notes}</p>
              </div>
            )
          )}

          {/* Origin / Payment / Responsible — editable */}
          {editing ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-muted-foreground">{t("scheduler.origin")}</label>
                <select
                  value={editOrigin}
                  onChange={(e) => setEditOrigin(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {lookupOrigins.map((o) => (
                    <option key={o.id} value={o.label}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-medium text-muted-foreground">{t("scheduler.payment_method")}</label>
                <select
                  value={editPayment}
                  onChange={(e) => setEditPayment(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {lookupPayments.map((p) => (
                    <option key={p.id} value={p.label}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-medium text-muted-foreground">{t("scheduler.responsible")}</label>
                <select
                  value={editResponsible}
                  onChange={(e) => setEditResponsible(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {lookupResponsibles.map((r) => (
                    <option key={r.id} value={r.label}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            (appointment.origin || appointment.payment_method || appointment.responsible) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs text-muted-foreground">
                {appointment.origin && (
                  <p>{t("scheduler.origin")}: <span className="text-foreground">{appointment.origin}</span></p>
                )}
                {appointment.payment_method && (
                  <p>{t("scheduler.payment_method")}: <span className="text-foreground">{appointment.payment_method}</span></p>
                )}
                {appointment.responsible && (
                  <p>{t("scheduler.responsible")}: <span className="text-foreground">{appointment.responsible}</span></p>
                )}
              </div>
            )
          )}
        </div>

        {/* Edit action buttons */}
        {editing && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <button
              onClick={handleCancelEdit}
              disabled={updating}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updating}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>
        )}

        {/* Action buttons — hidden while editing */}
        {!editing && (
          <div className="space-y-2 pt-2 border-t border-border">
            {/* Reschedule — always shown for non-cancelled */}
            {appointment.status !== "cancelled" && onReschedule && (
              <button
                onClick={onReschedule}
                disabled={updating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reprogramar
              </button>
            )}

            {appointment.status !== "cancelled" && (
              <>
                {appointment.status === "scheduled" && (
                  <button
                    onClick={() => updateStatus("confirmed")}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {t("scheduler.confirm")}
                  </button>
                )}
                {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                  <button
                    onClick={() => updateStatus("completed")}
                    disabled={updating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {t("scheduler.complete")}
                  </button>
                )}
                <button
                  onClick={() => updateStatus("cancelled")}
                  disabled={updating}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  {t("scheduler.cancel_appointment")}
                </button>
              </>
            )}
          </div>
        )}

        {/* Audit log — read-only */}
        {appointment.edited_by_name && appointment.edited_at && (
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              {appointment.edited_by_name} {t("scheduler.edited_label")}{" "}
              {new Date(appointment.edited_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true })}
              {" - "}
              {new Date(appointment.edited_at).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
