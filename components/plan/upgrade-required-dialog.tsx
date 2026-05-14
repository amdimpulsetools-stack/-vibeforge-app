"use client";

import { useRouter } from "next/navigation";
import { ArrowUpCircle, ShoppingCart, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ============================================================
// UpgradeRequiredDialog — soft-wall modal for plan limit hits.
//
// Triggered when an API endpoint returns 402 with the standard
// `plan_limit_reached` body. Shows two CTAs: subir plan (full
// tier upgrade) and comprar cupo extra (per-unit addon, only
// when the org's plan supports it).
//
// Copy is concrete — surfaces current/max + plan name so the
// user understands exactly why they hit the wall.
// ============================================================

export interface PlanLimitInfo {
  resource: string;
  current: number;
  max: number;
  plan_name: string;
  addon_available: boolean;
  upgrade_url?: string;
  addon_url?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: PlanLimitInfo;
}

const RESOURCE_COPY: Record<
  string,
  { noun: string; pluralNoun: string; verb: string }
> = {
  members: { noun: "miembro", pluralNoun: "miembros", verb: "agregar" },
  doctors: { noun: "doctor", pluralNoun: "doctores", verb: "agregar" },
  doctor_members: {
    noun: "doctor",
    pluralNoun: "doctores",
    verb: "agregar",
  },
  admins: { noun: "admin", pluralNoun: "admins", verb: "agregar" },
  receptionists: {
    noun: "recepcionista",
    pluralNoun: "recepcionistas",
    verb: "agregar",
  },
  offices: { noun: "consultorio", pluralNoun: "consultorios", verb: "crear" },
};

export function UpgradeRequiredDialog({ open, onOpenChange, info }: Props) {
  const router = useRouter();
  const copy = RESOURCE_COPY[info.resource] ?? {
    noun: "recurso",
    pluralNoun: "recursos",
    verb: "agregar",
  };

  const goUpgrade = () => {
    router.push(info.upgrade_url ?? "/plans");
  };

  const goAddons = () => {
    router.push(info.addon_url ?? "/account");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
            <Lock className="h-6 w-6 text-amber-500" />
          </div>
          <DialogTitle className="text-center">
            Alcanzaste el límite de tu plan
          </DialogTitle>
          <DialogDescription className="text-center">
            Tu <strong>{info.plan_name}</strong> permite hasta{" "}
            <strong>
              {info.max} {info.max === 1 ? copy.noun : copy.pluralNoun}
            </strong>
            . Ya tenés {info.current} en uso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <Button onClick={goUpgrade} className="w-full" size="lg">
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Subir de plan
          </Button>

          {info.addon_available && (
            <Button
              onClick={goAddons}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Comprar cupo extra
            </Button>
          )}

          <Button
            onClick={() => onOpenChange(false)}
            variant="ghost"
            className="w-full"
            size="sm"
          >
            Cancelar
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          {info.addon_available
            ? "Subir de plan te da más cupos de varios tipos. Comprar cupo extra es más barato si solo necesitás 1 o 2 más."
            : "Tu plan actual no permite comprar cupos extra para este recurso. Tenés que subir de plan."}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper to extract a PlanLimitInfo from a 402 response body.
 * Returns null if the body isn't shaped like a plan_limit_reached
 * error — caller should fall back to generic toast handling.
 */
export function parsePlanLimitError(body: unknown): PlanLimitInfo | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.error !== "plan_limit_reached") return null;
  if (
    typeof b.resource !== "string" ||
    typeof b.current !== "number" ||
    typeof b.max !== "number" ||
    typeof b.plan_name !== "string"
  ) {
    return null;
  }
  return {
    resource: b.resource,
    current: b.current,
    max: b.max,
    plan_name: b.plan_name,
    addon_available: !!b.addon_available,
    upgrade_url: typeof b.upgrade_url === "string" ? b.upgrade_url : "/plans",
    addon_url: typeof b.addon_url === "string" ? b.addon_url : "/account",
  };
}
