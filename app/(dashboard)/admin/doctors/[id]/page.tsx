"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
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
  Stethoscope,
  Video,
} from "lucide-react";
import { ZoomIcon } from "@/components/icons/zoom-icon";
import { SpecialtiesTab } from "./specialties-tab";

type Tab = "profile" | "services" | "schedule" | "specialties";

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
  const [authorizedOfficeIds, setAuthorizedOfficeIds] = useState<Set<string>>(new Set());
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchAll = async () => {
    const supabase = createClient();
    const [
      doctorRes,
      servicesRes,
      doctorServicesRes,
      schedulesRes,
      officesRes,
      doctorOfficesRes,
    ] = await Promise.all([
      supabase.from("doctors").select("*").eq("id", id).single(),
      supabase.from("services").select("*, service_categories(id, name)").eq("is_active", true).order("display_order"),
      supabase.from("doctor_services").select("service_id").eq("doctor_id", id),
      supabase.from("doctor_schedules").select("*").eq("doctor_id", id).order("day_of_week").order("start_time"),
      supabase.from("offices").select("*").eq("is_active", true).order("display_order"),
      supabase.from("doctor_offices").select("office_id").eq("doctor_id", id),
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
    setAuthorizedOfficeIds(
      new Set(
        ((doctorOfficesRes.data ?? []) as { office_id: string }[]).map((r) => r.office_id)
      )
    );
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
    { key: "specialties", label: "Especialidades", icon: Stethoscope },
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
        <ProfileTab doctor={doctor} offices={offices} onSave={fetchAll} />
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
          authorizedOfficeIds={authorizedOfficeIds}
          onUpdate={fetchAll}
        />
      )}

      {/* Specialties Tab */}
      {activeTab === "specialties" && <SpecialtiesTab doctorId={doctor.id} />}
    </div>
  );
}

