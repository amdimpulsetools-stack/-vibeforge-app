"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@/types/admin";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppointmentSidebarProps {
  appointment: AppointmentWithRelations;
  onClose: () => void;
  onUpdate: () => void;
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
}: AppointmentSidebarProps) {
  const { t } = useLanguage();
  const [updating, setUpdating] = useState(false);

  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status] ?? "#9ca3af";
  const StatusIcon = STATUS_ICONS[appointment.status] ?? AlertCircle;

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

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{t("scheduler.details")}</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
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
        </div>

        {/* Patient */}
        <div className="space-y-3">
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

          {/* Date & Time */}
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

          {/* Doctor */}
          <div className="flex items-center gap-3">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: appointment.doctors?.color }}
              />
              <p className="text-sm">{appointment.doctors?.full_name}</p>
            </div>
          </div>

          {/* Office */}
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.offices?.name}</p>
          </div>

          {/* Service */}
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm">{appointment.services?.name}</p>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">{appointment.notes}</p>
            </div>
          )}

          {/* Origin / Payment / Responsible */}
          {(appointment.origin || appointment.payment_method || appointment.responsible) && (
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
          )}
        </div>

        {/* Action buttons */}
        {appointment.status !== "cancelled" && (
          <div className="space-y-2 pt-2 border-t border-border">
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
          </div>
        )}
      </div>
    </div>
  );
}
