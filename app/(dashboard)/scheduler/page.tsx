"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { format, addDays, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";
import type {
  AppointmentWithRelations,
  Office,
  Doctor,
  Service,
  LookupValue,
} from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import { SchedulerHeader } from "./scheduler-header";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { AppointmentSidebar } from "./appointment-sidebar";
import { AppointmentFormModal } from "./appointment-form-modal";

export type ViewMode = "day" | "week";

export default function SchedulerPage() {
  const { t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [lookupOrigins, setLookupOrigins] = useState<LookupValue[]>([]);
  const [lookupPayments, setLookupPayments] = useState<LookupValue[]>([]);
  const [lookupResponsibles, setLookupResponsibles] = useState<LookupValue[]>([]);
  const [loading, setLoading] = useState(true);

  // Sidebar & form state
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDefaults, setFormDefaults] = useState<{
    date?: string;
    startTime?: string;
    officeId?: string;
  } | null>(null);

  // Fetch master data once
  useEffect(() => {
    const fetchMasterData = async () => {
      const supabase = createClient();
      const [officesRes, doctorsRes, servicesRes, originsRes, paymentsRes, responsiblesRes] =
        await Promise.all([
          supabase.from("offices").select("*").eq("is_active", true).order("display_order"),
          supabase.from("doctors").select("*").eq("is_active", true).order("full_name"),
          supabase.from("services").select("*").eq("is_active", true).order("name"),
          supabase
            .from("lookup_values")
            .select("*, lookup_categories!inner(slug)")
            .eq("lookup_categories.slug", "origin")
            .eq("is_active", true)
            .order("display_order"),
          supabase
            .from("lookup_values")
            .select("*, lookup_categories!inner(slug)")
            .eq("lookup_categories.slug", "payment_method")
            .eq("is_active", true)
            .order("display_order"),
          supabase
            .from("lookup_values")
            .select("*, lookup_categories!inner(slug)")
            .eq("lookup_categories.slug", "responsible")
            .eq("is_active", true)
            .order("display_order"),
        ]);

      setOffices(officesRes.data ?? []);
      setDoctors(doctorsRes.data ?? []);
      setServices(servicesRes.data ?? []);
      setLookupOrigins((originsRes.data as LookupValue[]) ?? []);
      setLookupPayments((paymentsRes.data as LookupValue[]) ?? []);
      setLookupResponsibles((responsiblesRes.data as LookupValue[]) ?? []);
    };

    fetchMasterData();
  }, []);

  // Fetch appointments for the relevant date range
  const fetchAppointments = useCallback(async () => {
    const supabase = createClient();
    let startDate: string;
    let endDate: string;

    if (viewMode === "day") {
      startDate = format(currentDate, "yyyy-MM-dd");
      endDate = startDate;
    } else {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      startDate = format(weekStart, "yyyy-MM-dd");
      endDate = format(addDays(weekStart, 6), "yyyy-MM-dd");
    }

    const { data } = await supabase
      .from("appointments")
      .select("*, doctors(*), offices(*), services(*)")
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .neq("status", "cancelled")
      .order("start_time");

    setAppointments((data as AppointmentWithRelations[]) ?? []);
    setLoading(false);
  }, [currentDate, viewMode]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleSlotClick = (date: Date, time: string, officeId: string) => {
    setFormDefaults({
      date: format(date, "yyyy-MM-dd"),
      startTime: time,
      officeId,
    });
    setShowForm(true);
    setSelectedAppointment(null);
  };

  const handleAppointmentClick = (appointment: AppointmentWithRelations) => {
    setSelectedAppointment(appointment);
    setShowForm(false);
  };

  const handleCloseSidebar = () => {
    setSelectedAppointment(null);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setFormDefaults(null);
  };

  const handleSaved = () => {
    fetchAppointments();
    setShowForm(false);
    setFormDefaults(null);
    setSelectedAppointment(null);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <SchedulerHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onDateChange={setCurrentDate}
        onViewModeChange={setViewMode}
        onNewAppointment={() => {
          setFormDefaults({
            date: format(currentDate, "yyyy-MM-dd"),
          });
          setShowForm(true);
        }}
        appointments={appointments}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {viewMode === "day" ? (
            <DayView
              date={currentDate}
              appointments={appointments}
              offices={offices}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
            />
          ) : (
            <WeekView
              currentDate={currentDate}
              appointments={appointments}
              offices={offices}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
        </div>

        {/* Sidebar de detalles */}
        {selectedAppointment && (
          <AppointmentSidebar
            appointment={selectedAppointment}
            onClose={handleCloseSidebar}
            onUpdate={handleSaved}
          />
        )}
      </div>

      {/* Modal de creación */}
      {showForm && (
        <AppointmentFormModal
          defaults={formDefaults}
          offices={offices}
          doctors={doctors}
          services={services}
          lookupOrigins={lookupOrigins}
          lookupPayments={lookupPayments}
          lookupResponsibles={lookupResponsibles}
          existingAppointments={appointments}
          onClose={handleFormClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