// ==================== Profile Tab ====================
function ProfileTab({
  doctor,
  offices,
  onSave,
}: {
  doctor: Doctor;
  offices: Office[];
  onSave: () => void;
}) {
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
      specialty: (doctor as { specialty?: string | null }).specialty ?? "",
      color: doctor.color,
      default_meeting_url: (doctor as { default_meeting_url?: string | null }).default_meeting_url ?? "",
      default_office_id: (doctor as { default_office_id?: string | null }).default_office_id ?? "",
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
        specialty: values.specialty || null,
        color: values.color,
        default_meeting_url: values.default_meeting_url || null,
        default_office_id: values.default_office_id || null,
        is_active: values.is_active,
      })
      .eq("id", doctor.id);

    setSaving(false);
    if (error) {
      toast.error(t("doctors.save_error") + ": " + error.message);
      return;
    }

    // Reverse sync: update user_profiles.full_name if name changed
    // (DB trigger also handles this, but explicit update as redundancy)
    if (doctor.user_id && values.full_name !== doctor.full_name) {
      await supabase
        .from("user_profiles")
        .update({ full_name: values.full_name })
        .eq("id", doctor.user_id);
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Especialidad</label>
            <input
              {...register("specialty")}
              placeholder="Ginecología, Pediatría, Cardiología..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            {errors.specialty && (
              <p className="text-xs text-destructive">{errors.specialty.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Visible en el portal del paciente y en la reserva pública.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Consultorio por defecto</label>
            <select
              {...register("default_office_id")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            >
              <option value="">— Sin preferencia —</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Se usa automáticamente en las reservas desde /book. Si no eliges uno, se usa el primero disponible.
            </p>
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

        {/* Zoom / Meeting URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <ZoomIcon className="h-4 w-4" />
            Link de Zoom (Teleconsulta)
          </label>
          <input
            {...register("default_meeting_url")}
            type="url"
            placeholder="https://zoom.us/j/1234567890"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
          {errors.default_meeting_url && (
            <p className="text-xs text-destructive">{errors.default_meeting_url.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Link fijo de Zoom o Google Meet del doctor. Se usará automáticamente en citas virtuales.
          </p>
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
  const { organizationId } = useOrganization();
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
    if (!organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    // Delete all existing assignments
    await supabase.from("doctor_services").delete().eq("doctor_id", doctorId);

    // Insert new assignments
    if (selected.size > 0) {
      const inserts = Array.from(selected).map((service_id) => ({
        doctor_id: doctorId,
        service_id,
        organization_id: organizationId,
      }));
      const { error } = await supabase.from("doctor_services").insert(inserts);
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
  authorizedOfficeIds,
  onUpdate,
}: {
  doctorId: string;
  schedules: DoctorSchedule[];
  offices: Office[];
  authorizedOfficeIds: Set<string>;
  onUpdate: () => void;
}) {
  const { t } = useLanguage();
  const { organizationId } = useOrganization();
  const [blocks, setBlocks] = useState(
    schedules.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      office_id: s.office_id ?? "",
    }))
  );
  // Local copy of the doctor's authorized offices. Empty set → "all offices".
  const [authorized, setAuthorized] = useState<Set<string>>(new Set(authorizedOfficeIds));
  const [saving, setSaving] = useState(false);

  const toggleAuthorized = (officeId: string) => {
    setAuthorized((prev) => {
      const next = new Set(prev);
      if (next.has(officeId)) next.delete(officeId);
      else next.add(officeId);
      return next;
    });
  };
  const clearAuthorized = () => setAuthorized(new Set());

  // Offices the user can pick per-block. If the doctor has authorized offices,
  // we restrict the per-block dropdown to that subset.
  const officesAvailableForBlocks =
    authorized.size > 0 ? offices.filter((o) => authorized.has(o.id)) : offices;

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

  // Indices of blocks that share (day_of_week, start_time) with another block —
  // visualized with a red ring and surfaced in the save error.
  const duplicateIndices = (() => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    blocks.forEach((b, i) => {
      const key = `${b.day_of_week}|${b.start_time}`;
      const prev = seen.get(key);
      if (prev !== undefined) {
        dupes.add(prev);
        dupes.add(i);
      } else {
        seen.set(key, i);
      }
    });
    return dupes;
  })();

  // Blocks where end_time <= start_time (would violate the DB CHECK constraint).
  const invalidRangeIndices = (() => {
    const bad = new Set<number>();
    blocks.forEach((b, i) => {
      if (b.start_time && b.end_time && b.end_time <= b.start_time) bad.add(i);
    });
    return bad;
  })();

  const handleSave = async () => {
    if (!organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }

    // Frontend guard: the DB has UNIQUE(doctor_id, day_of_week, start_time)
    // and CHECK(end_time > start_time). Catch both before issuing a destructive
    // delete + failed insert, which previously left the doctor with NO
    // schedule rows on conflict.
    if (duplicateIndices.size > 0) {
      const samples = Array.from(duplicateIndices)
        .slice(0, 3)
        .map((i) => {
          const b = blocks[i];
          const day = DAYS_OF_WEEK.find((d) => d.value === b.day_of_week)?.label ?? "?";
          return `${day} ${b.start_time}`;
        });
      toast.error(
        `Hay bloques duplicados (mismo día y hora de inicio): ${samples.join(", ")}. Cambia la hora de inicio o elimina uno.`
      );
      return;
    }
    if (invalidRangeIndices.size > 0) {
      toast.error("Hay bloques donde la hora de fin es menor o igual a la de inicio.");
      return;
    }

    // Per-block office must be in the authorized set if the doctor has one.
    if (authorized.size > 0) {
      const offending = blocks.findIndex(
        (b) => b.office_id && !authorized.has(b.office_id)
      );
      if (offending >= 0) {
        const offName = offices.find((o) => o.id === blocks[offending].office_id)?.name ?? "?";
        toast.error(
          `El bloque #${offending + 1} usa "${offName}" que no está en los consultorios autorizados del doctor.`
        );
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();

    // Snapshot existing schedules and authorized offices so we can restore on
    // partial failure. Without this, a failed insert after the delete leaves
    // the doctor with zero rows — the bug the user reported.
    const [{ data: previousSchedules }, { data: previousOffices }] = await Promise.all([
      supabase
        .from("doctor_schedules")
        .select("doctor_id, day_of_week, start_time, end_time, office_id, organization_id")
        .eq("doctor_id", doctorId),
      supabase
        .from("doctor_offices")
        .select("doctor_id, office_id, organization_id")
        .eq("doctor_id", doctorId),
    ]);

    // 1. Replace doctor_offices (authorized list).
    const { error: doDeleteError } = await supabase
      .from("doctor_offices")
      .delete()
      .eq("doctor_id", doctorId);
    if (doDeleteError) {
      toast.error(t("doctors.save_error") + ": " + doDeleteError.message);
      setSaving(false);
      return;
    }
    if (authorized.size > 0) {
      const offInserts = Array.from(authorized).map((office_id) => ({
        doctor_id: doctorId,
        office_id,
        organization_id: organizationId,
      }));
      const { error: offError } = await supabase.from("doctor_offices").insert(offInserts);
      if (offError) {
        // Restore prior list best-effort.
        if (previousOffices && previousOffices.length > 0) {
          await supabase.from("doctor_offices").insert(previousOffices);
        }
        toast.error(t("doctors.save_error") + ": " + offError.message);
        setSaving(false);
        return;
      }
    }

    // 2. Replace doctor_schedules.
    const { error: deleteError } = await supabase
      .from("doctor_schedules")
      .delete()
      .eq("doctor_id", doctorId);
    if (deleteError) {
      toast.error(t("doctors.save_error") + ": " + deleteError.message);
      setSaving(false);
      return;
    }

    if (blocks.length > 0) {
      const inserts = blocks.map((b) => ({
        doctor_id: doctorId,
        day_of_week: b.day_of_week,
        start_time: b.start_time,
        end_time: b.end_time,
        office_id: b.office_id || null,
        organization_id: organizationId,
      }));
      const { error } = await supabase.from("doctor_schedules").insert(inserts);
      if (error) {
        let restoreNote = "";
        if (previousSchedules && previousSchedules.length > 0) {
          const { error: restoreError } = await supabase
            .from("doctor_schedules")
            .insert(previousSchedules);
          restoreNote = restoreError
            ? " (atención: no se pudo restaurar el horario anterior)"
            : " (se restauró el horario anterior)";
        }
        toast.error(t("doctors.save_error") + ": " + error.message + restoreNote);
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
      {/* Authorized offices — global per doctor. Empty = all offices. */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Consultorios autorizados</h3>
            <p className="text-sm text-muted-foreground">
              Marca los consultorios donde este doctor puede atender. Si no marcas ninguno, podrá usar cualquier consultorio.
            </p>
          </div>
          {authorized.size > 0 && (
            <button
              type="button"
              onClick={clearAuthorized}
              className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Permitir todos
            </button>
          )}
        </div>

        {offices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay consultorios activos en la organización.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {offices.map((o) => {
                const checked = authorized.has(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 cursor-pointer transition-colors",
                      checked
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAuthorized(o.id)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="text-sm font-medium">{o.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {authorized.size === 0
                ? `Acceso completo: el doctor puede atender en cualquiera de los ${offices.length} consultorios.`
                : `Restringido a ${authorized.size} de ${offices.length} consultorios.`}
            </p>
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t("doctors.schedule_title")}</h3>
            <p className="text-sm text-muted-foreground">{t("doctors.schedule_desc")}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Selecciona un consultorio específico por bloque para limitarlo a ese turno, o deja &quot;Todos los consultorios autorizados&quot; para usar cualquiera de los marcados arriba.
            </p>
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
          {blocks.map((block, index) => {
            const isDuplicate = duplicateIndices.has(index);
            const isInvalidRange = invalidRangeIndices.has(index);
            const hasIssue = isDuplicate || isInvalidRange;
            return (
            <div
              key={block.id}
              className={cn(
                "flex flex-wrap items-end gap-3 rounded-lg border bg-background p-3",
                hasIssue
                  ? "border-red-500/60 ring-2 ring-red-500/20"
                  : "border-border"
              )}
            >
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("schedule.day")}
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
                  className={cn(
                    "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50",
                    block.office_id ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <option value="">
                    {authorized.size > 0
                      ? `Todos los autorizados (${authorized.size})`
                      : "Todos los consultorios"}
                  </option>
                  {officesAvailableForBlocks.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  {/* Surface a stale value (block points to an office not in
                       the authorized list) so the user can see and fix it. */}
                  {block.office_id &&
                    !officesAvailableForBlocks.some((o) => o.id === block.office_id) && (
                      <option value={block.office_id}>
                        {offices.find((o) => o.id === block.office_id)?.name ?? "?"} (no autorizado)
                      </option>
                    )}
                </select>
              </div>
              <button
                onClick={() => removeBlock(index)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {hasIssue && (
                <p className="basis-full text-xs font-medium text-red-600 dark:text-red-400">
                  {isDuplicate
                    ? "⚠ Duplicado: ya existe otro bloque con el mismo día y hora de inicio."
                    : "⚠ La hora de fin debe ser mayor que la hora de inicio."}
                </p>
              )}
            </div>
            );
          })}
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
