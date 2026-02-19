import { createClient } from "@/lib/supabase/server";
import { LayoutDashboard, Users, Calendar, TrendingUp } from "lucide-react";

const stats = [
  { title: "Total Registros", value: "0", change: "+0%", icon: LayoutDashboard },
  { title: "Usuarios", value: "0", change: "+0%", icon: Users },
  { title: "Este Mes", value: "0", change: "+0%", icon: Calendar },
  { title: "Crecimiento", value: "0%", change: "+0%", icon: TrendingUp },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">DoctoVibe</h1>
        <p className="text-muted-foreground">
          Bienvenido de nuevo, {user?.user_metadata?.full_name || user?.email}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-card/80"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.title}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stat.value}</span>
              <span className="text-xs text-primary">{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder content */}
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <LayoutDashboard className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Tu contenido aquí</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Usa el system prompt de VibeForge para pedirle a Claude que genere
          módulos, tablas, gráficos y más.
        </p>
      </div>
    </div>
  );
}
