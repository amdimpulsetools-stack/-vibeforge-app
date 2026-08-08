"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Headphones,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { founderFetch } from "@/lib/founder-fetch";

interface SupportMessage {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
}
interface FounderTicket {
  id: string;
  organization_id: string;
  subject: string;
  status: "open" | "waiting" | "resolved" | "closed";
  priority: string;
  created_at: string;
  updated_at: string;
  org_name: string;
  author_name: string;
  messages: SupportMessage[];
  awaiting_us: boolean;
  last_message_at: string;
}

const STATUS_META: Record<
  FounderTicket["status"],
  { label: string; cls: string }
> = {
  open: { label: "Abierto", cls: "bg-red-500/10 text-red-600" },
  waiting: { label: "Respondido", cls: "bg-blue-500/10 text-blue-600" },
  resolved: { label: "Resuelto", cls: "bg-emerald-500/10 text-emerald-600" },
  closed: { label: "Cerrado", cls: "bg-muted text-muted-foreground" },
};

function hoursSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 3600000);
}

function formatAge(iso: string): string {
  const h = hoursSince(iso);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

export default function FounderSupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SupportInbox />
    </Suspense>
  );
}

function SupportInbox() {
  const searchParams = useSearchParams();
  const deepLinkTicket = searchParams.get("ticket");

  const [tickets, setTickets] = useState<FounderTicket[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [onlyPending, setOnlyPending] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async (keepSelection = true) => {
    try {
      const data = await founderFetch<{ tickets: FounderTicket[] }>(
        "/api/founder/support",
      );
      setTickets(data.tickets);
      setSelectedId((prev) => {
        if (keepSelection && prev) return prev;
        // Deep-link desde el email o desde las alertas del Panel CEO.
        if (deepLinkTicket && data.tickets.some((t) => t.id === deepLinkTicket))
          return deepLinkTicket;
        const firstPending = data.tickets.find((t) => t.awaiting_us);
        return firstPending?.id ?? data.tickets[0]?.id ?? null;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected]);

  const visible = useMemo(
    () => (onlyPending ? tickets.filter((t) => t.awaiting_us) : tickets),
    [tickets, onlyPending],
  );
  const pendingCount = tickets.filter((t) => t.awaiting_us).length;

  const sendReply = async (status: "waiting" | "resolved") => {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/founder/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selected.id, body: reply.trim(), status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "No se pudo enviar la respuesta");
      } else {
        toast.success(
          status === "resolved"
            ? "Respuesta enviada y ticket resuelto"
            : "Respuesta enviada — la clínica recibe un correo",
        );
        setReply("");
        await load();
      }
    } catch {
      toast.error("Error de red al enviar la respuesta");
    }
    setSending(false);
  };

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm font-semibold text-red-500">No se pudo cargar la bandeja</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Headphones className="h-6 w-6 text-amber-500" /> Soporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Conversaciones con las clínicas. Al responder, la clínica lo ve en su
            chat y recibe un correo.
          </p>
        </div>
        <button
          onClick={() => setOnlyPending((v) => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          {onlyPending
            ? `Viendo pendientes (${pendingCount}) — ver todos`
            : `Viendo todos (${tickets.length}) — ver solo pendientes`}
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Headphones className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Sin tickets todavía</p>
          <p className="text-xs text-muted-foreground">
            Cuando una clínica escriba desde su sección Soporte, aparecerá acá y
            te llegará un correo.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Lista */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <ul className="max-h-[70vh] divide-y divide-border/40 overflow-y-auto">
              {visible.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Nada pendiente de respuesta. 🎉
                </li>
              )}
              {visible.map((t) => {
                const st = STATUS_META[t.status];
                const stale = t.awaiting_us && hoursSince(t.last_message_at) > 48;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors hover:bg-accent/40",
                        selectedId === t.id && "bg-accent/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {t.org_name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            st.cls,
                          )}
                        >
                          {st.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{t.subject}</p>
                      <p
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-[11px]",
                          stale ? "font-semibold text-red-500" : "text-muted-foreground",
                        )}
                      >
                        {stale ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {formatAge(t.last_message_at)}
                        {t.awaiting_us && " · esperando respuesta"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Conversación */}
          <div className="flex min-h-[60vh] flex-col rounded-2xl border border-border/60 bg-card">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Elige un ticket de la lista.
              </div>
            ) : (
              <>
                <div className="border-b border-border/60 p-4">
                  <p className="font-semibold">{selected.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.org_name} · {selected.author_name} · abierto{" "}
                    {formatAge(selected.created_at)}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {selected.messages.map((m) => {
                    const mine = m.sender_type !== "user";
                    return (
                      <div
                        key={m.id}
                        className={cn("flex", mine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                            mine
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-muted/40",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-[10px]",
                              mine ? "text-primary-foreground/70" : "text-muted-foreground",
                            )}
                          >
                            {mine ? "Yenda" : selected.author_name} ·{" "}
                            {new Date(m.created_at).toLocaleString("es-PE")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-border/60 p-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Escribe tu respuesta… (la clínica la ve en su chat y le llega por correo)"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => sendReply("resolved")}
                      disabled={!reply.trim() || sending}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Responder y resolver
                    </button>
                    <button
                      onClick={() => sendReply("waiting")}
                      disabled={!reply.trim() || sending}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      {sending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Enviar respuesta
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
