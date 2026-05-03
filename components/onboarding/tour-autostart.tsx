"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTour } from "@/components/onboarding/tour-provider";
import { useOrgRole } from "@/hooks/use-org-role";

const MOBILE_BREAKPOINT = 768;
const TRIGGER_DELAY_MS = 800;

export function TourAutostart() {
  const pathname = usePathname();
  const { isOwner, loading } = useOrgRole();
  const { startTour, tourCompleted } = useTour();

  useEffect(() => {
    if (loading) return;
    if (tourCompleted) return;
    if (!isOwner) return;
    if (pathname !== "/dashboard") return;
    if (typeof window === "undefined") return;
    if (window.innerWidth < MOBILE_BREAKPOINT) return;

    const id = window.setTimeout(() => {
      void startTour();
    }, TRIGGER_DELAY_MS);

    return () => window.clearTimeout(id);
  }, [loading, tourCompleted, isOwner, pathname, startTour]);

  return null;
}
