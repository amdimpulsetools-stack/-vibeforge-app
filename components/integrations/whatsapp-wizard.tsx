"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Hash,
  Phone,
  Key,
  Webhook,
  Sparkles,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import type { WhatsAppConfig } from "@/lib/whatsapp/types";

interface WhatsAppWizardProps {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

type StepKey = "intro" | "meta-app" | "ids" | "token" | "webhook" | "verify";

const STEPS: { key: StepKey; titleEs: string; titleEn: string }[] = [
  { key: "intro", titleEs: "Antes de empezar", titleEn: "Before you start" },
  { key: "meta-app", titleEs: "App en Meta", titleEn: "Meta app" },
  { key: "ids", titleEs: "WABA + Número", titleEn: "WABA + Number" },
  { key: "token", titleEs: "Access Token", titleEn: "Access Token" },
  { key: "webhook", titleEs: "Webhook", titleEn: "Webhook" },
  { key: "verify", titleEs: "Verificar", titleEn: "Verify" },
];

function generateVerifyToken(): string {
  const arr = new Uint8Array(16);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(arr);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WhatsAppWizard({ open, onClose, onConnected }: WhatsAppWizardProps) {
  const { language } = useLanguage();
  const { organizationId, isOrgAdmin } = useOrganization();
  const es = language === "es";

  const [stepIdx, setStepIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<Partial<WhatsAppConfig>>({});
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [verification, setVerification] = useState<{
    verified: boolean;
    phoneNumber?: string;
    qualityRating?: string;
  } | null>(null);

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/whatsapp/webhook`;
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const res = await fetch("/api/whatsapp/config");
    if (res.ok) {
      const data = await res.json();
      if (data) {
        setConfig(data);
        if (data.is_active) {
          setVerification({ verified: true });
        }
      } else {
        setConfig({ webhook_verify_token: generateVerifyToken() });
      }
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (open) {
      fetchConfig();
      setStepIdx(0);
      setAccessTokenInput("");
      setVerification(null);
    }
  }, [open, fetchConfig]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(es ? `${label} copiado` : `${label} copied`);
    } catch {
      toast.error(es ? "No se pudo copiar" : "Failed to copy");
    }
  };

  const saveDraft = async (patch: Partial<WhatsAppConfig>, opts?: { silent?: boolean }) => {
    setSaving(true);
    const body: Record<string, unknown> = { ...patch };
    if (accessTokenInput) {
      body.access_token = accessTokenInput;
    }
    const res = await fetch("/api/whatsapp/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || (es ? "Error al guardar" : "Save error"));
      return false;
    }
    const data = await res.json();
    setConfig(data);
    if (accessTokenInput) setAccessTokenInput("");
    if (!opts?.silent) {
      toast.success(es ? "Guardado" : "Saved");
    }
    return true;
  };

  const verifyConnection = async () => {
    setVerifying(true);
    setVerification(null);
    const res = await fetch("/api/whatsapp/config", { method: "POST" });
    setVerifying(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || (es ? "Error al verificar" : "Verify error"));
      return;
    }
    const result = await res.json();
    setVerification(result);
    if (result.verified) {
      toast.success(es ? "Conexión exitosa" : "Connection successful");
      fetchConfig();
      onConnected?.();
    } else {
      toast.error(es ? "No se pudo conectar" : "Connection failed");
    }
  };

  if (!open) return null;

  const currentStep = STEPS[stepIdx];
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono";

  const goNext = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const stepValid = () => {
    switch (currentStep.key) {
      case "ids":
        return !!config.waba_id && !!config.phone_number_id;
      case "token":
        return !!accessTokenInput || !!config.access_token;
      case "webhook":
        return !!config.webhook_verify_token;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep.key === "ids") {
      const ok = await saveDraft({ waba_id: config.waba_id, phone_number_id: config.phone_number_id }, { silent: true });
      if (!ok) return;
    }
    if (currentStep.key === "token" && accessTokenInput) {
      const ok = await saveDraft({}, { silent: true });
      if (!ok) return;
    }
    if (currentStep.key === "webhook") {
      const ok = await saveDraft({ webhook_verify_token: config.webhook_verify_token }, { silent: true });
      if (!ok) return;
    }
    goNext();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-emerald-500">
                <path
                  fill="currentColor"
                  d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.81 14.07c-.25.7-1.43 1.34-2.01 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.95-4.31-5.1-4.51-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.59-.37.79-.37.2 0 .39.01.57.01.18 0 .42-.07.66.5.25.59.84 2.05.91 2.2.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.45.54-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.05 1.13 1 2.08 1.32 2.38 1.47.3.15.47.13.65-.07.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.71.81 2 .96.3.15.49.22.56.34.07.13.07.74-.18 1.45z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {es ? "Conectar WhatsApp Business" : "Connect WhatsApp Business"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {es ? "Configuración paso a paso · ~10 minutos" : "Step-by-step setup · ~10 minutes"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="border-b border-border/60 px-6 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>
              {es ? "Paso" : "Step"} {stepIdx + 1} / {STEPS.length}
            </span>
            <span>{currentStep.titleEs && (es ? currentStep.titleEs : currentStep.titleEn)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {currentStep.key === "intro" && <IntroStep es={es} />}
              {currentStep.key === "meta-app" && <MetaAppStep es={es} />}
              {currentStep.key === "ids" && (
                <IdsStep
                  es={es}
                  config={config}
                  onChange={setConfig}
                  inputClass={inputClass}
                  disabled={!isOrgAdmin}
                />
              )}
              {currentStep.key === "token" && (
                <TokenStep
                  es={es}
                  hasToken={!!config.access_token}
                  value={accessTokenInput}
                  onChange={setAccessTokenInput}
                  inputClass={inputClass}
                  disabled={!isOrgAdmin}
                />
              )}
              {currentStep.key === "webhook" && (
                <WebhookStep
                  es={es}
                  webhookUrl={webhookUrl}
                  verifyToken={config.webhook_verify_token || ""}
                  onChange={(v) => setConfig({ ...config, webhook_verify_token: v })}
                  onRegenerate={() => setConfig({ ...config, webhook_verify_token: generateVerifyToken() })}
                  onCopy={copy}
                  inputClass={inputClass}
                  disabled={!isOrgAdmin}
                />
              )}
              {currentStep.key === "verify" && (
                <VerifyStep
                  es={es}
                  verifying={verifying}
                  verification={verification}
                  onVerify={verifyConnection}
                  config={config}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4 bg-muted/20">
          <button
            onClick={goPrev}
            disabled={stepIdx === 0}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" />
            {es ? "Atrás" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {stepIdx < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={!stepValid() || saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {es ? "Continuar" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {es ? "Finalizar" : "Finish"}
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntroStep({ es }: { es: boolean }) {
  const requirements = es
    ? [
        "Una cuenta en Meta Business Suite (business.facebook.com)",
        "Un número de teléfono dedicado para WhatsApp Business (no puede estar usado en WhatsApp normal)",
        "Acceso administrador a tu app en Meta for Developers",
        "Verificación de tu negocio (recomendado para subir el tier de mensajería)",
      ]
    : [
        "A Meta Business Suite account (business.facebook.com)",
        "A dedicated phone number for WhatsApp Business (cannot be in use on regular WhatsApp)",
        "Admin access to your Meta for Developers app",
        "Business verification (recommended to raise messaging tier)",
      ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/10 mb-4">
          <Sparkles className="h-7 w-7 text-emerald-500" />
        </div>
        <h3 className="text-xl font-semibold">
          {es ? "Conecta tu WhatsApp Business en 6 pasos" : "Connect your WhatsApp Business in 6 steps"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {es
            ? "Te guiaremos para configurar Meta Cloud API y empezar a enviar recordatorios, confirmaciones y campañas a tus pacientes."
            : "We'll guide you through Meta Cloud API setup so you can start sending reminders, confirmations and campaigns to your patients."}
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
        <h4 className="text-sm font-semibold mb-3">
          {es ? "Necesitarás:" : "You'll need:"}
        </h4>
        <ul className="space-y-2.5">
          {requirements.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{r}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>{es ? "Tip:" : "Tip:"}</strong>{" "}
          {es
            ? "Si ya usas WhatsApp Business app en tu celular, debes desinstalarlo del número antes de conectarlo a la API."
            : "If you already use the WhatsApp Business app on your phone, you must uninstall it from that number before connecting it to the API."}
        </p>
      </div>
    </div>
  );
}

function MetaAppStep({ es }: { es: boolean }) {
  const steps = es
    ? [
        { title: "Ir a Meta for Developers", desc: "Entra a developers.facebook.com y haz click en 'Mis Apps'.", link: "https://developers.facebook.com/apps" },
        { title: "Crear nueva app", desc: "Click en 'Crear app' → tipo 'Negocio' → asigna un nombre (ej: 'Mi Clínica WA')." },
        { title: "Agregar producto WhatsApp", desc: "En el panel de la app, busca 'WhatsApp' y haz click en 'Configurar'." },
        { title: "Vincular cuenta de Meta Business", desc: "Selecciona tu cuenta de negocio. Si no tienes una, créala primero en business.facebook.com." },
      ]
    : [
        { title: "Go to Meta for Developers", desc: "Visit developers.facebook.com and click 'My Apps'.", link: "https://developers.facebook.com/apps" },
        { title: "Create new app", desc: "Click 'Create app' → type 'Business' → give it a name (eg: 'My Clinic WA')." },
        { title: "Add WhatsApp product", desc: "In the app panel, find 'WhatsApp' and click 'Set up'." },
        { title: "Link your Meta Business account", desc: "Select your business account. If you don't have one, create it first at business.facebook.com." },
      ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h3 className="text-lg font-semibold">
          {es ? "Crea tu app en Meta for Developers" : "Create your Meta for Developers app"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {es
            ? "Esta app es como una llave que conecta nuestra plataforma con tu cuenta WhatsApp Business."
            : "This app is the key that connects our platform with your WhatsApp Business account."}
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                {s.link && (
                  <a
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-emerald-600 hover:underline"
                  >
                    {es ? "Abrir Meta for Developers" : "Open Meta for Developers"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function IdsStep({
  es,
  config,
  onChange,
  inputClass,
  disabled,
}: {
  es: boolean;
  config: Partial<WhatsAppConfig>;
  onChange: (c: Partial<WhatsAppConfig>) => void;
  inputClass: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h3 className="text-lg font-semibold">
          {es ? "Copia tu WABA ID y Phone Number ID" : "Copy your WABA ID and Phone Number ID"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {es
            ? "Dentro de tu app, en el menú lateral: WhatsApp → Configuración API. Verás ambos IDs en el panel principal."
            : "Inside your app, in the side menu: WhatsApp → API Setup. Both IDs appear in the main panel."}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            WABA ID
            <span className="text-xs text-muted-foreground font-normal">
              ({es ? "WhatsApp Business Account ID" : "WhatsApp Business Account ID"})
            </span>
          </label>
          <input
            type="text"
            disabled={disabled}
            placeholder="123456789012345"
            value={config.waba_id || ""}
            onChange={(e) => onChange({ ...config, waba_id: e.target.value })}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            Phone Number ID
          </label>
          <input
            type="text"
            disabled={disabled}
            placeholder="109876543210987"
            value={config.phone_number_id || ""}
            onChange={(e) => onChange({ ...config, phone_number_id: e.target.value })}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            {es
              ? "ID del número que registraste en WhatsApp Business. No es el número en sí (+51...), es un ID numérico largo."
              : "ID of the number you registered in WhatsApp Business. Not the number itself (+51...), it's a long numeric ID."}
          </p>
        </div>
      </div>

      <a
        href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
      >
        {es ? "Ver documentación oficial de Meta" : "See official Meta documentation"}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function TokenStep({
  es,
  hasToken,
  value,
  onChange,
  inputClass,
  disabled,
}: {
  es: boolean;
  hasToken: boolean;
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h3 className="text-lg font-semibold">
          {es ? "Genera un Access Token permanente" : "Generate a permanent Access Token"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {es
            ? "Los tokens temporales caducan en 24h. Para producción debes crear un System User Token."
            : "Temporary tokens expire in 24h. For production you must create a System User Token."}
        </p>
      </div>

      <ol className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-4">
        {(es
          ? [
              "Ve a business.facebook.com → Configuración del Negocio → Usuarios del Sistema",
              "Crea un usuario de sistema con rol Admin",
              "Asígnale tu app y la cuenta WhatsApp Business como activos asignados",
              "Genera un token con permisos: whatsapp_business_management + whatsapp_business_messaging",
              "Selecciona 'Sin caducidad' para que el token sea permanente",
              "Copia el token y pégalo aquí",
            ]
          : [
              "Go to business.facebook.com → Business Settings → System Users",
              "Create a system user with Admin role",
              "Assign your app and WhatsApp Business account as assigned assets",
              "Generate a token with permissions: whatsapp_business_management + whatsapp_business_messaging",
              "Select 'Never' for expiration so the token is permanent",
              "Copy the token and paste it here",
            ]
        ).map((s, i) => (
          <li key={s} className="flex items-start gap-2.5 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{s}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-1.5">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5 text-muted-foreground" />
          Access Token
          {hasToken && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {es ? "Ya guardado" : "Already saved"}
            </span>
          )}
        </label>
        <input
          type="password"
          disabled={disabled}
          placeholder={
            hasToken
              ? es
                ? "Pega un nuevo token solo si quieres reemplazarlo"
                : "Paste a new token only to replace it"
              : "EAAxxxxxxxxxxxxxxxxxxx..."
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground">
          {es
            ? "Lo encriptamos con AES-256 antes de guardarlo. Nunca lo verás de nuevo en pantalla."
            : "We encrypt it with AES-256 before saving. You won't see it on screen again."}
        </p>
      </div>

      <a
        href="https://business.facebook.com/settings/system-users"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
      >
        {es ? "Abrir Usuarios del Sistema" : "Open System Users"}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function WebhookStep({
  es,
  webhookUrl,
  verifyToken,
  onChange,
  onRegenerate,
  onCopy,
  inputClass,
  disabled,
}: {
  es: boolean;
  webhookUrl: string;
  verifyToken: string;
  onChange: (v: string) => void;
  onRegenerate: () => void;
  onCopy: (value: string, label: string) => void;
  inputClass: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h3 className="text-lg font-semibold">
          {es ? "Configura el Webhook en Meta" : "Configure the Webhook in Meta"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {es
            ? "El webhook permite que Meta nos avise cuando un mensaje es entregado, leído o cuando un paciente responde."
            : "The webhook lets Meta notify us when a message is delivered, read, or when a patient replies."}
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
            Callback URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className={`${inputClass} bg-muted/30`}
            />
            <button
              onClick={() => onCopy(webhookUrl, "Callback URL")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            Verify Token
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              disabled={disabled}
              value={verifyToken}
              onChange={(e) => onChange(e.target.value)}
              placeholder={es ? "Token autogenerado" : "Auto-generated token"}
              className={inputClass}
            />
            <button
              onClick={() => onCopy(verifyToken, "Verify Token")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={es ? "Copiar" : "Copy"}
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={onRegenerate}
              disabled={disabled}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title={es ? "Regenerar" : "Regenerate"}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        <p className="text-sm font-semibold mb-2">
          {es ? "En la consola de Meta:" : "In the Meta console:"}
        </p>
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            1. {es ? "Ve a tu app → WhatsApp → Configuración" : "Go to your app → WhatsApp → Configuration"}
          </li>
          <li>
            2. {es ? "En la sección 'Webhook', click 'Editar'" : "In the 'Webhook' section, click 'Edit'"}
          </li>
          <li>
            3. {es ? "Pega la Callback URL y el Verify Token de arriba" : "Paste the Callback URL and Verify Token above"}
          </li>
          <li>
            4. {es ? "Suscríbete a los campos: messages, message_status" : "Subscribe to fields: messages, message_status"}
          </li>
        </ol>
      </div>
    </div>
  );
}

function VerifyStep({
  es,
  verifying,
  verification,
  onVerify,
  config,
}: {
  es: boolean;
  verifying: boolean;
  verification: { verified: boolean; phoneNumber?: string; qualityRating?: string } | null;
  onVerify: () => void;
  config: Partial<WhatsAppConfig>;
}) {
  const ready = !!config.waba_id && !!config.phone_number_id && !!config.access_token;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/10 mb-4">
          <ShieldCheck className="h-7 w-7 text-emerald-500" />
        </div>
        <h3 className="text-xl font-semibold">
          {es ? "Verifica la conexión con Meta" : "Verify connection with Meta"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {es
            ? "Vamos a hacer un ping a la API de Meta con tus credenciales para confirmar que todo está bien."
            : "We'll ping Meta's API with your credentials to confirm everything works."}
        </p>
      </div>

      {!ready && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {es
              ? "Faltan datos. Vuelve a los pasos anteriores y completa WABA ID, Phone Number ID y Access Token."
              : "Missing data. Go back and complete WABA ID, Phone Number ID and Access Token."}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center">
        <button
          onClick={onVerify}
          disabled={!ready || verifying}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {verifying
            ? es ? "Verificando..." : "Verifying..."
            : es ? "Probar conexión" : "Test connection"}
        </button>
      </div>

      {verification && (
        <div
          className={`rounded-xl border p-5 ${
            verification.verified
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          <div className="flex items-start gap-3">
            {verification.verified ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-6 w-6 text-destructive shrink-0" />
            )}
            <div className="flex-1">
              <p
                className={`text-sm font-semibold ${
                  verification.verified
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {verification.verified
                  ? es ? "WhatsApp conectado correctamente" : "WhatsApp connected successfully"
                  : es ? "No pudimos conectar" : "We couldn't connect"}
              </p>
              {verification.phoneNumber && (
                <p className="text-xs text-muted-foreground mt-1">
                  {es ? "Número:" : "Number:"} <span className="font-mono">{verification.phoneNumber}</span>
                  {verification.qualityRating && (
                    <>
                      {" · "}
                      {es ? "Calidad:" : "Quality:"} {verification.qualityRating}
                    </>
                  )}
                </p>
              )}
              {verification.verified && (
                <p className="text-xs text-muted-foreground mt-2">
                  {es
                    ? "Ya puedes crear plantillas y enviar mensajes desde la pestaña Templates."
                    : "You can now create templates and send messages from the Templates tab."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
