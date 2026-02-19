"use client";

import { useUser } from "@/hooks/use-user";
import { getInitials } from "@/lib/utils";

export function Topbar() {
  const { user, loading } = useUser();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div>{/* Breadcrumbs o título dinámico */}</div>
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {user?.email ? getInitials(user.email) : "?"}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
