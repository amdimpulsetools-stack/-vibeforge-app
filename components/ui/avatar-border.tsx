"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarSilhouette } from "@/components/ui/avatar-silhouettes";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvatarOption } from "@/hooks/use-user-avatar";

interface BorderAvatarProps {
  src?: string | null;
  avatarOption?: AvatarOption | null;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
  verified?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
};

const badgeSizeClasses = {
  sm: "size-3.5 -right-1 -bottom-1",
  md: "size-4 -right-1.5 -bottom-1.5",
  lg: "size-5 -right-1.5 -bottom-1.5",
};

const badgeIconClasses = {
  sm: "size-2",
  md: "size-3",
  lg: "size-3.5",
};

const silhouetteSizeClasses = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

export function BorderAvatar({
  src,
  avatarOption,
  alt = "avatar",
  fallback,
  size = "md",
  verified = false,
  className,
}: BorderAvatarProps) {
  const initials = fallback
    || (alt
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase())
    || "?";

  return (
    <div className={cn("relative w-fit", className)}>
      <Avatar
        className={cn(
          "ring-offset-background ring-2 ring-emerald-600 ring-offset-2 dark:ring-emerald-400",
          sizeClasses[size],
        )}
      >
        {src && (
          <AvatarImage
            src={src}
            alt={alt}
          />
        )}
        <AvatarFallback className="text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          {avatarOption ? (
            <AvatarSilhouette option={avatarOption} className={silhouetteSizeClasses[size]} />
          ) : (
            initials
          )}
        </AvatarFallback>
      </Avatar>
      {verified && (
        <span
          className={cn(
            "absolute inline-flex items-center justify-center rounded-full bg-emerald-600 dark:bg-emerald-400",
            badgeSizeClasses[size],
          )}
        >
          <CheckIcon className={cn("text-white", badgeIconClasses[size])} />
        </span>
      )}
    </div>
  );
}

export default BorderAvatar;
