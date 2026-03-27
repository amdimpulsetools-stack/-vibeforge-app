"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, UserCheck, Stethoscope, ShieldCheck } from "lucide-react";

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalUsers: 0,
    owners: 0,
    admins: 0,
    doctors: 0,
    receptionists: 0,
    recentUsers: [] as { id: string; full_name: string; email: string; created_at: string; role: string }[],
  });

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/founder/stats/users");
      if (!res.ok) { setLoading(false); return; }
      setData(await res.json());
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground mt-1">{data.totalUsers} usuarios registrados</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Users className="h-4 w-4 text-amber-500" /> Owners</div>
          <p className="text-2xl font-bold">{data.owners}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><ShieldCheck className="h-4 w-4 text-blue-500" /> Admins</div>
          <p className="text-2xl font-bold">{data.admins}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Stethoscope className="h-4 w-4 text-purple-500" /> Doctores</div>
          <p className="text-2xl font-bold">{data.doctors}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><UserCheck className="h-4 w-4 text-emerald-500" /> Recepcionistas</div>
          <p className="text-2xl font-bold">{data.receptionists}</p>
        </div>
      </div>

      {/* Recent users */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold">Últimos registros</h2>
        </div>
        <div className="divide-y divide-border/50">
          {data.recentUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{u.full_name}</p>
                <p className="text-xs text-muted-foreground">{u.id.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize">{u.role}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("es", { day: "numeric", month: "short" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
