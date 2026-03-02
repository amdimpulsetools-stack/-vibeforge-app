"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Zap, Check, Stethoscope } from "lucide-react";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_members: number;
  max_doctors: number;
  max_offices: number;
  max_patients: number;
  max_appointments_per_month: number;
  has_reports: boolean;
}

export default function SelectPlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; full_name?: string } | null>(null);
  const [orgName, setOrgName] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "callback") {
      toast.success("Procesando tu pago... Te redirigiremos pronto.");
      // Dar tiempo para que el webhook procese
      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
      return;
    }

    loadData();
  }, [searchParams, router]);

  async function loadData() {
    const supabase = createClient();

    // Verificar usuario autenticado
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      router.push("/login");
      return;
    }
    setUser({
      id: authUser.id,
      email: authUser.email ?? "",
      full_name: authUser.user_metadata?.full_name,
    });
    setOrgName(`Clínica de ${authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || ""}`);

    // Cargar plan Independiente
    const { data: plans } = await supabase
      .from("plans")
      .select("*")
      .eq("slug", "independiente")
      .eq("is_active", true)
      .single();

    if (plans) {
      setPlan(plans);
    }

    setLoading(false);
  }

  async function handleCheckout() {
    if (!plan || !user) return;

    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/mercadopago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.id,
          billing_cycle: "monthly",
          org_name: orgName.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al crear checkout");
      }

      // Redirigir a Mercado Pago
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al procesar el pago"
      );
      setCheckoutLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const paymentStatus = searchParams.get("payment");
  if (paymentStatus === "callback") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-bold">Procesando tu pago...</h2>
          <p className="text-muted-foreground">
            Te redirigiremos al dashboard en un momento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecciona tu plan para comenzar
          </p>
        </div>

        {/* Plan Card */}
        {plan && (
          <div className="rounded-xl border-2 border-primary bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>
            </div>

            {/* Precio */}
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">
                  S/{Number(plan.price_monthly).toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Precio de prueba
              </p>
            </div>

            {/* Features */}
            <ul className="space-y-2.5 mb-6">
              <Feature text={`${plan.max_members} miembro`} />
              <Feature text={`${plan.max_doctors} doctor`} />
              <Feature text={`${plan.max_offices} consultorio`} />
              <Feature text={`Hasta ${plan.max_patients} pacientes`} />
              <Feature
                text={`${plan.max_appointments_per_month} citas/mes`}
              />
              {plan.has_reports && <Feature text="Reportes básicos" />}
            </ul>

            {/* Nombre de organización */}
            <div className="space-y-2 mb-4">
              <label htmlFor="org-name" className="text-sm font-medium">
                Nombre de tu clínica / consultorio
              </label>
              <input
                id="org-name"
                type="text"
                placeholder="Ej: Clínica DermoSalud"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Botón de checkout */}
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || !orgName.trim()}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {checkoutLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {checkoutLoading ? "Redirigiendo a Mercado Pago..." : "Suscribirme con Mercado Pago"}
            </button>
          </div>
        )}

        {!plan && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-muted-foreground">
              No hay planes disponibles. Ejecuta la migración SQL primero.
            </p>
          </div>
        )}

        {/* Skip link */}
        <p className="text-center text-sm text-muted-foreground">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-primary hover:underline"
          >
            Continuar sin plan (modo gratuito)
          </button>
        </p>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <Check className="h-4 w-4 text-primary shrink-0" />
      <span>{text}</span>
    </li>
  );
}
