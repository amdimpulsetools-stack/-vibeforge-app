"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  FileText,
  Video,
  Loader2,
  CheckCircle2,
  Plug,
  Settings,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { WhatsAppWizard } from "@/components/integrations/whatsapp-wizard";
import { useConfirm } from "@/components/ui/confirm-dialog";

type IntegrationStatus = "connected" | "available" | "coming-soon";

interface Integration {
  id: string;
  name: string;
  category: string;
  description: { es: string; en: string };
  iconNode: React.ReactNode;
  status: IntegrationStatus;
  onConnect?: () => void;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-emerald-500">
      <path
        fill="currentColor"
        d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.81 14.07c-.25.7-1.43 1.34-2.01 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.95-4.31-5.1-4.51-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.59-.37.79-.37.2 0 .39.01.57.01.18 0 .42-.07.66.5.25.59.84 2.05.91 2.2.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.45.54-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.05 1.13 1 2.08 1.32 2.38 1.47.3.15.47.13.65-.07.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.71.81 2 .96.3.15.49.22.56.34.07.13.07.74-.18 1.45z"
      />
    </svg>
  );
}

function GoogleCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <rect x="3" y="4" width="18" height="17" rx="2" fill="#4285F4" />
      <rect x="3" y="4" width="18" height="4" fill="#1A73E8" />
      <text x="12" y="17" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">
        17
      </text>
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <path d="M2 6.5C2 5.67 2.67 5 3.5 5H4l8 6 8-6h.5c.83 0 1.5.67 1.5 1.5v11c0 .83-.67 1.5-1.5 1.5H20V8.5l-8 6-8-6V19h-.5C2.67 19 2 18.33 2 17.5v-11z" fill="#EA4335" />
      <path d="M4 5h16l-8 6L4 5z" fill="#EA4335" opacity="0.7" />
      <path d="M22 6.5v11c0 .83-.67 1.5-1.5 1.5H20V8.5l2-2z" fill="#FBBC04" />
      <path d="M2 6.5v11C2 18.33 2.67 19 3.5 19H4V8.5l-2-2z" fill="#34A853" />
    </svg>
  );
}

function MercadoPagoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <circle cx="12" cy="12" r="10" fill="#00B1EA" />
      <path
        d="M7 10c0-1.5 1.2-2.5 2.5-2.5 1 0 1.8.4 2.5 1 .7-.6 1.5-1 2.5-1C15.8 7.5 17 8.5 17 10c0 .5-.2 1-.5 1.5l-4.5 4-4.5-4c-.3-.5-.5-1-.5-1.5z"
        fill="white"
      />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <rect width="24" height="24" rx="5" fill="#2D8CFF" />
      <path
        d="M5 9c0-.55.45-1 1-1h7c1.66 0 3 1.34 3 3v4c0 .55-.45 1-1 1H8c-1.66 0-3-1.34-3-3V9z"
        fill="white"
      />
      <path
        d="M17 11l3-2v6l-3-2v-2z"
        fill="white"
      />
    </svg>
  );
}

const INTEGRATION_CATEGORIES = {
  messaging: { es: "Mensajería", en: "Messaging" },
  calendar: { es: "Calendario", en: "Calendar" },
  payments: { es: "Pagos", en: "Payments" },
  billing: { es: "Facturación", en: "Billing" },
  video: { es: "Telemedicina", en: "Telehealth" },
  email: { es: "Email", en: "Email" },
} as const;

interface GCalStatus {
  connected: boolean;
  email?: string;
  connected_at?: string;
  last_sync_at?: string | null;
  last_sync_error?: string | null;
  is_active?: boolean;
}

