"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Copy, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ============================================================
// MfaEnrollDialog
//
// Three-step flow:
//   1. enroll  — request QR + secret from Supabase, render
//   2. verify  — user types the 6-digit code from auth app
//   3. backup  — show plaintext recovery codes ONCE
//
// On any close before step 3 completes, the half-enrolled
// factor is left behind. Supabase auto-expires unverified
// factors after ~5 min so this is fine; the parent can call
// onCancelled() if it wants to refetch state.
// ============================================================

type Step = "enroll" | "verify" | "backup";

interface EnrollData {
  factorId: string;
  qrCode: string; // SVG data URL from Supabase
  secret: string; // base32 for manual entry
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the user finishes the entire flow (codes shown). */
  onCompleted: () => void;
}

export function MfaEnrollDialog({ open, onOpenChange, onCompleted }: Props) {
  const [step, setStep] = useState<Step>("enroll");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // Reset state every time the dialog opens — otherwise re-opening
  // after a previous flow shows stale codes/QR.
  useEffect(() => {
    if (open) {
      setStep("enroll");
      setEnroll(null);
      setCode("");
      setError(null);
      setRecoveryCodes([]);
      void startEnroll();
    }
  }, [open]);

  const startEnroll = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // Clean up any prior unverified factors first — Supabase
    // accepts only one factor per friendlyName, and if a previous
    // enroll was abandoned the call would 422.
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.totp ?? []) {
        if (f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
    } catch {
      // best effort
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Yenda",
    });
    if (enrollError || !data) {
      setError(enrollError?.message ?? "No se pudo iniciar la configuración.");
      setLoading(false);
      return;
    }
    setEnroll({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setStep("verify");
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!enroll || code.length !== 6) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? "No se pudo generar el desafío.");
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verifyError) {
      setError("Código inválido. Verificá que escribiste los 6 dígitos actuales de tu app.");
      setLoading(false);
      return;
    }

    // Factor is now verified. Generate recovery codes server-side.
    const res = await fetch("/api/auth/mfa/recovery-codes", { method: "POST" });
    if (!res.ok) {
      setError(
        "Activaste 2FA pero no pudimos generar los códigos de respaldo. Andá a /account/security y regenerá.",
      );
      setLoading(false);
      // Still advance — the user has working MFA, they just don't
      // have recovery codes yet. Better than blocking them.
      setStep("backup");
      return;
    }
    const data = (await res.json()) as { codes: string[] };
    setRecoveryCodes(data.codes);
    setStep("backup");
    setLoading(false);
  };

  const copyCodes = () => {
    void navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success("Códigos copiados");
  };

  const downloadCodes = () => {
    const text = `Códigos de recuperación de 2FA — Yenda
Generados: ${new Date().toLocaleString("es-PE")}

Guardá estos códigos en un lugar seguro. Cada uno se usa UNA SOLA VEZ.
Si perdés acceso a tu app de autenticación, usá cualquiera de ellos
para iniciar sesión y reconfigurar 2FA.

${recoveryCodes.map((c, i) => `${(i + 1).toString().padStart(2, " ")}.  ${c}`).join("\n")}
`;
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

  const finish = () => {
    onCompleted();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          // Don't lose the recovery codes by accidental click-out.
          if (step === "backup") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (step === "backup") e.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
          </div>
          <DialogTitle className="text-center">
            {step === "enroll" && "Configurando 2FA…"}
            {step === "verify" && "Escaneá el código QR"}
            {step === "backup" && "Guardá tus códigos de recuperación"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === "verify" &&
              "Abrí Google Authenticator, 1Password, Authy o similar, escaneá el QR y escribí el código que aparece."}
            {step === "backup" &&
              "Solo vas a ver estos códigos UNA VEZ. Guardalos en un lugar seguro — los necesitás si perdés tu dispositivo."}
          </DialogDescription>
        </DialogHeader>

        {/* ── enroll ─────────────────────────────────────────── */}
        {step === "enroll" && (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── verify ─────────────────────────────────────────── */}
        {step === "verify" && enroll && (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border border-border bg-white p-4">
              <img src={enroll.qrCode} alt="QR de 2FA" width={180} height={180} />
            </div>
            <div className="text-center text-xs text-muted-foreground">
              ¿No podés escanear? Ingresá esta clave manualmente:
              <code className="block mt-1 font-mono text-[11px] text-foreground/80 break-all">
                {enroll.secret}
              </code>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Código de 6 dígitos
              </label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg tracking-[0.3em] font-mono"
                autoFocus
              />
            </div>
            {error && (
              <p className="flex items-center gap-2 text-xs text-red-500">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </p>
            )}
            <Button
              onClick={handleVerify}
              disabled={code.length !== 6 || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Verificando…
                </>
              ) : (
                "Verificar y activar"
              )}
            </Button>
          </div>
        )}

        {/* ── backup codes ───────────────────────────────────── */}
        {step === "backup" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm">
                {recoveryCodes.map((c, i) => (
                  <li key={c} className="text-foreground/80">
                    <span className="text-muted-foreground mr-1">
                      {(i + 1).toString().padStart(2, "0")}.
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyCodes} className="flex-1">
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
              </Button>
              <Button variant="outline" size="sm" onClick={downloadCodes} className="flex-1">
                <Download className="h-3.5 w-3.5 mr-1.5" /> Descargar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Cada código se puede usar UNA sola vez. Tratalos como contraseñas: no los
              compartas ni los guardes en un chat.
            </p>
            <Button onClick={finish} className="w-full">
              Listo, los guardé
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
