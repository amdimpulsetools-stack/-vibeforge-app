"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  Copy,
  Download,
  RefreshCw,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MfaEnrollDialog } from "@/components/auth/mfa-enroll-dialog";

// ============================================================
// /account/security
//
// Owner/admin only (gated by the status endpoint — doctor/recep
// would see a 403 and the empty state). Three UI states:
//
//   - not enrolled: Card with explainer + "Activar 2FA" button.
//     Click → MfaEnrollDialog runs the 3-step flow.
//
//   - enrolled: Card with status + recovery-codes count +
//     "Regenerar códigos" + "Desactivar 2FA" buttons.
//
//   - loading: skeleton.
// ============================================================

interface MfaStatus {
  enrolled: boolean;
  factor_id: string | null;
  recovery_codes_active: number;
}

export default function SecurityPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/status");
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        toast.error("No se pudo cargar el estado de 2FA");
        setLoading(false);
        return;
      }
      setStatus((await res.json()) as MfaStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDisable = async () => {
    if (!status?.factor_id) return;
    const ok = await confirm({
      title: "¿Desactivar 2FA?",
      description:
        "Tu cuenta volverá a tener solo contraseña como autenticación. Podés volver a activarlo después.",
      confirmText: "Desactivar",
      variant: "destructive",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const supabase = createClient();
      // unenroll requires AAL2 (Supabase enforces). The user is
      // currently AAL2 because they passed the TOTP at login.
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: status.factor_id,
      });
      if (error) {
        toast.error("No se pudo desactivar 2FA: " + error.message);
        return;
      }
      toast.success("2FA desactivado");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    const ok = await confirm({
      title: "¿Regenerar códigos de recuperación?",
      description:
        "Los códigos viejos dejarán de funcionar inmediatamente. Solo vas a ver los nuevos UNA vez.",
      confirmText: "Regenerar",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/recovery-codes", { method: "POST" });
      if (!res.ok) {
        toast.error("No se pudieron regenerar los códigos");
        return;
      }
      const data = (await res.json()) as { codes: string[] };
      setRegeneratedCodes(data.codes);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = () => {
    if (!regeneratedCodes) return;
    void navigator.clipboard.writeText(regeneratedCodes.join("\n"));
    toast.success("Códigos copiados");
  };

  const downloadCodes = () => {
    if (!regeneratedCodes) return;
    const text = `Códigos de recuperación de 2FA — Yenda\nRegenerados: ${new Date().toLocaleString("es-PE")}\n\n${regeneratedCodes.map((c, i) => `${(i + 1).toString().padStart(2, " ")}.  ${c}`).join("\n")}\n`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yenda-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (forbidden) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <ShieldOff className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-1">2FA aún no disponible para tu rol</h1>
          <p className="text-sm text-muted-foreground">
            En esta versión, la autenticación de dos factores solo puede activarse para
            usuarios con rol Owner o Admin. Si necesitás 2FA, pedile al owner de tu
            organización que te promueva o avisanos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          Seguridad de la cuenta
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Activá la autenticación de dos factores (2FA) para proteger tu cuenta.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : status?.enrolled ? (
        <>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold">2FA activado</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Tu cuenta requiere un código de tu app de autenticación al iniciar sesión.
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Códigos de recuperación restantes:
                  </span>
                  <span
                    className={`font-medium ${
                      status.recovery_codes_active < 3 ? "text-amber-500" : "text-foreground"
                    }`}
                  >
                    {status.recovery_codes_active} / 10
                  </span>
                  {status.recovery_codes_active < 3 && (
                    <span className="text-amber-500 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> regenerá pronto
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
            <h3 className="font-medium">Gestionar 2FA</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={busy}
                className="flex-1"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerar códigos de recuperación
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable}
                disabled={busy}
                className="flex-1 text-red-500 hover:text-red-500 hover:bg-red-500/10"
              >
                <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                Desactivar 2FA
              </Button>
            </div>
          </div>

          {/* Regenerated codes are shown once, inline, like the
              first-time-enroll flow. The dialog is overkill since
              the surrounding context (the security page) already
              tells the user what these are. */}
          {regeneratedCodes && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <h3 className="font-semibold">Códigos nuevos generados</h3>
                  <p className="text-xs text-muted-foreground">
                    Solo los vas a ver UNA vez. Copiá o descargá ahora.
                  </p>
                </div>
              </div>
              <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm bg-card rounded-lg p-3 mb-3">
                {regeneratedCodes.map((c, i) => (
                  <li key={c}>
                    <span className="text-muted-foreground mr-1">
                      {(i + 1).toString().padStart(2, "0")}.
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyCodes} className="flex-1">
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                </Button>
                <Button variant="outline" size="sm" onClick={downloadCodes} className="flex-1">
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Descargar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setRegeneratedCodes(null)}
                  className="flex-1"
                >
                  Listo
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
              <ShieldOff className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">2FA no está activado</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Cuando lo activás, vas a necesitar tu app de autenticación cada vez que
                inicies sesión. Es la forma más fuerte de proteger tu cuenta.
              </p>
            </div>
          </div>

          <ul className="text-xs text-muted-foreground space-y-1 mb-4 pl-3">
            <li>• Compatible con Google Authenticator, 1Password, Authy y similares</li>
            <li>• Recibís 10 códigos de respaldo en caso de pérdida del dispositivo</li>
            <li>• Podés desactivarlo cuando quieras desde esta misma pantalla</li>
          </ul>

          <Button onClick={() => setEnrollOpen(true)} className="w-full sm:w-auto">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Activar 2FA
          </Button>
        </div>
      )}

      <MfaEnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onCompleted={() => {
          toast.success("2FA activado");
          void load();
        }}
      />
    </div>
  );
}
