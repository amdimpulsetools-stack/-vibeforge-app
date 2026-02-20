"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { doctorSchema, type DoctorFormData } from "@/lib/validations/doctor";
import { DOCTOR_COLORS, DAYS_OF_WEEK } from "@/types/admin";
import type { Doctor, Service, ServiceCategory, DoctorSchedule, Office } from "@/types/admin";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  Check,
  Plus,
  Trash2,
  User,
  ClipboardList,
  Clock,
} from "lucide-react";

type Tab = "profile" | "services" | "schedule";

export default function EditDoctorPage() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Services data
  const [allServices, setAllServices] = useState<(Service & { service_categories: ServiceCategory })[]>([]);
  const [assignedServiceIds, setAssignedServiceIds] = useState<Set<string>>(new Set());
  const [savingServices, setSavingServices] = useState(false);

  // Schedule data
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchAll = async () => {
    const supabase = createClient();
    const [doctorRes, servicesRes, doctorServicesRes, schedulesRes, officesRes] =
      await Promise.all([
        supabase.from("doctors").select("*").eq("id", id).single(),
        supabase.from("services").select("*, service_categories(*)").eq("is_active", true).order("display_order"),
        supabase.from("doctor_services").select("service_id").eq("doctor_id", id),
        supabase.from("doctor_schedules").select("*").eq("doctor_id", id).order("day_of_week").order("start_time"),
        supabase.from("offices").select("*").eq("is_active", true).order("display_order"),
      ]);

    if (!doctorRes.data) {
      router.push("/admin/doctors");
      return;
    }

    setDoctor(doctorRes.data);
    setAllServices((servicesRes.data as typeof allServices) ?? []);
    setAssignedServiceIds(
      new Set((doctorServicesRes.data ?? []).map((ds) => ds.service_id))
    );
    setSchedules(schedulesRes.data ?? []);
    setOffices(officesRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [id]);

  if (loading || !doctor) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: "profile", label: t("doctors.profile_tab"), icon: User },
    { key: "services", label: t("doctors.services_tab"), icon: ClipboardList },
    { key: "schedule", label: t("doctors.schedule_tab"), icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/doctors"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: doctor.color }}
          >
            {doctor.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{doctor.full_name}</h1>
            <p className="text-muted-foreground">CMP: {doctor.cmp}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <ProfileTab doctor={doctor} onSave={fetchAll} />
      )}

      {/* Services Tab */}
      {activeTab === "services" && (
        <ServicesTab
          doctorId={doctor.id}
          allServices={allServices}
          assignedServiceIds={assignedServiceIds}
          onUpdate={fetchAll}
        />
      )}

      {/* Schedule Tab */}
      {activeTab === "schedule" && (
        <ScheduleTab
          doctorId={doctor.id}
          schedules={schedules}
          offices={offices}
          onUpdate={fetchAll}
        />
      )}
    </div>
  );
}

