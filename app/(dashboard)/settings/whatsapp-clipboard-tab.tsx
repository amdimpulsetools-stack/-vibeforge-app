"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import { MessageSquare, RotateCcw } from "lucide-react";
import {
  loadWaClipboardConfig,
  saveWaClipboardConfig,
  DEFAULT_WA_TEMPLATE,
  WA_TEMPLATE_VARIABLES,
  buildWhatsAppMessage,
  type WhatsAppClipboardConfig,
} from "@/lib/whatsapp-clipboard-config";

export default function WhatsAppClipboardTab() {
  const { language } = useLanguage();
  const { organization } = useOrganization();

  const [config, setConfig] = useState<WhatsAppClipboardConfig>({
    enabled: false,
    template: DEFAULT_WA_TEMPLATE,
  });

  useEffect(() => {
    setConfig(loadWaClipboardConfig());
  }, []);

  const handleToggle = (enabled: boolean) => {
    const next = { ...config, enabled };
    setConfig(next);
    saveWaClipboardConfig({ enabled });
    toast.success(
      enabled
        ? language === "es"
          ? "Modal de WhatsApp activado"
          : "WhatsApp modal enabled"
        : language === "es"
          ? "Modal de WhatsApp desactivado"
          : "WhatsApp modal disabled"
    );
  };

  const handleTemplateChange = (template: string) => {
    const next = { ...config, template };
    setConfig(next);
    saveWaClipboardConfig({ template });
  };

  const handleResetTemplate = () => {
    const next = { ...config, template: DEFAULT_WA_TEMPLATE };
    setConfig(next);
    saveWaClipboardConfig({ template: DEFAULT_WA_TEMPLATE });
    toast.success(
      language === "es"
        ? "Plantilla restaurada"
        : "Template restored"
    );
  };

  const insertVariable = (varKey: string) => {
    handleTemplateChange(config.template + varKey);
  };

  // Preview with sample data
  const previewMessage = buildWhatsAppMessage(config.template, {
    patientName: "María García",
    date: "20/03/2026",
    time: "10:30",
    doctorName: "Dr. López",
    serviceName: "Consulta general",
    clinicName: organization?.name || "Mi Clínica",
    clinicAddress: organization?.address || "Av. Principal 123",
  });

  return (
    <div className="space-y-6">
      {/* Enable/disable toggle */}
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <label className="flex items-center justify-between select-none cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <MessageSquare className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {language === "es"
                  ? "Modal de copia rápida para WhatsApp"
                  : "WhatsApp quick-copy modal"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === "es"
                  ? "Muestra un modal después de crear una cita para copiar un mensaje pre-formateado y pegarlo en WhatsApp"
                  : "Shows a modal after creating an appointment to copy a pre-formatted message for WhatsApp"}
              </p>
            </div>
          </div>
          <div className="relative ml-4 shrink-0">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-emerald-500 transition-colors" />
            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </div>
        </label>
      </div>

      {/* Template editor — only shown when enabled */}
      {config.enabled && (
        <>
          {/* Variables chips */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">
                {language === "es" ? "Variables disponibles" : "Available variables"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "es"
                  ? "Haz clic en una variable para insertarla al final de la plantilla"
                  : "Click a variable to insert it at the end of the template"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {WA_TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/50"
                >
                  <span className="font-mono">{v.key}</span>
                  <span className="text-muted-foreground">— {v.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template textarea */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">
                  {language === "es" ? "Plantilla del mensaje" : "Message template"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "es"
                    ? "Personaliza el mensaje que se copiará al portapapeles"
                    : "Customize the message that will be copied to clipboard"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetTemplate}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {language === "es" ? "Restaurar" : "Reset"}
              </button>
            </div>

            <textarea
              value={config.template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors resize-none font-mono leading-relaxed"
              placeholder={DEFAULT_WA_TEMPLATE}
            />
          </div>

          {/* Live preview */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
            <h3 className="text-sm font-semibold">
              {language === "es" ? "Vista previa" : "Preview"}
            </h3>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {previewMessage}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {language === "es"
                ? "Así se verá el mensaje con datos de ejemplo"
                : "This is how the message will look with sample data"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
