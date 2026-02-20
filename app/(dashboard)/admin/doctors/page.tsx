"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import type { Doctor } from "@/types/admin";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import {
  Stethoscope,
  Plus,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";

export default function DoctorsPage() {
  const { t } = useLanguage();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchDoctors = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("doctors")
      .select("*")
      .order("full_name");
    setDoctors(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("doctors.delete_confirm"))) return;
    const supabase = createClient();
    const { error } = await supabase.from("doctors").delete().eq("id", id);
    if (error) {
      toast.error(t("doctors.save_error"));
      return;
    }
    toast.success(t("doctors.delete_success"));
    fetchDoctors();
  };

  const handleToggleActive = async (doctor: Doctor) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("doctors")
      .update({ is_active: !doctor.is_active })
      .eq("id", doctor.id);
    if (error) {
      toast.error(t("doctors.save_error"));
      return;
    }
    fetchDoctors();
  };

  const filtered = doctors.filter(
    (d) =>
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      d.cmp.toLowerCase().includes(search.toLowerCase())
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("doctors.title")}</h1>
          <p className="text-muted-foreground">{t("doctors.subtitle")}</p>
        </div>
        <Link
          href="/admin/doctors/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          {t("doctors.add")}
        </Link>
      </div>

      {doctors.length > 0 && (
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

      {filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Stethoscope className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {doctors.length === 0 ? t("doctors.no_doctors") : t("common.no_results")}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((doctor) => (
          <div
            key={doctor.id}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-4">
              {/* Avatar con color */}
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: doctor.color }}
              >
                {getInitials(doctor.full_name)}
              </div>
              <div>
                <h4 className="font-medium">{doctor.full_name}</h4>
                <p className="text-xs text-muted-foreground">CMP: {doctor.cmp}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Color indicator */}
              <div
                className="h-4 w-4 rounded-full border border-border"
                style={{ backgroundColor: doctor.color }}
                title={t("doctors.color")}
              />
              <button
                onClick={() => handleToggleActive(doctor)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  doctor.is_active
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {doctor.is_active ? t("doctors.active") : t("doctors.inactive")}
              </button>
              <Link
                href={`/admin/doctors/${doctor.id}`}
                className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </Link>
              <button
                onClick={() => handleDelete(doctor.id)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
