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

        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          const messages: Record<string, string> = {
            invalid_token: "Enlace inválido o expirado",
            token_used: "Este enlace ya fue utilizado",
            token_expired: "Este enlace ha expirado. Solicita uno nuevo.",
          };
          setErrorMsg(messages[data.error] || "Error al verificar");
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
        setErrorMsg("Error de conexión");
      }
    }

    verify();
  }, [token, slug, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center backdrop-blur-sm"
      >
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-500" />
            <p className="text-sm text-zinc-400">Verificando acceso...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Acceso verificado</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Redirigiendo al portal...
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
              <XCircle className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Error</h2>
              <p className="mt-1 text-sm text-zinc-400">{errorMsg}</p>
            </div>
            <button
              onClick={() => router.push(`/portal/${slug}`)}
              className="rounded-xl bg-zinc-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
