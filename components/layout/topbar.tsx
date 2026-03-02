"use client";

import { useUser } from "@/hooks/use-user";
import { getInitials } from "@/lib/utils";

export function Topbar() {
  const { user, loading } = useUser();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm px-6">
      <div>{/* Breadcrumbs o titulo dinamico */}</div>
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block font-medium">
              {user?.email}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary ring-1 ring-primary/20">
              {user?.email ? getInitials(user.email) : "?"}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
