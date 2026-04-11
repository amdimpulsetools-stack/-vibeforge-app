"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { Clock, Loader2, LogOut, Zap } from "lucide-react";

export default function WaitingForPlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const supabase = createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        // Check membership and subscription
        const { data: member } = await supabase
          .from("organization_members")
          .select("organization_id, role, organizations(name)")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (!member) {
          // No membership — show the page anyway instead of looping
          setLoading(false);
          return;
        }

        // If user is owner, they should be on /select-plan instead
        if (member.role === "owner") {
          router.push("/select-plan");
          return;
        }

        // If org already has an active subscription, go to dashboard
        // Use the same RPC as middleware to ensure consistent trial expiration check
        const { data: session } = await supabase.rpc("get_user_session_check", {
          p_user_id: user.id,
        });

        const hasActiveSubscription = Array.isArray(session) && session.length > 0
          ? session[0]?.has_active_subscription === true
          : (session as { has_active_subscription?: boolean } | null)?.has_active_subscription === true;

        if (hasActiveSubscription) {
          router.push("/dashboard");
          return;
        }

        const org = member.organizations as unknown as { name: string } | null;
        setOrgName(org?.name ?? null);
        setLoading(false);
      } catch {
        // On any error, stop loading and show the page content
        setLoading(false);
      }
    };

    init();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold">{APP_NAME}</span>
        </div>

        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
          <Clock className="h-8 w-8 text-amber-500" />
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Acceso temporalmente suspendido
        </h1>
        <p className="text-muted-foreground mb-2">
          {orgName ? (
            <>
              La suscripción de <span className="font-semibold text-foreground">{orgName}</span> ha
              expirado o aún no ha sido activada.
            </>
          ) : (
            "La suscripción de tu organización ha expirado o no ha sido activada."
          )}
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          El administrador de tu organización debe renovar o activar el plan
          para que puedas acceder al sistema. Contacta a tu administrador para
          más información.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            Verificar de nuevo
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
