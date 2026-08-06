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
  Clock,
  RefreshCw,
  ExternalLink,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { WhatsAppWizard } from "@/components/integrations/whatsapp-wizard";
import { GCalDescriptionDialog } from "@/components/integrations/gcal-description-dialog";
import { EInvoiceSetupDialog } from "@/components/integrations/einvoice-setup-dialog";
import { useEInvoiceConfig } from "@/hooks/use-einvoice-config";
import { useConfirm } from "@/components/ui/confirm-dialog";
// El glifo vive en components/icons: es el mismo que usan los botones
// que abren wa.me. Aquí es el LOGO de la tarjeta de integración (no una
// acción), pero igual va en wa-500 y no en emerald-*: el logo de
// WhatsApp no se recolorea con el acento de la organización.
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

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
  // Google Sheets mirror (mig 179)
  sheets_enabled?: boolean;
  sheets_spreadsheet_id?: string | null;
  has_drive_scope?: boolean;
}

function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export default function IntegracionesTab() {
  const { language } = useLanguage();
  const { organizationId, isOrgAdmin } = useOrganization();
  const confirm = useConfirm();
  const es = language === "es";

  const [sheetsSaving, setSheetsSaving] = useState(false);
  const [sheetsRefreshing, setSheetsRefreshing] = useState(false);

  const [whatsappWizardOpen, setWhatsappWizardOpen] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const einvoiceConfig = useEInvoiceConfig();
  const [einvoiceSetupOpen, setEinvoiceSetupOpen] = useState(false);
  const [gcal, setGcal] = useState<GCalStatus>({ connected: false });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [gcalDescriptionOpen, setGcalDescriptionOpen] = useState(false);

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

  const handleDisconnectWhatsApp = async () => {
    const ok = await confirm({
      title: es ? "Desvincular WhatsApp Business" : "Unlink WhatsApp Business",
      description: es
        ? "Se eliminarán las credenciales de Meta y se detendrán todos los envíos automáticos de WhatsApp (recordatorios, confirmaciones). Tus plantillas y el historial de mensajes se conservan — si vuelves a vincular la misma cuenta, todo queda como estaba."
        : "Meta credentials will be deleted and all automatic WhatsApp sends (reminders, confirmations) will stop. Your templates and message history are kept — relinking the same account restores everything.",
      confirmText: es ? "Desvincular" : "Unlink",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch("/api/whatsapp/config", { method: "DELETE" });
    if (res.ok) {
      toast.success(es ? "WhatsApp desvinculado." : "WhatsApp unlinked.");
      setWhatsappConnected(false);
      fetchWhatsappStatus();
    } else {
      toast.error(es ? "Error al desvincular." : "Unlink failed.");
    }
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

  // ── Google Sheets backup (mig 179) ──
  const handleRefreshSheet = useCallback(async () => {
    setSheetsRefreshing(true);
    try {
      const res = await fetch("/api/integrations/google/sheets-refresh", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data?.spreadsheetId) {
          setGcal((g) => ({ ...g, sheets_spreadsheet_id: data.spreadsheetId }));
        }
        toast.success(es ? "Hoja actualizada." : "Sheet updated.");
        fetchGCalStatus();
      } else if (res.status === 403) {
        toast.error(es ? "Solo el owner o admin puede hacer esto." : "Owner/admin only.");
      } else if (data?.reason === "missing_drive_scope") {
        toast.error(
          es ? "Reconecta Google para habilitar la hoja." : "Reconnect Google to enable the sheet."
        );
      } else {
        toast.error(es ? "No se pudo actualizar la hoja." : "Could not update the sheet.");
      }
    } finally {
      setSheetsRefreshing(false);
    }
  }, [es, fetchGCalStatus]);

  const handleToggleSheets = async (enabled: boolean) => {
    setSheetsSaving(true);
    try {
      const res = await fetch("/api/integrations/google/sheets-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setGcal((g) => ({ ...g, sheets_enabled: enabled }));
        toast.success(
          enabled
            ? es
              ? "Respaldo en Google Sheets activado."
              : "Google Sheets backup enabled."
            : es
              ? "Respaldo en Google Sheets desactivado."
              : "Google Sheets backup disabled."
        );
        // When just enabled, kick off a first write so the sheet exists.
        if (enabled) await handleRefreshSheet();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "missing_drive_scope") {
          toast.error(
            es
              ? "Reconecta Google para habilitar la hoja."
              : "Reconnect Google to enable the sheet."
          );
        } else if (data?.error === "forbidden") {
          toast.error(es ? "Solo el owner o admin puede hacer esto." : "Owner/admin only.");
        } else {
          toast.error(es ? "No se pudo guardar." : "Could not save.");
        }
      }
    } finally {
      setSheetsSaving(false);
    }
  };

  const handleDisconnectEinvoice = async () => {
    const ok = await confirm({
      title: es ? "Desconectar facturación electrónica" : "Disconnect e-invoicing",
      description: es
        ? "Los comprobantes ya emitidos se conservan para auditoría. Las nuevas citas dejarán de poder emitir comprobantes hasta que reconectes."
        : "Already-issued invoices are kept for audit. New appointments won't be able to issue invoices until you reconnect.",
      confirmText: es ? "Desconectar" : "Disconnect",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch("/api/einvoices/disconnect", { method: "POST" });
    if (res.ok) {
      toast.success(es ? "Desconectado." : "Disconnected.");
      einvoiceConfig.refetch();
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
      iconNode: <WhatsAppIcon className="h-6 w-6 text-wa-500" />,
      status: whatsappConnected ? "connected" : "available",
      onConnect: whatsappConnected
        ? handleDisconnectWhatsApp
        : () => setWhatsappWizardOpen(true),
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
      name: "Nubefact",
      category: INTEGRATION_CATEGORIES.billing[language as "es" | "en"] || INTEGRATION_CATEGORIES.billing.es,
      description: {
        es: "Emite boletas y facturas electrónicas válidas ante SUNAT directamente desde Yenda. Cero doble entrada de datos.",
        en: "Issue SUNAT-valid receipts and invoices directly from Yenda. No double data entry.",
      },
      iconNode: <FileText className="h-6 w-6 text-orange-500" />,
      status: einvoiceConfig.connected ? "connected" : "available",
      onConnect: () => setEinvoiceSetupOpen(true),
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

        {/* Integrations grouped by status: connected → available → coming-soon */}
        {loadingStatus ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (() => {
          const renderCard = (it: Integration) => {
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
                    <div className="mb-3 space-y-2">
                      <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
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

                      <button
                        onClick={() => setGcalDescriptionOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors w-full justify-center"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {es ? "Personalizar descripción" : "Customize description"}
                      </button>

                      {/* Google Sheets backup (mig 179) */}
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="mb-2 flex items-center gap-1.5">
                          <Table2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-semibold">
                            {es ? "Respaldo en Google Sheets" : "Google Sheets backup"}
                          </span>
                        </div>

                        {gcal.has_drive_scope === false ? (
                          // Scope missing — connected before Sheets existed.
                          <div className="space-y-2">
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              {es
                                ? "Reconecta tu cuenta de Google para autorizar la hoja de cálculo (permiso de un solo archivo que Yenda crea)."
                                : "Reconnect your Google account to authorize the spreadsheet (single-file permission Yenda creates)."}
                            </p>
                            <button
                              onClick={handleConnectGCal}
                              disabled={!isOrgAdmin}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed dark:text-amber-400 transition-colors"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              {es ? "Reconectar Google para habilitar" : "Reconnect Google to enable"}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="flex items-center justify-between gap-2">
                              <span className="text-[11px] leading-relaxed text-muted-foreground">
                                {es
                                  ? "Espeja tus citas (−30/+90 días) a una hoja en tu Drive, cada noche."
                                  : "Mirror your appointments (−30/+90 days) to a sheet in your Drive, nightly."}
                              </span>
                              <button
                                role="switch"
                                aria-checked={!!gcal.sheets_enabled}
                                disabled={!isOrgAdmin || sheetsSaving}
                                onClick={() => handleToggleSheets(!gcal.sheets_enabled)}
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  gcal.sheets_enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    gcal.sheets_enabled ? "translate-x-4" : "translate-x-0.5"
                                  }`}
                                />
                              </button>
                            </label>

                            {gcal.sheets_enabled && (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button
                                  onClick={handleRefreshSheet}
                                  disabled={!isOrgAdmin || sheetsRefreshing}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  {sheetsRefreshing ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                  {es ? "Actualizar hoja ahora" : "Update sheet now"}
                                </button>
                                {gcal.sheets_spreadsheet_id ? (
                                  <a
                                    href={spreadsheetUrl(gcal.sheets_spreadsheet_id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    {es ? "Abrir hoja" : "Open sheet"}
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground/60">
                                    {es ? "Sin hoja aún" : "No sheet yet"}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Nubefact — extra status detail when connected */}
                  {it.id === "nubefact" && einvoiceConfig.connected && einvoiceConfig.config && (
                    <div className="mb-3 space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">RUC:</span>
                        <span className="font-medium font-mono">{einvoiceConfig.config.ruc}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{es ? "Razón social" : "Legal name"}:</span>
                        <span className="font-medium truncate text-right">{einvoiceConfig.config.legal_name}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{es ? "Modo" : "Mode"}:</span>
                        <span className={`font-medium ${einvoiceConfig.config.mode === "production" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {einvoiceConfig.config.mode === "production"
                            ? (es ? "Producción (envía a SUNAT)" : "Production (sends to SUNAT)")
                            : (es ? "Pruebas (sandbox)" : "Sandbox")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{es ? "Series activas" : "Active series"}:</span>
                        <span className="font-medium font-mono">
                          {einvoiceConfig.series.filter((s) => s.is_active).length}
                        </span>
                      </div>
                      {einvoiceConfig.config.last_error && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="text-[11px] leading-relaxed">
                            {einvoiceConfig.config.last_error.slice(0, 140)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {it.status === "connected" && it.onConnect && it.id === "nubefact" && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        onClick={it.onConnect}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors justify-center"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {es ? "Editar" : "Edit"}
                      </button>
                      <button
                        onClick={handleDisconnectEinvoice}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors justify-center"
                      >
                        {es ? "Desconectar" : "Disconnect"}
                      </button>
                    </div>
                  )}

                  {it.status === "connected" && it.onConnect && it.id !== "nubefact" && (
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
            };

          const connected = integrations.filter((i) => i.status === "connected");
          const available = integrations.filter((i) => i.status === "available");
          const comingSoon = integrations.filter((i) => i.status === "coming-soon");

          const sectionHeader = (
            icon: React.ReactNode,
            title: string,
            count: number,
            tone: "emerald" | "blue" | "muted",
          ) => {
            const toneClasses = {
              emerald: "text-emerald-600 dark:text-emerald-400",
              blue: "text-blue-600 dark:text-blue-400",
              muted: "text-muted-foreground",
            }[tone];
            return (
              <div className="flex items-center gap-2 mb-3">
                <span className={toneClasses}>{icon}</span>
                <h3 className="text-sm font-semibold">{title}</h3>
                <span className="text-xs text-muted-foreground">({count})</span>
              </div>
            );
          };

          return (
            <div className="space-y-8">
              {connected.length > 0 && (
                <section>
                  {sectionHeader(
                    <CheckCircle2 className="h-4 w-4" />,
                    es ? "Mis integraciones activas" : "My active integrations",
                    connected.length,
                    "emerald",
                  )}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {connected.map(renderCard)}
                  </div>
                </section>
              )}

              {available.length > 0 && (
                <section>
                  {sectionHeader(
                    <Plug className="h-4 w-4" />,
                    es ? "Disponibles para conectar" : "Available to connect",
                    available.length,
                    "blue",
                  )}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {available.map(renderCard)}
                  </div>
                </section>
              )}

              {comingSoon.length > 0 && (
                <section>
                  {sectionHeader(
                    <Clock className="h-4 w-4" />,
                    es ? "Próximamente" : "Coming soon",
                    comingSoon.length,
                    "muted",
                  )}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {comingSoon.map(renderCard)}
                  </div>
                </section>
              )}
            </div>
          );
        })()}

        {/* Footer hint */}
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-5 text-center">
          <p className="text-sm font-medium mb-1">
            {es ? "¿Necesitas otra integración?" : "Need another integration?"}
          </p>
          <p className="text-xs text-muted-foreground">
            {es
              ? "Escríbenos a soporte@yenda.app y la consideraremos para el próximo release."
              : "Write to soporte@yenda.app and we'll consider it for the next release."}
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

      <GCalDescriptionDialog
        open={gcalDescriptionOpen}
        onOpenChange={setGcalDescriptionOpen}
      />

      <EInvoiceSetupDialog
        open={einvoiceSetupOpen}
        onOpenChange={setEinvoiceSetupOpen}
        onSaved={() => einvoiceConfig.refetch()}
        initialConfig={einvoiceConfig.connected ? einvoiceConfig.config : null}
        initialSeries={einvoiceConfig.connected ? einvoiceConfig.series : []}
      />
    </>
  );
}
