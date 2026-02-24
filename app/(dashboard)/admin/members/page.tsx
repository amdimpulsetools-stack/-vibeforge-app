"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import { getInitials } from "@/lib/utils";
import {
  Users,
  Plus,
  Trash2,
  Search,
  Crown,
  ShieldCheck,
  User,
  Loader2,
  Mail,
  X,
} from "lucide-react";

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
}

const ROLE_CONFIG = {
  owner: {
    icon: Crown,
    colorClass: "bg-amber-500/10 text-amber-500",
  },
  admin: {
    icon: ShieldCheck,
    colorClass: "bg-blue-500/10 text-blue-500",
  },
  member: {
    icon: User,
    colorClass: "bg-emerald-500/10 text-emerald-500",
  },
};

export default function MembersPage() {
  const { t } = useLanguage();
  const { orgRole } = useOrganization();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const isAdmin = orgRole === "owner" || orgRole === "admin";

  const fetchMembers = async () => {
    const res = await fetch("/api/members");
    if (res.ok) {
      const data = await res.json();
      setMembers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    setInviting(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });

    setInviting(false);

    if (!res.ok) {
      const data = await res.json();
      if (data.error === "user_not_found") {
        toast.error(t("members.user_not_found"));
      } else if (data.error === "already_member") {
        toast.error(t("members.already_member"));
      } else {
        toast.error(t("members.invite_error"));
      }
      return;
    }

    toast.success(t("members.invite_success"));
    setInviteEmail("");
    setShowInvite(false);
    fetchMembers();
  };

  const handleChangeRole = async (
    memberId: string,
    newRole: "admin" | "member"
  ) => {
    setChangingRole(memberId);
    const res = await fetch(`/api/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    setChangingRole(null);

    if (!res.ok) {
      toast.error(t("members.role_change_error"));
      return;
    }

    toast.success(t("members.role_change_success"));
    fetchMembers();
  };

  const handleRemove = async (member: Member) => {
    if (!confirm(t("members.remove_confirm"))) return;

    const res = await fetch(`/api/members/${member.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error(t("members.remove_error"));
      return;
    }

    toast.success(t("members.remove_success"));
    fetchMembers();
  };

  const filtered = members.filter(
    (m) =>
      (m.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("members.title")}
          </h1>
          <p className="text-muted-foreground">{t("members.subtitle")}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            {t("members.invite")}
          </button>
        )}
      </div>

      {/* Search */}
      {members.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
        </div>
      )}

      {/* Members count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        {members.length} {t("members.total_members")}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {members.length === 0
              ? t("members.no_members")
              : t("common.no_results")}
          </p>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        {filtered.map((member) => {
          const roleConfig = ROLE_CONFIG[member.role];
          const RoleIcon = roleConfig.icon;

          return (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {getInitials(member.full_name ?? member.email ?? "?")}
                  </div>
                )}
                <div>
                  <h4 className="font-medium">
                    {member.full_name ?? t("members.unnamed")}
                  </h4>
                  {member.email && (
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Role badge / selector */}
                {member.role === "owner" ? (
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${roleConfig.colorClass}`}
                  >
                    <RoleIcon className="h-3.5 w-3.5" />
                    {t("members.role_owner")}
                  </span>
                ) : isAdmin ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleChangeRole(
                        member.id,
                        e.target.value as "admin" | "member"
                      )
                    }
                    disabled={changingRole === member.id}
                    className="rounded-lg border border-input bg-background px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50"
                  >
                    <option value="admin">{t("members.role_admin")}</option>
                    <option value="member">{t("members.role_member")}</option>
                  </select>
                ) : (
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${roleConfig.colorClass}`}
                  >
                    <RoleIcon className="h-3.5 w-3.5" />
                    {t(`members.role_${member.role}`)}
                  </span>
                )}

                {/* Remove button (not for owner, not for self) */}
                {isAdmin && member.role !== "owner" && (
                  <button
                    onClick={() => handleRemove(member)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite dialog (modal) */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {t("members.invite_title")}
              </h2>
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {t("members.invite_description")}
            </p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("members.email")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder={t("members.email_placeholder")}
                    className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("members.role")}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteRole("member")}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-all ${
                      inviteRole === "member"
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <User className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">
                        {t("members.role_member")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("members.role_member_desc")}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteRole("admin")}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-all ${
                      inviteRole === "admin"
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">
                        {t("members.role_admin")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("members.role_admin_desc")}
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
                {inviting ? t("members.inviting") : t("members.invite")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
