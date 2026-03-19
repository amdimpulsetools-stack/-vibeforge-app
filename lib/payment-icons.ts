import {
  Banknote,
  CreditCard,
  Smartphone,
  Building2,
  Landmark,
  Link2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the `icon` field stored in lookup_values to a Lucide icon component.
 * Admins pick icon names when adding payment methods via lookups panel.
 * Falls back to Wallet for unknown/missing icons.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Banknote,
  CreditCard,
  Smartphone,
  Building2,
  Landmark,
  Link2,
  Wallet,
};

export function getPaymentIcon(iconName?: string | null): LucideIcon {
  if (!iconName) return Wallet;
  return ICON_MAP[iconName] ?? Wallet;
}
