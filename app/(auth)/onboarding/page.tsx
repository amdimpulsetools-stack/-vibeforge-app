"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Zap, LogOut, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import {
  StepWelcome,
  StepPersonal,
  StepClinic,
  StepHours,
  StepService,
} from "./steps";
import { COUNTRIES, TOTAL_STEPS, type Specialty, type WizardState } from "./types";

const INITIAL_STATE: WizardState = {
  fullName: "",
  phone: "",
  country: COUNTRIES[0],
  selectedSpecialty: null,
  clinicName: "",
  clinicPhone: "",
  clinicEmail: "",
  startHour: 8,
  endHour: 20,
  interval: 15,
  activeDays: [1, 2, 3, 4, 5], // L-V by default
  serviceName: "",
  serviceDuration: 30,
  servicePrice: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patchState = (patch: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // ── Auth + prefill ────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/register");
        return;
      }
      setUserEmail(user.email ?? null);

      // Already onboarded? Skip to select-plan.
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (membership) {
        const { data: org } = await supabase
          .from("organizations")
          .select("onboarding_completed_at, name")
          .eq("id", membership.organization_id)
          .single();
        if (org?.onboarding_completed_at) {
          router.push("/select-plan");
          return;
        }
        if (org?.name) patchState({ clinicName: org.name });
      }

      const metaName = user.user_metadata?.full_name;
      if (metaName) patchState({ fullName: metaName });
      if (user.email) patchState({ clinicEmail: user.email });

      // Fetch specialties
      const { data: specs } = await supabase
        .from("specialties")
        .select("id, name, slug, description")
        .eq("is_active", true)
        .order("sort_order");
      if (specs) setSpecialties(specs);

      setCheckingAuth(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-step validation ────────────────────────────────────────
  const canAdvance = (() => {
    if (step === 1) {
      return state.fullName.trim().length > 0
        && state.phone.trim().length >= 6
        && state.selectedSpecialty !== null;
    }
    if (step === 2) {
      // Clinic name + phone required; email optional but if given must look like one
      if (state.clinicName.trim().length < 2) return false;
      if (state.clinicPhone.trim().length < 6) return false;
      if (state.clinicEmail && !/^\S+@\S+\.\S+$/.test(state.clinicEmail)) return false;
      return true;
    }
    if (step === 3) {
      return state.activeDays.length > 0 && state.endHour > state.startHour;
    }
    return true; // step 0 + step 4 (service is optional)
  })();

  // ── Save everything + complete ─────────────────────────────────
  const handleFinish = async () => {
    if (!canAdvance) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/register");
        return;
      }

      const fullPhone = `${state.country.dial}${state.phone.replace(/\D/g, "")}`;

      // 1. User profile
      await supabase
        .from("user_profiles")
        .update({
          full_name: state.fullName.trim(),
          whatsapp_phone: fullPhone,
        })
        .eq("id", user.id);

      await supabase.auth.updateUser({ data: { full_name: state.fullName.trim() } });

      // 2. Org + specialty
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!membership) {
        toast.error("No se encontró tu organización");
        setSaving(false);
        return;
      }
      const orgId = membership.organization_id;

      if (state.selectedSpecialty) {
        await supabase
          .from("organizations")
          .update({
            name: state.clinicName.trim(),
            primary_specialty_id: state.selectedSpecialty.id,
          })
          .eq("id", orgId);

        await supabase
          .from("organization_specialties")
          .upsert(
            { organization_id: orgId, specialty_id: state.selectedSpecialty.id },
            { onConflict: "organization_id,specialty_id" }
          );
      } else {
        await supabase
          .from("organizations")
          .update({ name: state.clinicName.trim() })
          .eq("id", orgId);
      }

      // 3. Global variables — clinic_phone, clinic_email
      //    Upsert the two keys independently to avoid trampling unrelated rows.
      if (state.clinicPhone.trim()) {
        await supabase
          .from("global_variables")
          .upsert(
            {
              organization_id: orgId,
              key: "clinic_phone",
              name: "Teléfono de contacto",
              value: state.clinicPhone.trim(),
              description: "Teléfono principal de la clínica",
              sort_order: 2,
            },
            { onConflict: "organization_id,key" }
          );
      }
      if (state.clinicEmail.trim()) {
        await supabase
          .from("global_variables")
          .upsert(
            {
              organization_id: orgId,
              key: "clinic_email",
              name: "Email de contacto",
              value: state.clinicEmail.trim(),
              description: "Email principal de la clínica",
              sort_order: 3,
            },
            { onConflict: "organization_id,key" }
          );
      }

      // 4. Scheduler settings (hours + interval + disabled weekdays)
      const allDays = [0, 1, 2, 3, 4, 5, 6];
      const disabledWeekdays = allDays.filter((d) => !state.activeDays.includes(d));
      await fetch("/api/scheduler-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_hour: state.startHour,
          end_hour: state.endHour,
          intervals: [state.interval],
          disabled_weekdays: disabledWeekdays,
        }),
      });

      // 5. First service (optional) — requires a category. Create "General"
      //    per-org on-demand, then insert the service.
      const serviceName = state.serviceName.trim();
      if (serviceName) {
        let categoryId: string | null = null;
        const { data: existingCat } = await supabase
          .from("service_categories")
          .select("id")
          .eq("organization_id", orgId)
          .eq("name", "General")
          .maybeSingle();

        if (existingCat?.id) {
          categoryId = existingCat.id;
        } else {
          const { data: newCat } = await supabase
            .from("service_categories")
            .insert({
              organization_id: orgId,
              name: "General",
              description: "Categoría por defecto",
              display_order: 0,
            })
            .select("id")
            .single();
          categoryId = newCat?.id ?? null;
        }

        if (categoryId) {
          // duration_minutes must be a multiple of 15 (CHECK constraint).
          const duration = Math.max(15, Math.round(state.serviceDuration / 15) * 15);
          const price = state.servicePrice ? Number(state.servicePrice) : 0;
          await supabase.from("services").insert({
            organization_id: orgId,
            category_id: categoryId,
            name: serviceName,
            duration_minutes: duration,
            base_price: isFinite(price) && price >= 0 ? price : 0,
          });
        }
      }

      // 6. Mark organization onboarding as completed
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Error al finalizar el onboarding");
        setSaving(false);
        return;
      }

      router.push("/select-plan");
    } catch (err) {
      console.error("Onboarding finish error:", err);
      toast.error("Ocurrió un error guardando tu información");
      setSaving(false);
    }
  };

  // ── Skip setup ─────────────────────────────────────────────────
  const handleSkip = async () => {
    if (saving) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Skipping still requires a WhatsApp phone so notifications work.
    // If the user already provided one in step 1 we persist it; otherwise
    // we leave it null and the middleware's has_whatsapp fallback will
    // keep them here — but because we also mark onboarding_completed_at,
    // the new gate lets them through. Skip is an explicit escape hatch.
    if (user && state.phone.trim()) {
      const fullPhone = `${state.country.dial}${state.phone.replace(/\D/g, "")}`;
      await supabase
        .from("user_profiles")
        .update({ whatsapp_phone: fullPhone })
        .eq("id", user.id);
    }

    const res = await fetch("/api/onboarding/complete", { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo omitir la configuración");
      return;
    }
    router.push("/select-plan");
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/register");
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      {/* Top-right Skip setup */}
      <button
        type="button"
        onClick={handleSkip}
        disabled={saving}
        className="absolute right-4 top-4 inline-flex items-center gap-1 text-sm text-rose-500 hover:text-rose-400 disabled:opacity-50"
      >
        Omitir configuración
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Main card */}
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-lg gradient-glow">
            <Zap className="h-6 w-6 text-white" />
          </div>
        </div>

        {/* Progress dots (hidden on welcome) */}
        {step > 0 && (
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${
                  n === step
                    ? "w-8 bg-primary"
                    : n < step
                    ? "w-4 bg-primary/50"
                    : "w-4 bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        {/* Step body */}
        <div className="glass-card rounded-2xl p-7 shadow-xl">
          {step === 0 && <StepWelcome onStart={() => setStep(1)} />}
          {step === 1 && <StepPersonal state={state} specialties={specialties} setState={patchState} />}
          {step === 2 && <StepClinic state={state} setState={patchState} />}
          {step === 3 && <StepHours state={state} setState={patchState} />}
          {step === 4 && <StepService state={state} setState={patchState} />}
        </div>

        {/* Footer navigation */}
        {step > 0 && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || saving}
              className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => canAdvance && setStep((s) => s + 1)}
                disabled={!canAdvance || saving}
                className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Completar y entrar
              </button>
            )}
          </div>
        )}

        {/* Footer: logged-in user */}
        {userEmail && (
          <div className="text-center text-sm text-muted-foreground">
            Ingresaste como{" "}
            <span className="font-medium text-foreground">{userEmail}</span>
            <br />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 mt-1 text-primary hover:underline text-sm"
            >
              ¿No eres tú?
              <LogOut className="h-3 w-3" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
