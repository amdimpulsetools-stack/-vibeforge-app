"use client";

/**
 * Ajustes de Conversaciones a pantalla completa (pedido del founder,
 * 1-oct-2026: "que se sienta más robusto"). Antes era un Dialog.
 *
 * Mismo shell full-bleed que /conversaciones; navegación lateral en
 * escritorio y tira horizontal en móvil; cada sección se carga aparte.
 * Solo owner/admin (la RLS de la 275/276 lo vuelve a exigir). `?tab=`
 * por history.replaceState (patrón de /almacen) para enlazar secciones
 * sin suspender la página.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Compass,
  HelpCircle,
  Loader2,
  MessageSquareQuote,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Workflow,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { setInboxOrg } from "../use-inbox";

type SectionKey = "general" | "quick" | "tags" | "playbook" | "kb" | "cases" | "gaps" | "rules" | "test" | "flows";

const SectionLoader = () => (
  <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
  </div>
);
const load = (p: () => Promise<{ default: React.ComponentType }>) => dynamic(p, { loading: SectionLoader });
const SECTION_COMPONENTS: Record<Exclude<SectionKey, "flows">, React.ComponentType> = {
  general: load(() => import("./sections/general")),
  quick: load(() => import("./sections/quick-replies")),
  tags: load(() => import("./sections/tags")),
  playbook: load(() => import("./sections/playbook")),
  kb: load(() => import("./sections/kb")),
  cases: load(() => import("./sections/cases")),
  gaps: load(() => import("./sections/gaps")),
  rules: load(() => import("./sections/rules")),
  test: load(() => import("./sections/test")),
};

const NAV: Array<{ group: string; items: Array<{ key: SectionKey; label: string; hint: string; icon: React.ComponentType<{ className?: string }>; soon?: boolean }> }> = [
  {
    group: "Bandeja",
    items: [
      { key: "general", label: "General", hint: "Permisos, modelo y voz", icon: Settings2 },
      { key: "quick", label: "Respuestas rápidas", hint: "Atajos /texto", icon: Zap },
      { key: "tags", label: "Etiquetas", hint: "Organizar chats", icon: Tag },
    ],
  },
  {
    group: "Yendy IA",
    items: [
      { key: "playbook", label: "Guía de conversación", hint: "La fórmula: cálida y que cierra", icon: Compass },
      { key: "kb", label: "Base de conocimientos", hint: "Por servicio y general", icon: BookOpen },
      { key: "cases", label: "Casos reales", hint: "Mensajes y respuestas ejemplo", icon: MessageSquareQuote },
      { key: "gaps", label: "Brechas", hint: "Lo que no supo responder", icon: HelpCircle },
      { key: "rules", label: "Reglas", hint: "Límites y servicios ocultos", icon: ShieldCheck },
      { key: "test", label: "Probar Yendy", hint: "Simula una paciente", icon: Sparkles },
    ],
  },
  {
    group: "Automatización",
    items: [{ key: "flows", label: "Flows", hint: "Próximamente", icon: Workflow, soon: true }],
  },
];
const KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));

export default function ConversacionesAjustesPage() {
  const { organizationId } = useOrganization();
  setInboxOrg(organizationId ?? null);
  const { isAdmin, loading: roleLoading } = useOrgRole();
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const [tab, setTab] = useState<SectionKey>("general");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && (KEYS as string[]).includes(q)) setTab(q as SectionKey);
  }, []);
  function changeTab(next: SectionKey) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "general") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  if (roleLoading || addonsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!hasAnyAddon(["captacion"]) || !isAdmin) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <Settings2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Ajustes no disponibles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {!hasAnyAddon(["captacion"]) ? "Activa el módulo CRM WhatsApp + Captación." : "Solo administración puede cambiar los ajustes de Conversaciones."}
        </p>
        <Link href="/conversaciones" className="mt-4 inline-block text-sm font-medium text-primary">
          Volver a Conversaciones
        </Link>
      </div>
    );
  }

  const Section = tab === "flows" ? null : SECTION_COMPONENTS[tab];
  const current = NAV.flatMap((g) => g.items).find((i) => i.key === tab);

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)]">
      <header className="border-b border-border bg-background px-4 py-3 md:px-6 md:py-4">
        <Link href="/conversaciones" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Conversaciones
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight">Ajustes de Conversaciones</h1>
        <p className="text-sm text-muted-foreground">Cómo atiende tu equipo y cómo piensa, habla y encauza Yendy IA.</p>
      </header>

      {/* Móvil / tablet: tira horizontal de secciones. */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-background px-4 py-2 lg:hidden">
        {NAV.flatMap((g) => g.items).map((i) => (
          <button
            key={i.key}
            type="button"
            disabled={i.soon}
            onClick={() => changeTab(i.key)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              tab === i.key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
              i.soon && "opacity-50",
            )}
          >
            {i.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Escritorio: navegación lateral. */}
        <aside className="hidden overflow-y-auto border-r border-border bg-card/60 p-3 lg:block">
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{g.group}</p>
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const Icon = i.icon;
                  const active = tab === i.key;
                  return (
                    <li key={i.key}>
                      <button
                        type="button"
                        disabled={i.soon}
                        onClick={() => changeTab(i.key)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/60",
                          i.soon && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight">{i.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{i.hint}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto max-w-4xl">
            {Section ? (
              <Section key={tab} />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Workflow className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="mt-2 text-lg font-bold">{current?.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Automatizaciones con nodos (bienvenida con menú, respuestas por palabra clave, aviso si nadie responde). En diseño: ver{" "}
                  <code className="text-xs">docs/research/conversaciones-flows-2026-10.md</code>.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
