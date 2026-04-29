"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

import { YendaLogo } from "@/components/icons/yenda-logo";
import { Checkbox } from "@/components/ui/checkbox";
import { TERMS_VERSION } from "@/lib/constants";

export default function AcceptTermsPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AcceptTermsPage />
    </Suspense>
  );
}

function AcceptTermsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next") ?? "/onboarding";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/onboarding";

  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!accepted) {
      const msg = "Debes aceptar los Términos y la Política de Privacidad para continuar";
      setError(msg);
      toast.error(msg);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedTerms: true, termsVersion: TERMS_VERSION }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "No pudimos registrar tu aceptación");
        setSubmitting(false);
        return;
      }
      router.push(next);
    } catch {
      toast.error("Sin conexión. Intenta de nuevo.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <YendaLogo width={140} priority />
        </div>

        <div className="glass-card rounded-2xl p-7 shadow-xl space-y-5">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Antes de continuar
            </h1>
            <p className="text-sm text-muted-foreground">
              Para usar Yenda necesitamos que revises y aceptes nuestros documentos legales.
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-4">
            <Link
              href="/terms"
              target="_blank"
              className="block text-sm font-medium text-primary hover:underline"
            >
              Términos y Condiciones →
            </Link>
            <Link
              href="/privacy"
              target="_blank"
              className="block text-sm font-medium text-primary hover:underline"
            >
              Política de Privacidad →
            </Link>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="acceptTerms"
              className="flex items-start gap-2.5 cursor-pointer select-none"
            >
              <Checkbox
                id="acceptTerms"
                checked={accepted}
                onCheckedChange={(v) => {
                  setAccepted(v);
                  if (v) setError(null);
                }}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                He leído y acepto los{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-primary font-medium hover:underline"
                >
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-primary font-medium hover:underline"
                >
                  Política de Privacidad
                </Link>
                .
              </span>
            </label>
            {error && <p className="text-xs text-red-500 pl-6">{error}</p>}
          </div>

          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aceptar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}
