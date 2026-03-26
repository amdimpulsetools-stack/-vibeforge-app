import { cn } from "@/lib/utils";
import type { AvatarOption } from "@/hooks/use-user-avatar";

interface SilhouetteProps {
  className?: string;
}

/** Male doctor with stethoscope silhouette */
function DoctorMaleSvg({ className }: SilhouetteProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Head */}
      <circle cx="32" cy="20" r="10" fill="currentColor" opacity="0.8" />
      {/* Body */}
      <path d="M18 52c0-11 6.3-16 14-16s14 5 14 16" fill="currentColor" opacity="0.6" />
      {/* Stethoscope */}
      <path d="M26 36c-2 2-4 6-4 10" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" />
      <circle cx="22" cy="46" r="2" fill="currentColor" opacity="0.4" />
      {/* Collar */}
      <path d="M27 36l5-2 5 2" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.5" />
    </svg>
  );
}

/** Female doctor silhouette */
function DoctorFemaleSvg({ className }: SilhouetteProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Hair */}
      <ellipse cx="32" cy="18" rx="12" ry="13" fill="currentColor" opacity="0.4" />
      {/* Head */}
      <circle cx="32" cy="20" r="10" fill="currentColor" opacity="0.8" />
      {/* Body */}
      <path d="M18 52c0-11 6.3-16 14-16s14 5 14 16" fill="currentColor" opacity="0.6" />
      {/* Cross badge */}
      <rect x="30" y="40" width="4" height="8" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="28" y="42" width="8" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

/** Admin/manager silhouette */
function AdminSvg({ className }: SilhouetteProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Head */}
      <circle cx="32" cy="20" r="10" fill="currentColor" opacity="0.8" />
      {/* Body with suit */}
      <path d="M18 52c0-11 6.3-16 14-16s14 5 14 16" fill="currentColor" opacity="0.6" />
      {/* Tie */}
      <path d="M32 34l-2 4 2 8 2-8-2-4z" fill="currentColor" opacity="0.4" />
      {/* Lapels */}
      <path d="M28 34l-4 8" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35" />
      <path d="M36 34l4 8" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35" />
    </svg>
  );
}

/** Receptionist silhouette */
function ReceptionistSvg({ className }: SilhouetteProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Hair */}
      <ellipse cx="32" cy="17" rx="11" ry="12" fill="currentColor" opacity="0.4" />
      {/* Head */}
      <circle cx="32" cy="20" r="10" fill="currentColor" opacity="0.8" />
      {/* Body */}
      <path d="M18 52c0-11 6.3-16 14-16s14 5 14 16" fill="currentColor" opacity="0.6" />
      {/* Headset */}
      <path d="M22 18c0-6 4.5-10 10-10s10 4 10 10" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35" />
      <rect x="20" y="16" width="3" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
      {/* Mic */}
      <path d="M20 22c-2 2-2 4-1 5" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
    </svg>
  );
}

const SILHOUETTE_MAP: Record<AvatarOption, React.FC<SilhouetteProps>> = {
  "doctor-male": DoctorMaleSvg,
  "doctor-female": DoctorFemaleSvg,
  admin: AdminSvg,
  receptionist: ReceptionistSvg,
};

export const AVATAR_OPTIONS: { key: AvatarOption; label: string }[] = [
  { key: "doctor-male", label: "Doctor" },
  { key: "doctor-female", label: "Doctora" },
  { key: "admin", label: "Administrador" },
  { key: "receptionist", label: "Recepcionista" },
];

interface AvatarSilhouetteProps {
  option: AvatarOption;
  className?: string;
}

export function AvatarSilhouette({ option, className }: AvatarSilhouetteProps) {
  const Component = SILHOUETTE_MAP[option];
  if (!Component) return null;
  return <Component className={cn("text-emerald-600 dark:text-emerald-400", className)} />;
}
