"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const STORAGE_KEY = "yenda_welcome_toast_seen";

interface WelcomeInvitedToastProps {
  role: "owner" | "admin" | "doctor" | "receptionist";
}

/**
 * Shows a one-time welcome toast to invited members (non-owners) the first
 * time they reach the dashboard. Owners completed their own onboarding flow,
 * so they are excluded.
 */
export function WelcomeInvitedToast({ role }: WelcomeInvitedToastProps) {
  const router = useRouter();

  useEffect(() => {
    if (role === "owner") return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;

    window.localStorage.setItem(STORAGE_KEY, "1");

    toast.info("¡Bienvenido a Yenda!", {
      description:
        "Completa tu perfil en Mi Cuenta para personalizar tu experiencia.",
      duration: 8000,
      action: {
        label: "Ir a Mi Cuenta",
        onClick: () => router.push("/account"),
      },
    });
  }, [role, router]);

  return null;
}
