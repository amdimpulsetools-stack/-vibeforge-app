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
  Stethoscope,
  GraduationCap,
  BriefcaseMedical,
  Headset,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";

type ProfessionalTitle = "doctor" | "especialista" | "licenciada" | null;

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  professional_title: ProfessionalTitle;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
}

/** Returns display label and style for a member based on role + professional_title */
function getMemberDisplay(
  member: Member,
  t: (key: string) => string
): { label: string; icon: typeof User; colorClass: string } {
  if (member.role === "owner") {
    return {
      label: t("members.role_owner"),
      icon: Crown,
      colorClass: "bg-amber-500/10 text-amber-500",
    };
  }
  if (member.role === "admin") {
    return {
      label: t("members.role_admin"),
      icon: ShieldCheck,
      colorClass: "bg-blue-500/10 text-blue-500",
    };
  }
  if (member.role === "receptionist") {
    return {
      label: t("members.role_receptionist"),
      icon: Headset,
      colorClass: "bg-orange-500/10 text-orange-500",
    };
  }
  // doctor role — differentiate by professional_title
  switch (member.professional_title) {
    case "especialista":
      return {
        label: t("members.title_especialista"),
        icon: BriefcaseMedical,
        colorClass: "bg-violet-500/10 text-violet-500",
      };
    case "licenciada":
      return {
        label: t("members.title_licenciada"),
        icon: GraduationCap,
        colorClass: "bg-cyan-500/10 text-cyan-500",
      };
    default:
      return {
        label: t("members.title_doctor"),
        icon: Stethoscope,
        colorClass: "bg-emerald-500/10 text-emerald-500",
      };
  }
}

/** Invite-modal options: role + optional professional_title */
const MEMBER_TYPE_OPTIONS: {
  role: "doctor" | "receptionist";
  title: ProfessionalTitle;
  iconKey: "stethoscope" | "briefcase-medical" | "graduation-cap" | "headset";
  labelKey: string;
  descKey: string;
}[] = [
  {
    role: "doctor",
    title: "doctor",
    iconKey: "stethoscope",
    labelKey: "members.title_doctor",
    descKey: "members.title_doctor_desc",
  },
  {
    role: "doctor",
    title: "especialista",
    iconKey: "briefcase-medical",
    labelKey: "members.title_especialista",
    descKey: "members.title_especialista_desc",
  },
  {
    role: "doctor",
    title: "licenciada",
    iconKey: "graduation-cap",
    labelKey: "members.title_licenciada",
    descKey: "members.title_licenciada_desc",
  },
  {
    role: "receptionist",
    title: null,
    iconKey: "headset",
    labelKey: "members.role_receptionist",
    descKey: "members.role_receptionist_desc",
  },
];

const ICON_MAP = {
  stethoscope: Stethoscope,
  "briefcase-medical": BriefcaseMedical,
  "graduation-cap": GraduationCap,
  headset: Headset,
};

export default function MembersPage() {
  const { t, language } = useLanguage();
  const { orgRole } = useOrganization();
  const { plan, isAtLimit } = usePlan();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOptionIdx, setInviteOptionIdx] = useState(0);
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const isAdmin = orgRole === "owner" || orgRole === "admin";
  const memberLimitReached = isAtLimit("members");
  const isIndependientePlan = plan?.target_audience === "independiente";

  const fetchMembers = async () => {
    try {
      const res = await fetch("/api/members");
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      } else {
        toast.error(t("members.remove_error"));
      }
    } catch {
      toast.error(t("members.remove_error"));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const selectedOption = MEMBER_TYPE_OPTIONS[inviteOptionIdx];
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: selectedOption.role,
          professional_title: selectedOption.title,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "already_member") {
          toast.error(t("members.already_member"));
        } else if (data.error === "already_invited") {
          toast.error(t("members.already_invited"));
        } else {
          toast.error(t("members.invite_error"), {
            description: data.error || `Status ${res.status}`,
          });
        }
        return;
      }

      // Check if it was a direct add or an invitation sent
      if (data.message === "invitation_sent") {
        if (data.email_sent === false) {
          // Email failed — show warning with registration link
          toast.warning(t("members.invitation_created_no_email"), {
            duration: 15000,
            description: data.registerUrl,
          });
        } else {
          toast.success(t("members.invitation_sent"));
        }
      } else {
        toast.success(t("members.invite_success"));
      }
      setInviteEmail("");
      setInviteOptionIdx(0);
      setShowInvite(false);
      fetchMembers();
    } catch (err) {
      toast.error(t("members.invite_error"), {
        description: err instanceof Error ? err.message : "Error de red",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (
    memberId: string,
    newRole: "admin" | "receptionist" | "doctor"
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
          <div className="relative group">
            <button
              onClick={() => !memberLimitReached && setShowInvite(true)}
              disabled={memberLimitReached}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity ${
                memberLimitReached
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              <Plus className="h-4 w-4" />
              {t("members.invite")}
            </button>
            {memberLimitReached && (
              <div className="invisible group-hover:visible absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg text-sm">
                {isIndependientePlan ? (
                  <p className="text-muted-foreground">
                    {language === "es"
                      ? "Cambie su plan para agregar más Doctores/recepcionistas."
                      : "Upgrade your plan to add more Doctors/receptionists."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      {language === "es"
                        ? "Cambie su plan para agregar más Doctores/recepcionistas o añada más miembros desde su panel de cuenta."
                        : "Upgrade your plan to add more Doctors/receptionists or add more members from your account panel."}
                    </p>
                    <a
                      href="/account"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {language === "es" ? "Ir a mi cuenta" : "Go to my account"}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
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
          const display = getMemberDisplay(member, t);
          const DisplayIcon = display.icon;

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
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${display.colorClass}`}
                  >
                    <DisplayIcon className="h-3.5 w-3.5" />
                    {display.label}
                  </span>
                ) : isAdmin ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${display.colorClass}`}
                    >
                      <DisplayIcon className="h-3.5 w-3.5" />
                      {display.label}
                    </span>
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleChangeRole(
                          member.id,
                          e.target.value as "admin" | "receptionist" | "doctor"
                        )
                      }
                      disabled={changingRole === member.id}
                      className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50"
                    >
                      <option value="admin">
                        {t("members.role_admin")}
                      </option>
                      <option value="receptionist">
                        {t("members.role_receptionist")}
                      </option>
                      <option value="doctor">
                        {t("members.title_doctor")}
                      </option>
                    </select>
                  </div>
                ) : (
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${display.colorClass}`}
                  >
                    <DisplayIcon className="h-3.5 w-3.5" />
                    {display.label}
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
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
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
              {/* Email */}
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

              {/* Role selection */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("members.role")}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {MEMBER_TYPE_OPTIONS.map((opt, idx) => {
                    const Icon = ICON_MAP[opt.iconKey];
                    const isSelected = inviteOptionIdx === idx;
                    return (
                      <button
                        key={`${opt.role}-${opt.title ?? "none"}`}
                        type="button"
                        onClick={() => setInviteOptionIdx(idx)}
                        className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">
                            {t(opt.labelKey)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(opt.descKey)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Admin section — contact support */}
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-500 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {t("members.role_admin")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("members.admin_extra_cost")}
                    </p>
                    <a
                      href="https://wa.me/18094039726"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {t("members.contact_support")}
                    </a>
                  </div>
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
