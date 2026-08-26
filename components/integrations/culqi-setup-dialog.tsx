"use client";

// Dialog de conexión Culqi (Settings → Integraciones). Mismo patrón que
// el wizard de Nubefact pero de un solo paso: llave pública + llave
// secreta (password) + toggle habilitar. Guarda vía PUT /api/culqi-config
// (solo owner/admin; el secret se cifra server-side con lib/encryption).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  Eye,
  EyeOff,
  FlaskConical,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Si ya hay conexión, el dialog abre en modo edición pre-llenado. */
  initialPublicKey?: string | null;
  initialEnabled?: boolean;
  connected?: boolean;
}

const SECRET_SENTINEL = "••••••••";

export function CulqiSetupDialog({
  open,
  onOpenChange,
  onSaved,
  initialPublicKey,
  initialEnabled,
  connected,
}: Props) {
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-sync cada vez que se abre (edición vs. alta).
  useEffect(() => {
    if (!open) return;
    setPublicKey(initialPublicKey ?? "");
    setSecretKey(connected ? SECRET_SENTINEL : "");
    setEnabled(connected ? (initialEnabled ?? true) : true);
    setShowSecret(false);
  }, [open, initialPublicKey, initialEnabled, connected]);

  const pk = publicKey.trim();
  const sk = secretKey.trim();
  const isTest = pk.startsWith("pk_test_");
  const pkValid = /^pk_(test|live)_/.test(pk);
  const skIsSentinel = connected && sk === SECRET_SENTINEL;
  const skValid = skIsSentinel || /^sk_(test|live)_/.test(sk);
  const sameEnv =
    skIsSentinel ||
    (pkValid &&
      skValid &&
      pk.startsWith("pk_live_") === sk.startsWith("sk_live_"));

  const canSave = pkValid && skValid && sameEnv && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/culqi-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: pk,
          secret_key: sk,
          enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "No se pudo guardar la conexión.");
        return;
      }
      toast.success(
        connected ? "Conexión Culqi actualizada." : "Culqi conectado."
      );
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
              <CreditCard className="h-[18px] w-[18px] text-violet-500" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {connected ? "Editar conexión Culqi" : "Conectar Culqi"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Cobros online con tarjeta o Yape vía links de pago.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Copia tus llaves desde el panel de Culqi (Desarrollo → API
              Keys). Usa las llaves <span className="font-mono">pk_test_</span>{" "}
              / <span className="font-mono">sk_test_</span> para probar sin
              cobros reales, y las <span className="font-mono">_live_</span>{" "}
              cuando estés lista para cobrar de verdad.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="culqi_pk" className="flex items-center gap-2 text-xs font-medium">
              Llave pública (public key) *
              {isTest && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  <FlaskConical className="h-2.5 w-2.5" />
                  Modo prueba
                </span>
              )}
            </label>
            <input
              id="culqi_pk"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="pk_test_..."
              autoComplete="off"
              spellCheck={false}
              className={fieldClass}
            />
            {pk && !pkValid && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Debe empezar con pk_test_ o pk_live_.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="culqi_sk" className="text-xs font-medium">
              Llave secreta (secret key) *
            </label>
            <div className="relative">
              <input
                id="culqi_sk"
                type={showSecret ? "text" : "password"}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                onFocus={() => {
                  // Al tocar el centinela se limpia para escribir la nueva.
                  if (secretKey === SECRET_SENTINEL) setSecretKey("");
                }}
                placeholder="sk_test_..."
                autoComplete="new-password"
                spellCheck={false}
                className={`${fieldClass} pr-9`}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showSecret ? "Ocultar llave" : "Mostrar llave"}
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {sk && !skValid && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Debe empezar con sk_test_ o sk_live_.
              </p>
            )}
            {pkValid && skValid && !sameEnv && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Ambas llaves deben ser del mismo ambiente (test o live).
              </p>
            )}
            {connected && (
              <p className="text-[11px] text-muted-foreground">
                Por seguridad no mostramos la llave guardada. Déjala como
                está para conservarla.
              </p>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-xs font-medium">Habilitar cobros por link</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Apágalo para pausar la creación de nuevos links sin
                desconectar tus llaves.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {connected ? "Guardar cambios" : "Conectar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
