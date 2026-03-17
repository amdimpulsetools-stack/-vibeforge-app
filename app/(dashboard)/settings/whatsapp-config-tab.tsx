"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import {
  Loader2,
  Settings2,
  CheckCircle2,
  XCircle,
  Wifi,
  Shield,
  Hash,
  Key,
  Phone,
  Zap,
} from "lucide-react";
import type { WhatsAppConfig } from "@/lib/whatsapp/types";

export default function WhatsAppConfigTab() {
  const { language } = useLanguage();
  const { organizationId, isOrgAdmin } = useOrganization();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<Partial<WhatsAppConfig>>({});
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    phoneNumber?: string;
    qualityRating?: string;
  } | null>(null);

  const es = language === "es";

  const fetchConfig = useCallback(async () => {
    if (!organizationId) return;
    const res = await fetch("/api/whatsapp/config");
    if (res.ok) {
      const data = await res.json();
      if (data) setConfig(data);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/whatsapp/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Error al guardar");
      return;
    }

    const data = await res.json();
    setConfig(data);
    toast.success(es ? "Configuración guardada" : "Configuration saved");
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerificationResult(null);

    const res = await fetch("/api/whatsapp/config", {
      method: "POST",
    });

    setVerifying(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Error al verificar");
      return;
    }

    const result = await res.json();
    setVerificationResult(result);

    if (result.verified) {
      toast.success(
        es ? "Conexión verificada correctamente" : "Connection verified successfully"
      );
      fetchConfig();
    } else {
      toast.error(
        es ? "No se pudo verificar la conexión" : "Connection verification failed"
      );
    }
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      {config.is_active && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {es ? "WhatsApp Business conectado" : "WhatsApp Business connected"}
            </p>
            <p className="text-xs text-muted-foreground">
              {es ? `Tier de mensajería: ${config.messaging_tier} msgs/día` : `Messaging tier: ${config.messaging_tier} msgs/day`}
            </p>
          </div>
        </div>
      )}

      {/* WABA Configuration */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {es ? "Configuración WABA" : "WABA Configuration"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {es
                ? "Conecta tu cuenta de WhatsApp Business API de Meta"
                : "Connect your Meta WhatsApp Business API account"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              WABA ID
            </label>
            <input
              type="text"
              disabled={!isOrgAdmin}
              placeholder="123456789012345"
              value={config.waba_id || ""}
              onChange={(e) => setConfig({ ...config, waba_id: e.target.value })}
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              {es ? "ID de tu cuenta WhatsApp Business en Meta" : "Your WhatsApp Business Account ID in Meta"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              Phone Number ID
            </label>
            <input
              type="text"
              disabled={!isOrgAdmin}
              placeholder="109876543210987"
              value={config.phone_number_id || ""}
              onChange={(e) => setConfig({ ...config, phone_number_id: e.target.value })}
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              {es ? "ID del número registrado en Meta" : "Registered phone number ID in Meta"}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5 text-muted-foreground" />
            Access Token
          </label>
          <input
            type="password"
            disabled={!isOrgAdmin}
            placeholder={es ? "Token permanente de Meta" : "Permanent token from Meta"}
            value={config.access_token || ""}
            onChange={(e) => setConfig({ ...config, access_token: e.target.value })}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            {es
              ? "Token permanente de acceso generado en Meta Business Suite"
              : "Permanent access token generated in Meta Business Suite"}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Webhook Verify Token
          </label>
          <input
            type="text"
            disabled={!isOrgAdmin}
            placeholder={es ? "Token personalizado para verificar webhooks" : "Custom token for webhook verification"}
            value={config.webhook_verify_token || ""}
            onChange={(e) => setConfig({ ...config, webhook_verify_token: e.target.value })}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            {es
              ? "Token que usarás al configurar el webhook en Meta"
              : "Token you'll use when configuring the webhook in Meta"}
          </p>
        </div>

        {isOrgAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? (es ? "Guardando..." : "Saving...") : (es ? "Guardar" : "Save")}
            </button>

            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying || !config.waba_id || !config.phone_number_id}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {verifying
                ? (es ? "Verificando..." : "Verifying...")
                : (es ? "Verificar conexión" : "Verify connection")}
            </button>
          </div>
        )}

        {/* Verification result */}
        {verificationResult && (
          <div
            className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
              verificationResult.verified
                ? "bg-emerald-500/10 border border-emerald-500/30"
                : "bg-destructive/10 border border-destructive/30"
            }`}
          >
            {verificationResult.verified ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <div>
              <p className={`text-sm font-medium ${verificationResult.verified ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                {verificationResult.verified
                  ? (es ? "Conexión exitosa" : "Connection successful")
                  : (es ? "No se pudo conectar" : "Connection failed")}
              </p>
              {verificationResult.phoneNumber && (
                <p className="text-xs text-muted-foreground">
                  {es ? "Número:" : "Number:"} {verificationResult.phoneNumber}
                  {verificationResult.qualityRating && ` · ${es ? "Calidad:" : "Quality:"} ${verificationResult.qualityRating}`}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">
            {es ? "Guía de configuración" : "Setup Guide"}
          </h2>
        </div>

        <div className="space-y-3">
          {[
            es ? "Crear una cuenta en Meta Business Suite (business.facebook.com)" : "Create an account on Meta Business Suite (business.facebook.com)",
            es ? "Crear una app en Meta for Developers (developers.facebook.com)" : "Create an app on Meta for Developers (developers.facebook.com)",
            es ? "Agregar el producto 'WhatsApp' a tu app" : "Add the 'WhatsApp' product to your app",
            es ? "Copiar el WABA ID y Phone Number ID desde la configuración de WhatsApp" : "Copy the WABA ID and Phone Number ID from WhatsApp settings",
            es ? "Generar un token permanente en Configuración del sistema > Tokens de acceso" : "Generate a permanent token in System Settings > Access Tokens",
            es ? "Configurar el webhook apuntando a tu dominio/api/whatsapp/webhook" : "Configure the webhook pointing to your domain/api/whatsapp/webhook",
            es ? "Verificar tu negocio en Meta Business Suite para aumentar el tier de mensajería" : "Verify your business in Meta Business Suite to increase messaging tier",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-sm text-muted-foreground pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