// ==================== Profile Tab ====================
function ProfileTab({ doctor, onSave }: { doctor: Doctor; onSave: () => void }) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DoctorFormData>({
    resolver: zodResolver(doctorSchema),
    defaultValues: {
      full_name: doctor.full_name,
      cmp: doctor.cmp,
      color: doctor.color,
      is_active: doctor.is_active,
    },
  });

  const selectedColor = watch("color");

  const onSubmit = async (values: DoctorFormData) => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("doctors")
      .update({
        full_name: values.full_name,
        cmp: values.cmp,
        color: values.color,
        is_active: values.is_active,
      })
      .eq("id", doctor.id);

    setSaving(false);
    if (error) {
      toast.error(t("doctors.save_error"));
      return;
    }
    toast.success(t("doctors.save_success"));
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("doctors.name")}</label>
            <input
              {...register("full_name")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">{errors.full_name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("doctors.cmp")}</label>
            <input
              {...register("cmp")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            {errors.cmp && (
              <p className="text-xs text-destructive">{errors.cmp.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("doctors.color")}</label>
          <div className="flex flex-wrap gap-2">
            {DOCTOR_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setValue("color", c.value)}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-all",
                  selectedColor === c.value
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_active")} className="rounded" />
          {t("doctors.active")}
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {t("common.save")}
      </button>
    </form>
  );
}

// ==================== Services Tab (Matrix) ====================
function ServicesTab({
  doctorId,
  allServices,
  assignedServiceIds,
  onUpdate,
}: {
  doctorId: string;
  allServices: (Service & { service_categories: ServiceCategory })[];
  assignedServiceIds: Set<string>;
  onUpdate: () => void;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedServiceIds));
  const [saving, setSaving] = useState(false);

  const toggleService = (serviceId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    // Delete all existing assignments
    await supabase.from("doctor_services").delete().eq("doctor_id", doctorId);

    // Insert new assignments
    if (selected.size > 0) {
      const inserts = Array.from(selected).map((service_id) => ({
        doctor_id: doctorId,
        service_id,
      }));
      const { error } = await supabase.from("doctor_services").insert(inserts);
      if (error) {
        toast.error(t("doctors.save_error"));
        setSaving(false);
        return;
      }
    }

    toast.success(t("doctors.save_success"));
    setSaving(false);
    onUpdate();
  };

  // Group by category
  const categories = new Map<string, { name: string; services: typeof allServices }>();
  allServices.forEach((s) => {
    const catName = s.service_categories?.name ?? "Sin categoría";
    const catId = s.category_id;
    if (!categories.has(catId)) {
      categories.set(catId, { name: catName, services: [] });
    }
    categories.get(catId)!.services.push(s);
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t("doctors.service_matrix")}</h3>
          <p className="text-sm text-muted-foreground">{t("doctors.service_matrix_desc")}</p>
        </div>

        {Array.from(categories.entries()).map(([catId, { name, services }]) => (
          <div key={catId} className="space-y-2">
            <h4 className="text-sm font-semibold text-primary">{name}</h4>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <label
                  key={service.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    selected.has(service.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(service.id)}
                    onChange={() => toggleService(service.id)}
                    className="rounded"
                  />
                  <div>
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {service.duration_minutes} {t("common.minutes_short")}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}

        {allServices.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("services.no_services")}</p>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {t("common.save")} ({selected.size} {t("doctors.services_tab").toLowerCase()})
      </button>
    </div>
  );
}

// ==================== Schedule Tab ====================
function ScheduleTab({
  doctorId,
  schedules,
  offices,
  onUpdate,
}: {
  doctorId: string;
  schedules: DoctorSchedule[];
  offices: Office[];
  onUpdate: () => void;
}) {
  const { t } = useLanguage();
  const [blocks, setBlocks] = useState(
    schedules.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      office_id: s.office_id ?? "",
    }))
  );
  const [saving, setSaving] = useState(false);

  const addBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        day_of_week: 1,
        start_time: "08:00",
        end_time: "13:00",
        office_id: offices[0]?.id ?? "",
      },
    ]);
  };

  const removeBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBlock = (index: number, field: string, value: string | number) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    // Delete all existing schedules
    await supabase.from("doctor_schedules").delete().eq("doctor_id", doctorId);

    // Insert new blocks
    if (blocks.length > 0) {
      const inserts = blocks.map((b) => ({
        doctor_id: doctorId,
        day_of_week: b.day_of_week,
        start_time: b.start_time,
        end_time: b.end_time,
        office_id: b.office_id || null,
      }));
      const { error } = await supabase.from("doctor_schedules").insert(inserts);
      if (error) {
        toast.error(t("doctors.save_error") + ": " + error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(t("doctors.save_success"));
    setSaving(false);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t("doctors.schedule_title")}</h3>
            <p className="text-sm text-muted-foreground">{t("doctors.schedule_desc")}</p>
          </div>
          <button
            onClick={addBlock}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            {t("schedule.add_block")}
          </button>
        </div>

        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("common.no_results")}</p>
        )}

        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("schedule.office")}
                </label>
                <select
                  value={block.day_of_week}
                  onChange={(e) =>
                    updateBlock(index, "day_of_week", parseInt(e.target.value))
                  }
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("schedule.start_time")}
                </label>
                <input
                  type="time"
                  value={block.start_time}
                  onChange={(e) => updateBlock(index, "start_time", e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("schedule.end_time")}
                </label>
                <input
                  type="time"
                  value={block.end_time}
                  onChange={(e) => updateBlock(index, "end_time", e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("schedule.office")}
                </label>
                <select
                  value={block.office_id}
                  onChange={(e) => updateBlock(index, "office_id", e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">--</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => removeBlock(index)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {t("common.save")}
      </button>
    </div>
  );
}