export default function IntegracionesTab() {
  const { language } = useLanguage();
  const { organizationId } = useOrganization();
  const confirm = useConfirm();
  const es = language === "es";

  const [whatsappWizardOpen, setWhatsappWizardOpen] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [gcal, setGcal] = useState<GCalStatus>({ connected: false });
  const [loadingStatus, setLoadingStatus] = useState(true);

  const fetchWhatsappStatus = useCallback(async () => {
    if (!organizationId) return;
    const res = await fetch("/api/whatsapp/config");
    if (res.ok) {
      const data = await res.json();
      setWhatsappConnected(!!data?.is_active);
    }
  }, [organizationId]);

  const fetchGCalStatus = useCallback(async () => {
    if (!organizationId) return;
    const res = await fetch("/api/integrations/google/status");
    if (res.ok) {
      setGcal((await res.json()) as GCalStatus);
    }
  }, [organizationId]);

  const refreshAll = useCallback(async () => {
    setLoadingStatus(true);
    await Promise.all([fetchWhatsappStatus(), fetchGCalStatus()]);
    setLoadingStatus(false);
  }, [fetchWhatsappStatus, fetchGCalStatus]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Surface OAuth callback result via toast (?gcal=ok|error)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("gcal");
    if (!result) return;
    if (result === "ok") {
      toast.success(es ? "Google Calendar conectado." : "Google Calendar connected.");
    } else {
      const reason = url.searchParams.get("gcal_reason") || "";
      toast.error(
        (es ? "No pudimos conectar Google Calendar." : "Could not connect Google Calendar.") +
          (reason ? ` (${reason})` : "")
      );
    }
    url.searchParams.delete("gcal");
    url.searchParams.delete("gcal_reason");
    window.history.replaceState({}, "", url.toString());
    refreshAll();
  }, [es, refreshAll]);

  const handleConnectGCal = () => {
    // Full-page redirect — Google's OAuth flow doesn't work in popups reliably.
    window.location.href = "/api/integrations/google/connect";
  };

  const handleDisconnectGCal = async () => {
    const ok = await confirm({
      title: es ? "Desconectar Google Calendar" : "Disconnect Google Calendar",
      description: es
        ? "Las citas existentes en Google Calendar se quedarán como están. Las nuevas dejarán de sincronizarse."
        : "Existing events stay in Google Calendar. New appointments will stop syncing.",
      confirmText: es ? "Desconectar" : "Disconnect",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch("/api/integrations/google/disconnect", { method: "POST" });
    if (res.ok) {
      toast.success(es ? "Desconectado." : "Disconnected.");
      fetchGCalStatus();
    } else {
      toast.error(es ? "Error al desconectar." : "Disconnect failed.");
    }
  };

  const integrations: Integration[] = [
    {
      id: "whatsapp",
      name: "WhatsApp Business API",
      category: INTEGRATION_CATEGORIES.messaging[language as "es" | "en"] || INTEGRATION_CATEGORIES.messaging.es,
      description: {
        es: "Envía recordatorios, confirmaciones y campañas a tus pacientes vía WhatsApp oficial de Meta.",
        en: "Send reminders, confirmations and campaigns to your patients via Meta's official WhatsApp.",
      },
      iconNode: <WhatsAppIcon />,
      status: whatsappConnected ? "connected" : "available",
      onConnect: () => setWhatsappWizardOpen(true),
    },
    {
      id: "google-calendar",
      name: "Google Calendar",
      category: INTEGRATION_CATEGORIES.calendar[language as "es" | "en"] || INTEGRATION_CATEGORIES.calendar.es,
      description: {
        es: "Cada cita que crees, edites o canceles se refleja en el Google Calendar de tu clínica. Respaldo de un solo sentido.",
        en: "Every appointment you create, edit or cancel mirrors to your clinic's Google Calendar. One-way backup.",
      },
      iconNode: <GoogleCalendarIcon />,
      status: gcal.connected ? "connected" : "available",
      onConnect: gcal.connected ? handleDisconnectGCal : handleConnectGCal,
    },
    {
      id: "gmail",
      name: "Gmail / Google Workspace",
      category: INTEGRATION_CATEGORIES.email[language as "es" | "en"] || INTEGRATION_CATEGORIES.email.es,
      description: {
        es: "Envía correos a pacientes desde tu propio dominio (@tuclinica.com) con autenticación SPF/DKIM.",
        en: "Send emails to patients from your own domain (@yourclinic.com) with SPF/DKIM authentication.",
      },
      iconNode: <GmailIcon />,
      status: "coming-soon",
    },
    {
      id: "mercadopago",
      name: "Mercado Pago",
      category: INTEGRATION_CATEGORIES.payments[language as "es" | "en"] || INTEGRATION_CATEGORIES.payments.es,
      description: {
        es: "Cobra citas online con tarjeta, Yape, PLIN o transferencia. Genera links de pago automáticos.",
        en: "Collect appointments online with cards or transfers. Auto-generate payment links.",
      },
      iconNode: <MercadoPagoIcon />,
      status: "coming-soon",
    },
    {
      id: "culqi",
      name: "Culqi",
      category: INTEGRATION_CATEGORIES.payments[language as "es" | "en"] || INTEGRATION_CATEGORIES.payments.es,
      description: {
        es: "Pasarela de pagos peruana. Procesa Visa, Mastercard, Amex, Yape y PagoEfectivo.",
        en: "Peruvian payment gateway. Processes Visa, Mastercard, Amex, Yape and PagoEfectivo.",
      },
      iconNode: <CreditCard className="h-6 w-6 text-violet-500" />,
      status: "coming-soon",
    },
    {
      id: "nubefact",
      name: "Nubefact (SUNAT)",
      category: INTEGRATION_CATEGORIES.billing[language as "es" | "en"] || INTEGRATION_CATEGORIES.billing.es,
      description: {
        es: "Emite boletas y facturas electrónicas válidas ante SUNAT directamente desde la app.",
        en: "Issue electronic receipts and invoices valid before SUNAT directly from the app.",
      },
      iconNode: <FileText className="h-6 w-6 text-orange-500" />,
      status: "coming-soon",
    },
    {
      id: "zoom",
      name: "Zoom",
      category: INTEGRATION_CATEGORIES.video[language as "es" | "en"] || INTEGRATION_CATEGORIES.video.es,
      description: {
        es: "Crea links de Zoom automáticos para citas de telemedicina y envíalos al paciente.",
        en: "Auto-generate Zoom links for telehealth appointments and send to the patient.",
      },
      iconNode: <ZoomIcon />,
      status: "coming-soon",
    },
    {
      id: "google-meet",
      name: "Google Meet",
      category: INTEGRATION_CATEGORIES.video[language as "es" | "en"] || INTEGRATION_CATEGORIES.video.es,
      description: {
        es: "Genera reuniones de Google Meet automáticamente para citas online de tu clínica.",
        en: "Auto-generate Google Meet rooms for online appointments at your clinic.",
      },
      iconNode: <Video className="h-6 w-6 text-blue-500" />,
      status: "coming-soon",
    },
  ];

  const statusBadge = (status: IntegrationStatus) => {
    if (status === "connected") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-2.5 w-2.5" />
          {es ? "Conectado" : "Connected"}
        </span>
      );
    }
    if (status === "available") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-400">
          <Plug className="h-2.5 w-2.5" />
          {es ? "Disponible" : "Available"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        {es ? "Próximamente" : "Coming soon"}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Plug className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {es ? "Conecta herramientas externas" : "Connect external tools"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {es
                  ? "Integra tu plataforma con WhatsApp, Google, pasarelas de pago y más para automatizar tu clínica."
                  : "Integrate your platform with WhatsApp, Google, payment gateways and more to automate your clinic."}
              </p>
            </div>
          </div>
        </div>

        {/* Integrations grid */}
        {loadingStatus ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {integrations.map((it) => {
              const isInteractive = it.status !== "coming-soon";
              return (
                <div
                  key={it.id}
                  className={`rounded-2xl border bg-card p-5 transition-all ${
                    isInteractive
                      ? "border-border/60 hover:border-primary/40 hover:shadow-md"
                      : "border-border/40 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
                      {it.iconNode}
                    </div>
                    {statusBadge(it.status)}
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{it.name}</h3>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-2">
                    {it.category}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4 min-h-[3rem]">
                    {it.description[es ? "es" : "en"]}
                  </p>

                  {/* Google Calendar — extra status detail when connected */}
                  {it.id === "google-calendar" && gcal.connected && (
                    <div className="mb-3 space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{es ? "Cuenta" : "Account"}:</span>
                        <span className="font-medium truncate">{gcal.email}</span>
                      </div>
                      {gcal.last_sync_at && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{es ? "Última sync" : "Last sync"}:</span>
                          <span className="font-medium">
                            {new Date(gcal.last_sync_at).toLocaleString(es ? "es-PE" : "en-US")}
                          </span>
                        </div>
                      )}
                      {gcal.last_sync_error && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="text-[11px] leading-relaxed">
                            {es ? "Última sync falló:" : "Last sync failed:"} {gcal.last_sync_error.slice(0, 120)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {it.status === "connected" && it.onConnect && (
                    <button
                      onClick={it.onConnect}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full justify-center"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      {it.id === "google-calendar"
                        ? (es ? "Desconectar" : "Disconnect")
                        : (es ? "Gestionar" : "Manage")}
                    </button>
                  )}

                  {it.status === "available" && it.onConnect && (
                    <button
                      onClick={it.onConnect}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity w-full justify-center"
                    >
                      {es ? "Conectar" : "Connect"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {it.status === "coming-soon" && (
                    <button
                      disabled
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-xs font-medium text-muted-foreground/50 w-full justify-center cursor-not-allowed"
                    >
                      {es ? "Pronto" : "Soon"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer hint */}
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-5 text-center">
          <p className="text-sm font-medium mb-1">
            {es ? "¿Necesitas otra integración?" : "Need another integration?"}
          </p>
          <p className="text-xs text-muted-foreground">
            {es
              ? "Escríbenos a soporte@vibeforge.app y la consideraremos para el próximo release."
              : "Write to soporte@vibeforge.app and we'll consider it for the next release."}
          </p>
        </div>
      </div>

      <WhatsAppWizard
        open={whatsappWizardOpen}
        onClose={() => {
          setWhatsappWizardOpen(false);
          fetchWhatsappStatus();
        }}
        onConnected={() => setWhatsappConnected(true)}
      />
    </>
  );
}
