"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, UserCheck, Stethoscope, ShieldCheck, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  full_name: string;
  created_at: string;
  role: string;
  org_name: string;
  is_active: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Users }> = {
  owner: { label: "Owner", color: "bg-amber-500/10 text-amber-500", icon: Crown },
  admin: { label: "Admin", color: "bg-blue-500/10 text-blue-500", icon: ShieldCheck },
  doctor: { label: "Doctor", color: "bg-purple-500/10 text-purple-500", icon: Stethoscope },
  receptionist: { label: "Recepcionista", color: "bg-emerald-500/10 text-emerald-500", icon: UserCheck },
};

function UserTable({ users, title, emptyMsg }: { users: UserRow[]; title: string; emptyMsg: string }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{users.length} usuarios</p>
      </div>
      {users.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMsg}</p>
      ) : (
        <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
          {users.map((u) => {
            const config = ROLE_CONFIG[u.role];
            return (
              <div key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.org_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    config?.color ?? "bg-muted text-muted-foreground"
                  )}>
                    {config?.label ?? u.role}
                  </span>
                  {!u.is_active && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                      Inactivo
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("es", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalUsers: 0,
    owners: 0,
    admins: 0,
    doctors: 0,
    receptionists: 0,
    ownersAndAdmins: [] as UserRow[],
    teamMembers: [] as UserRow[],
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
        <p className="text-sm text-muted-foreground mt-1">{data.totalUsers} usuarios registrados en la plataforma</p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Crown className="h-4 w-4 text-amber-500" /> Owners</div>
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

      {/* Two columns: Owners/Admins | Team Members */}
      <div className="grid gap-6 lg:grid-cols-2">
        <UserTable
          users={data.ownersAndAdmins}
          title="Owners y Administradores"
          emptyMsg="Sin owners/admins registrados"
        />
        <UserTable
          users={data.teamMembers}
          title="Miembros del Equipo"
          emptyMsg="Sin doctores o recepcionistas registrados"
        />
      </div>
    </div>
  );
}
