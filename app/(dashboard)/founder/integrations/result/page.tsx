"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Loader2,
  Crown,
} from "lucide-react";

const STATUS_CONFIG = {
  approved: {
    icon: CheckCircle2,
    title: "Pago aprobado",
    description: "La transacción de prueba se completó exitosamente.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  pending: {
    icon: Clock,
    title: "Pago pendiente",
    description: "La transacción está pendiente de confirmación.",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  rejected: {
    icon: XCircle,
    title: "Pago rechazado",
    description: "La transacción fue rechazada. Intenta con otra tarjeta de prueba.",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
} as const;

export default function PaymentResultPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  const status = (searchParams.get("status") || "rejected") as keyof typeof STATUS_CONFIG;
  const paymentId = searchParams.get("payment_id");
  const externalReference = searchParams.get("external_reference");
  const preferenceId = searchParams.get("preference_id");

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.rejected;
  const Icon = config.icon;

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const check = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_profiles")
        .select("is_founder")
        .eq("id", user.id)
        .single();

      if (!data?.is_founder) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      setLoading(false);
    };
    check();
  }, [user, userLoading, router]);

  if (loading || !authorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Status icon */}
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${config.bgColor}`}>
          <Icon className={`h-10 w-10 ${config.color}`} />
        </div>

        {/* Title & description */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {config.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>

        {/* Transaction details */}
        <div className={`rounded-2xl border ${config.borderColor} bg-card p-5 text-left space-y-3`}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Detalles de la transacción
          </h3>
          {paymentId && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment ID</span>
              <span className="font-mono text-xs">{paymentId}</span>
            </div>
          )}
          {preferenceId && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Preference ID</span>
              <span className="font-mono text-xs">{preferenceId}</span>
            </div>
          )}
          {externalReference && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Referencia</span>
              <span className="font-mono text-xs truncate max-w-[200px]">
                {externalReference}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Estado</span>
            <span className={`font-semibold ${config.color}`}>
              {config.title}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/founder/integrations"
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a integraciones
          </Link>
          <Link
            href="/founder"
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <Crown className="h-4 w-4" />
            Ir al Founder Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
