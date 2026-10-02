"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Settings2, Clock3, Loader2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWaPhone, initialsOf, isWindowOpen } from "@/lib/inbox/shared";
import type { ConversationRow, OrgTag } from "./use-inbox";

type Filter = "all" | "unread" | "open_window";

const AVATAR_TONES = [
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
];

export function avatarTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function conversationName(c: ConversationRow): string {
  const p = c.patients;
  const patientName = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
  return patientName || c.display_name || formatWaPhone(c.phone_normalized) || "Sin nombre";
}

export function ConversationList({
  conversations,
  tags,
  activeId,
  onSelect,
  timezone,
  canManage,
  onLoadMore,
  hasMore,
  loadingMore,
}: {
  conversations: ConversationRow[];
  tags: OrgTag[];
  activeId: string | null;
  onSelect: (id: string) => void;
  timezone: string;
  canManage: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return conversations.filter((c) => {
      if (filter === "unread" && c.unread_count === 0) return false;
      if (filter === "open_window" && !isWindowOpen(c.last_inbound_at)) return false;
      if (tagFilter && !c.wa_conversation_tags.some((t) => t.tag_id === tagFilter)) return false;
      if (!q) return true;
      return (
        conversationName(c).toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (c.phone_normalized ?? "").includes(qDigits)) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, query, filter, tagFilter]);

  const unreadTotal = conversations.filter((c) => c.unread_count > 0).length;

  // Lista virtualizada: con 1 000 conversaciones solo se dibujan las ~15
  // visibles (+ margen). Las filas miden ~78 px; el virtualizador mide
  // la real al montarla.
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 78,
    overscan: 8,
    getItemKey: (i) => visible[i].id,
  });
  const fmt = useMemo(() => {
    const time = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
    const day = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, day: "2-digit", month: "2-digit" });
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return (iso: string) => {
      const d = new Date(iso);
      return ymd.format(d) === ymd.format(new Date()) ? time.format(d) : day.format(d);
    };
  }, [timezone]);

  return (
    <section className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card">
      <header className="flex items-center justify-between px-5 pb-3 pt-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Bandeja de entrada</p>
          <h1 className="text-xl font-bold tracking-tight">Conversaciones</h1>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <Link
              href="/conversaciones/flows"
              className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Flows"
              title="Flows: automatizaciones con nodos"
            >
              <Workflow className="h-4 w-4" />
            </Link>
            <Link
              href="/conversaciones/ajustes"
              className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90"
              aria-label="Ajustes de Conversaciones"
              title="Ajustes: Yendy IA, base de conocimientos, casos, respuestas rápidas, etiquetas"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
          </div>
        )}
      </header>

      <label className="mx-4 flex h-10 items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 text-muted-foreground focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nombre, teléfono o mensaje"
          aria-label="Buscar conversaciones"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="flex items-center gap-5 border-b border-border/60 px-5 pb-2 pt-3 text-xs font-semibold">
        {(
          [
            ["all", "Todos", conversations.length],
            ["unread", "No leídos", unreadTotal],
            ["open_window", "Ventana abierta", null],
          ] as Array<[Filter, string, number | null]>
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "relative pb-2 transition-colors",
              filter === key
                ? "text-primary after:absolute after:inset-x-0 after:-bottom-[9px] after:h-0.5 after:rounded after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {n !== null && <span className="ml-1 text-muted-foreground/80">{n}</span>}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 px-4 py-2">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
              tagFilter === null ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            Todas las etiquetas
          </button>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                tagFilter === t.id ? "text-foreground" : "border-border text-muted-foreground",
              )}
              style={tagFilter === t.id ? { borderColor: t.color, backgroundColor: `${t.color}22` } : undefined}
            >
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            {conversations.length === 0
              ? "Todavía no llegan mensajes. Cuando una paciente escriba a tu WhatsApp conectado, aparecerá aquí."
              : "Sin resultados con esos filtros."}
          </p>
        ) : (
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((row) => {
              const c = visible[row.index];
              const name = conversationName(c);
              const firstTag = c.wa_conversation_tags.map((t) => tagById.get(t.tag_id)).find(Boolean);
              const windowOpen = isWindowOpen(c.last_inbound_at);
              return (
                <button
                  key={row.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={row.index}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "absolute left-0 top-0 flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                    c.id === activeId ? "bg-primary/10" : "hover:bg-muted/50",
                  )}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full text-xs font-bold", avatarTone(c.id))}>
                    {initialsOf(name, "#")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <strong className={cn("truncate text-[13px]", c.unread_count > 0 ? "font-bold" : "font-semibold")}>{name}</strong>
                      <small className="shrink-0 text-[10px] text-muted-foreground">{fmt(c.last_message_at)}</small>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                      <span className="truncate">
                        {c.last_message_dir === "out" ? "Tú: " : ""}
                        {c.last_message_preview ?? "—"}
                      </span>
                      {c.unread_count > 0 && (
                        <b className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                          {c.unread_count}
                        </b>
                      )}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      {firstTag && (
                        <em
                          className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold not-italic"
                          style={{ backgroundColor: `${firstTag.color}22`, color: firstTag.color }}
                        >
                          {firstTag.name}
                        </em>
                      )}
                      {!c.patient_id && (
                        <em className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold not-italic text-amber-700 dark:text-amber-400">
                          Sin ficha
                        </em>
                      )}
                      {!windowOpen && (
                        <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted-foreground" title="Pasaron 24 h: solo plantillas">
                          <Clock3 className="h-3 w-3" /> 24 h
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {hasMore && !query && filter === "all" && !tagFilter && conversations.length > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="mx-auto my-3 flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />} Cargar más conversaciones
          </button>
        )}
      </div>
    </section>
  );
}
