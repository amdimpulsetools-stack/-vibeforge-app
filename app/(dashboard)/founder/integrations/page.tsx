"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { formatCurrency } from "@/lib/utils";
import {
  Crown,
  CreditCard,
  Loader2,
  ExternalLink,
  Zap,
  CheckCircle2,
} from "lucide-react";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
}

export default function FounderIntegrationsPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creatingPreference, setCreatingPreference] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const init = async () => {
      const supabase = createClient();

      // Check founder
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_founder")
        .eq("id", user.id)
        .single();

      if (!profile?.is_founder) {
        router.push("/dashboard");
        return;
      }

      setAuthorized(true);

      // Fetch plans
      const { data: plansData } = await supabase
        .from("plans")
        .select("id, slug, name, description, price_monthly, price_yearly, currency")
        .eq("is_active", true)
        .order("display_order");

      setPlans(plansData ?? []);
      setLoading(false);
    };

    init();
  }, [user, userLoading, router]);

  const handleSubscribe = async (planId: string) => {
    setCreatingPreference(planId);

    try {
      const res = await fetch("/api/mercadopago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error}`);
        setCreatingPreference(null);
        return;
      }

      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert("No checkout URL returned");
        setCreatingPreference(null);
      }
    } catch (err) {
      alert("Network error");
      setCreatingPreference(null);
    }
  };

  if (loading || !authorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
          <Crown className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Integraciones
          </h1>
          <p className="text-muted-foreground">
            Prueba de suscripciones — Mercado Pago
          </p>
        </div>
      </div>

      {/* Test mode banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
        <Zap className="h-5 w-5 text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Modo de prueba</p>
          <p className="text-xs text-muted-foreground">
            Estás usando credenciales de test de Mercado Pago. Los pagos no son
            reales. Usa tarjetas de prueba de MP para simular transacciones.
          </p>
        </div>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Facturación:</span>
        <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              billingCycle === "monthly"
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mensual
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              billingCycle === "yearly"
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Anual
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const price =
            billingCycle === "yearly" && plan.price_yearly
              ? plan.price_yearly
              : plan.price_monthly;
          const isCreating = creatingPreference === plan.id;

          return (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-primary/40"
            >
              <div className="mb-4">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                {plan.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.description}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <span className="text-3xl font-extrabold">
                  {plan.currency === "PEN" ? "S/" : "$"}
                  {price}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{billingCycle === "yearly" ? "año" : "mes"}
                </span>
              </div>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={isCreating || creatingPreference !== null}
                className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando suscripción...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    Suscribirse
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <h3 className="text-sm font-bold mb-3 uppercase tracking-widest text-muted-foreground">
          Tarjetas de prueba de Mercado Pago
        </h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-foreground">Aprobada:</strong> 5031 7557 3453 0604 — CVV: 123 — Vto: 11/25
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong className="text-foreground">Pendiente:</strong> 5031 7557 3453 0604 — CVV: 123 — Vto: 11/25 (DNI: 12345678)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-red-400 shrink-0" />
            <span>
              <strong className="text-foreground">Rechazada:</strong> 5031 7557 3453 0604 — CVV: 456 — Vto: 11/25
            </span>
          </div>
          <p className="mt-3 text-xs">
            Nombre y documento: cualquier valor. Más info en la{" "}
            <a
              href="https://www.mercadopago.com.pe/developers/es/docs/checkout-pro/test-integration/test-cards"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              documentación de MP <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
