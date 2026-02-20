"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import type { PatientWithTags } from "@/types/admin";
import { PATIENT_STATUS_COLORS } from "@/types/admin";
import {
  Search,
  Plus,
  Users,
  Filter,
  X,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PatientDrawer } from "./patient-drawer";
import { PatientFormModal } from "./patient-form-modal";

type StatusFilter = "all" | "active" | "inactive";

export default function PatientsPage() {
  const { t } = useLanguage();
  const [patients, setPatients] = useState<PatientWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPatient, setSelectedPatient] = useState<PatientWithTags | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchPatients = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("patients")
      .select("*, patient_tags(*)")
      .order("last_name");

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    setPatients((data as PatientWithTags[]) ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Client-side search filter (name, DNI, phone)
  const filteredPatients = patients.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
    return (
      fullName.includes(q) ||
      (p.dni && p.dni.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q))
    );
  });

  const handleSaved = () => {
    fetchPatients();
    setShowForm(false);
    setSelectedPatient(null);
  };

  const handlePatientUpdated = () => {
    fetchPatients();
    // Re-fetch the selected patient to refresh the drawer
    if (selectedPatient) {
      const supabase = createClient();
      supabase
        .from("patients")
        .select("*, patient_tags(*)")
        .eq("id", selectedPatient.id)
        .single()
        .then(({ data }) => {
          if (data) setSelectedPatient(data as PatientWithTags);
        });
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Main List */}
      <div className={cn("flex flex-1 flex-col overflow-hidden", selectedPatient && "hidden md:flex")}>
        {/* Header */}
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{t("patients.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("patients.subtitle")}</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              {t("patients.add")}
            </button>
          </div>

          {/* Search & Filters */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("patients.search_placeholder")}
                className="w-full rounded-lg border border-input bg-background pl-10 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {(["all", "active", "inactive"] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {t(`patients.filter_${f}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">{search ? t("common.no_results") : t("patients.no_patients")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredPatients.map((patient) => {
                const isSelected = selectedPatient?.id === patient.id;
                return (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className={cn(
                      "flex w-full items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-accent/50",
                      isSelected && "bg-primary/5 border-l-2 border-l-primary"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{
                        backgroundColor: PATIENT_STATUS_COLORS[patient.status] ?? "#9ca3af",
                      }}
                    >
                      {patient.first_name[0]}{patient.last_name[0]}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {patient.last_name}, {patient.first_name}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {patient.dni && <span>DNI: {patient.dni}</span>}
                        {patient.phone && <span>{patient.phone}</span>}
                      </div>
                      {/* Tags */}
                      {patient.patient_tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {patient.patient_tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                            >
                              {tag.tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer count */}
        <div className="border-t border-border bg-card px-6 py-2 text-xs text-muted-foreground">
          {filteredPatients.length} {filteredPatients.length === 1 ? "paciente" : "pacientes"}
        </div>
      </div>

      {/* Drawer - 360° Profile */}
      {selectedPatient && (
        <PatientDrawer
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onUpdate={handlePatientUpdated}
        />
      )}

      {/* New Patient Modal */}
      {showForm && (
        <PatientFormModal
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
