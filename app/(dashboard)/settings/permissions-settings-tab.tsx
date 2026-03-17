"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { Shield, Users, Loader2 } from "lucide-react";

interface OrgSettings {
  restrict_doctor_patients?: boolean;
}

export default function PermissionsSettingsTab() {
  const { language } = useLanguage();
  const { organizationId, organization, refetchOrg } = useOrganization();
  const [settings, setSettings] = useState<OrgSettings>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (organization) {
      const s = (organization as any).settings as OrgSettings | undefined;
      setSettings(s ?? {});
      setLoaded(true);
    }
  }, [organization]);

  const updateSetting = async (key: keyof OrgSettings, value: boolean) => {
    if (!organizationId) return;

    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ settings: next } as any)
      .eq("id", organizationId);

    setSaving(false);

    if (error) {
      setSettings(settings);
      toast.error(
        language === "es"
          ? "Error al guardar configuración"
          : "Error saving setting"
      );
      return;
    }

    refetchOrg();
    toast.success(
      language === "es"
        ? "Configuración guardada"
        : "Setting saved"
    );
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Section header */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {language === "es" ? "Permisos de roles" : "Role permissions"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {language === "es"
                ? "Controla qué pueden ver y hacer los distintos roles en tu organización"
                : "Control what different roles can see and do in your organization"}
            </p>
          </div>
        </div>

        {/* Toggle: restrict doctor patients */}
        <div className="rounded-xl border border-border/60 p-4">
          <label className="flex items-start justify-between gap-4 select-none cursor-pointer">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 mt-0.5">
                <Users className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {language === "es"
                    ? "Restringir pacientes por doctor"
                    : "Restrict patients by doctor"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  {language === "es"
                    ? "Cuando está activo, los doctores solo pueden ver pacientes con los que han tenido al menos una cita. Los administradores y recepcionistas siguen viendo todos los pacientes."
                    : "When active, doctors can only see patients they have had at least one appointment with. Admins and receptionists still see all patients."}
                </p>
              </div>
            </div>
            <div className="relative shrink-0 mt-1">
              <input
                type="checkbox"
                checked={settings.restrict_doctor_patients ?? false}
                onChange={(e) =>
                  updateSetting("restrict_doctor_patients", e.target.checked)
                }
                disabled={saving}
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
