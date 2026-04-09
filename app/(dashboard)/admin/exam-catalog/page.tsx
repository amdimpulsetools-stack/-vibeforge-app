"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import {
  FlaskConical,
  Plus,
  Loader2,
  Check,
  X,
  ChevronDown,
  Pencil,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExamCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface ExamItem {
  id: string;
  name: string;
  code: string | null;
  default_instructions: string | null;
  is_active: boolean;
  display_order: number;
  category_id: string;
}

export default function ExamCatalogPage() {
  const { organizationId } = useOrganization();
  const [categories, setCategories] = useState<ExamCategory[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"exams" | "categories">("exams");

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  // Exam form
  const [showExamForm, setShowExamForm] = useState(false);
  const [examName, setExamName] = useState("");
  const [examCode, setExamCode] = useState("");
  const [examInstructions, setExamInstructions] = useState("");
  const [examCategoryId, setExamCategoryId] = useState("");
  const [savingExam, setSavingExam] = useState(false);

  // Expanded category
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const [catRes, examRes] = await Promise.all([
      supabase.from("exam_categories").select("*").order("display_order"),
      supabase.from("exam_catalog").select("*").order("display_order"),
    ]);
    setCategories(catRes.data ?? []);
    setExams(examRes.data ?? []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateCategory = async () => {
    if (!catName.trim() || !organizationId) return;
    setSavingCat(true);
    const supabase = createClient();
    const { error } = await supabase.from("exam_categories").insert({
      name: catName.trim(),
      description: catDesc || null,
      organization_id: organizationId,
      display_order: categories.length,
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ya existe una categoría con ese nombre" : error.message);
    } else {
      toast.success("Categoría creada");
      setCatName(""); setCatDesc(""); setShowCatForm(false);
      fetchData();
    }
    setSavingCat(false);
  };

  const handleCreateExam = async () => {
    if (!examName.trim() || !examCategoryId || !organizationId) return;
    setSavingExam(true);
    const supabase = createClient();
    const { error } = await supabase.from("exam_catalog").insert({
      name: examName.trim(),
      code: examCode || null,
      default_instructions: examInstructions || null,
      category_id: examCategoryId,
      organization_id: organizationId,
      display_order: exams.filter((e) => e.category_id === examCategoryId).length,
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ya existe un examen con ese nombre" : error.message);
    } else {
      toast.success("Examen agregado al catálogo");
      setExamName(""); setExamCode(""); setExamInstructions(""); setShowExamForm(false);
      fetchData();
    }
    setSavingExam(false);
  };

  const toggleExamActive = async (exam: ExamItem) => {
    const supabase = createClient();
    const { error } = await supabase.from("exam_catalog").update({ is_active: !exam.is_active }).eq("id", exam.id);
    if (error) toast.error(error.message);
    else fetchData();
  };

  const deleteExam = async (examId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("exam_catalog").delete().eq("id", examId);
    if (error) toast.error(error.message);
    else { toast.success("Examen eliminado"); fetchData(); }
  };

  const deleteCat = async (catId: string) => {
    const catExams = exams.filter((e) => e.category_id === catId);
    if (catExams.length > 0) {
      toast.error("No puedes eliminar una categoría con exámenes. Elimina los exámenes primero.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("exam_categories").delete().eq("id", catId);
    if (error) toast.error(error.message);
    else { toast.success("Categoría eliminada"); fetchData(); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-cyan-500" />
            Catálogo de Exámenes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configura las categorías y exámenes que los doctores pueden solicitar
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("exams")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "exams" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Exámenes ({exams.length})
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "categories" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Categorías ({categories.length})
        </button>
      </div>

      {/* Categories tab */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          <button
            onClick={() => setShowCatForm(!showCatForm)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nueva categoría
          </button>

          {showCatForm && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-w-md">
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Nombre de categoría (ej: Laboratorio)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <input
                type="text"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateCategory}
                  disabled={savingCat || !catName.trim()}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingCat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Crear
                </button>
                <button onClick={() => setShowCatForm(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay categorías. Crea la primera (ej: Laboratorio, Imagenología)</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{cat.name}</p>
                    {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{exams.filter((e) => e.category_id === cat.id).length} exámenes</p>
                  </div>
                  <button
                    onClick={() => deleteCat(cat.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Exams tab */}
      {activeTab === "exams" && (
        <div className="space-y-4">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Primero crea categorías en la pestaña &quot;Categorías&quot;</p>
            </div>
          ) : (
            <>
              <button
                onClick={() => { setShowExamForm(!showExamForm); if (!examCategoryId && categories.length > 0) setExamCategoryId(categories[0].id); }}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Nuevo examen
              </button>

              {showExamForm && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-w-lg">
                  <input
                    type="text"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="Nombre del examen (ej: Hemograma completo)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={examCategoryId}
                      onChange={(e) => setExamCategoryId(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={examCode}
                      onChange={(e) => setExamCode(e.target.value)}
                      placeholder="Código (opcional)"
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <input
                    type="text"
                    value={examInstructions}
                    onChange={(e) => setExamInstructions(e.target.value)}
                    placeholder="Indicaciones por defecto (ej: En ayunas 8 horas)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateExam}
                      disabled={savingExam || !examName.trim() || !examCategoryId}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {savingExam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Agregar
                    </button>
                    <button onClick={() => setShowExamForm(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Exams grouped by category */}
              {categories.map((cat) => {
                const catExams = exams.filter((e) => e.category_id === cat.id);
                if (catExams.length === 0 && !showExamForm) return null;
                const isExpanded = expandedCat === cat.id || expandedCat === null;

                return (
                  <div key={cat.id} className="rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                      className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-cyan-500" />
                        <span className="text-sm font-semibold">{cat.name}</span>
                        <span className="rounded-full bg-muted px-2 text-xs font-medium">{catExams.length}</span>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-border">
                        {catExams.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-muted-foreground">Sin exámenes en esta categoría</p>
                        ) : (
                          catExams.map((exam) => (
                            <div key={exam.id} className={cn("flex items-center justify-between px-4 py-2.5", !exam.is_active && "opacity-50")}>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{exam.name}</span>
                                  {exam.code && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{exam.code}</span>}
                                  {!exam.is_active && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-600 font-medium">Inactivo</span>}
                                </div>
                                {exam.default_instructions && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{exam.default_instructions}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleExamActive(exam)}
                                  className={cn("rounded p-1 transition-colors", exam.is_active ? "text-muted-foreground hover:text-amber-500" : "text-muted-foreground hover:text-emerald-500")}
                                  title={exam.is_active ? "Desactivar" : "Activar"}
                                >
                                  {exam.is_active ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => deleteExam(exam.id)}
                                  className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
