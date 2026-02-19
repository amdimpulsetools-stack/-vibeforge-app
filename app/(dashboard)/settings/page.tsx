"use client";

import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";

export default function SettingsPage() {
  const { user, loading } = useUser();
  const { theme, toggleTheme } = useTheme();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Administra tu cuenta y preferencias
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profile Section */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Perfil</h2>
          <div className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">Email</span>
              <p className="text-sm font-medium">{user?.email}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Nombre</span>
              <p className="text-sm font-medium">
                {user?.user_metadata?.full_name || "Sin nombre"}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">ID</span>
              <p className="text-xs font-mono text-muted-foreground">
                {user?.id}
              </p>
            </div>
          </div>
        </div>

        {/* Theme Section */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-2">Apariencia</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Elige el tema visual de la aplicación
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Dark option */}
            <button
              onClick={() => theme === "light" && toggleTheme()}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  theme === "dark"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Moon className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Oscuro</p>
                <p className="text-xs text-muted-foreground">
                  Ideal para ambientes con poca luz
                </p>
              </div>
            </button>

            {/* Light option */}
            <button
              onClick={() => theme === "dark" && toggleTheme()}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  theme === "light"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Sun className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Claro</p>
                <p className="text-xs text-muted-foreground">
                  Ideal para ambientes iluminados
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/30 bg-card p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">
            Zona de peligro
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Acciones irreversibles sobre tu cuenta.
          </p>
          <button className="rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
