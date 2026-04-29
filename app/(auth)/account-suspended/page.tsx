"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { Loader2, LogOut, ShieldOff } from "lucide-react";
import { YendaLogo } from "@/components/icons/yenda-logo";

export default function AccountSuspendedPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8" aria-label={APP_NAME}>
          <YendaLogo width={140} priority />
        </div>

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldOff className="h-8 w-8 text-destructive" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-3">
          Tu cuenta ha sido suspendida
        </h1>
        <p className="text-sm text-muted-foreground mb-2">
          Un administrador desactivó tu acceso a esta organización. No podrás
          ingresar al sistema hasta que tu acceso sea reactivado.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Si crees que es un error, contacta al administrador de tu
          organización o escríbenos a{" "}
          <a
            href="mailto:soporte@yenda.app"
            className="text-primary hover:underline"
          >
            soporte@yenda.app
          </a>
          .
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
