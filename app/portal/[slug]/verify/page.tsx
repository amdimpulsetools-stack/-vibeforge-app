"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function PortalVerifyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Enlace inválido");
      return;
    }

    async function verify() {
      try {
        const res = await fetch("/api/portal/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, slug }),
        });

        let data: Record<string, unknown> = {};
        try {
          data = await res.json();
        } catch {
          // non-JSON response
        }

        if (!res.ok) {
          setStatus("error");
          const messages: Record<string, string> = {
            invalid_token: "Enlace inválido o expirado",
            token_used: "Este enlace ya fue utilizado",
            token_expired: "Este enlace ha expirado. Solicita uno nuevo.",
          };
          setErrorMsg(messages[data.error as string] || "Error al verificar");
          return;
        }

        setStatus("success");

        setTimeout(() => {
          if (data.needs_registration) {
            router.replace(`/portal/${slug}/registro`);
          } else {
            router.replace(`/portal/${slug}/mis-citas`);
          }
        }, 1200);
      } catch {
        setStatus("error");
        setErrorMsg("Sin conexión. Revisa tu internet e intenta otra vez.");
      }
    }

    verify();
  }, [token, slug, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm"
      >
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-500" />
            <p className="text-sm text-zinc-500">Verificando acceso...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Acceso verificado</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Redirigiendo al portal...
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Error</h2>
              <p className="mt-1 text-sm text-zinc-500">{errorMsg}</p>
            </div>
            <button
              onClick={() => router.push(`/portal/${slug}`)}
              className="rounded-xl bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
