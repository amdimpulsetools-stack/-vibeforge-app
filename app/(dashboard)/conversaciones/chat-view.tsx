"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, PanelRightOpen, CheckCheck, Check, Clock, AlertTriangle, FileText, StickyNote, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWaPhone, initialsOf, isWindowOpen, windowExpiresAt, type InboxMessage } from "@/lib/inbox/shared";
import { DataLoadError } from "../scheduler/data-load-error";
import { avatarTone, conversationName } from "./conversation-list";
import { Composer } from "./composer";
import type { ConversationRow } from "./use-inbox";

export function ChatView({
  conversation,
  messages,
  messagesError,
  onRetry,
  retrying,
  timezone,
  onBack,
  onToggleDetails,
  onSent,
}: {
  conversation: ConversationRow;
  messages: InboxMessage[] | undefined;
  messagesError: unknown;
  onRetry: () => void;
  retrying: boolean;
  timezone: string;
  onBack: () => void;
  onToggleDetails: () => void;
  onSent: () => void;
}) {
  const name = conversationName(conversation);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = messages?.[messages.length - 1]?.id;

  // Baja al final al abrir y cuando llega algo nuevo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id, lastId]);

  const fmt = useMemo(() => {
    const time = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
    const day = new Intl.DateTimeFormat("es-PE", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" });
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return { time: (iso: string) => time.format(new Date(iso)), day: (iso: string) => day.format(new Date(iso)), ymd: (iso: string) => ymd.format(new Date(iso)) };
  }, [timezone]);

  const windowOpen = isWindowOpen(conversation.last_inbound_at);
  const expires = windowExpiresAt(conversation.last_inbound_at);
  const lastVisibleId = useMemo(
    () => [...(messages ?? [])].reverse().find((m) => m.direction !== "internal")?.id ?? null,
    [messages],
  );

  let lastDay = "";
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-[hsl(var(--muted)/0.35)]">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 bg-card/95 px-4">
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted md:hidden" aria-label="Volver a la lista">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold", avatarTone(conversation.id))}>
          {initialsOf(name, "#")}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", windowOpen ? "bg-emerald-500" : "bg-muted-foreground/50")} />
            {formatWaPhone(conversation.phone_normalized)}
            {expires && windowOpen && <> · ventana abierta hasta las {fmt.time(new Date(expires).toISOString())}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Ver detalles del contacto"
          title="Detalles del contacto"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-[clamp(24px,5vw,72px)]"
        style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 0.6px, transparent 0.6px)", backgroundSize: "14px 14px" }}
      >
        {messagesError ? (
          <DataLoadError
            title="No se pudieron cargar los mensajes."
            description="Los mensajes no se han perdido. Reintenta en un momento."
            error={messagesError}
            onRetry={onRetry}
            retrying={retrying}
          />
        ) : !messages ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Cargando…</p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Sin mensajes todavía.</p>
        ) : (
          messages.map((m) => {
            const d = fmt.ymd(m.ts);
            const showDay = d !== lastDay;
            lastDay = d;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-4 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    <span className="rounded-full border border-border bg-card px-3 py-1 capitalize">{fmt.day(m.ts)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <Bubble m={m} time={fmt.time(m.ts)} />
              </div>
            );
          })
        )}
      </div>

      <Composer
        conversation={conversation}
        windowOpen={windowOpen}
        expectedLastMessageId={lastVisibleId}
        timezone={timezone}
        onSent={onSent}
      />
    </section>
  );
}

function StatusTicks({ status }: { status: InboxMessage["status"] }) {
  if (status === "sending") return <Clock className="h-3 w-3" aria-label="Enviando" />;
  if (status === "failed") return <AlertTriangle className="h-3 w-3 text-red-500" aria-label="No se envió" />;
  if (status === "unknown") return <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Estado desconocido" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Leído" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregado" />;
  return <Check className="h-3.5 w-3.5" aria-label="Enviado" />;
}

function Bubble({ m, time }: { m: InboxMessage; time: string }) {
  if (m.direction === "internal") {
    return (
      <div className="mx-auto my-2 max-w-[80%] rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
          <StickyNote className="h-3 w-3" /> Nota interna · no se envía
        </p>
        <p className="whitespace-pre-wrap">{m.body}</p>
        <time className="mt-0.5 block text-right text-[9.5px] opacity-70">{time}</time>
      </div>
    );
  }
  const out = m.direction === "out";
  const mediaUrl = m.meta_media_id ? `/api/inbox/media/${m.id}` : null;
  return (
    <article
      className={cn(
        "mb-2 w-fit max-w-[78%] rounded-xl px-3 pb-1.5 pt-2 text-[13px] leading-relaxed shadow-sm",
        out
          ? "ml-auto rounded-tr-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-50"
          : "rounded-tl-sm bg-card text-foreground",
        m.status === "failed" && "ring-1 ring-red-400/60",
      )}
    >
      {m.source === "scheduler" && (
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-70">
          <Clock className="h-3 w-3" /> Programado
        </p>
      )}
      {m.type === "template" && (
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-70">
          <FileText className="h-3 w-3" /> Plantilla {m.template_name ? `· ${m.template_name}` : ""}
        </p>
      )}
      {mediaUrl && m.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt={m.media_caption ?? "Foto recibida"} loading="lazy" className="mb-1 max-h-72 rounded-lg object-cover" />
      )}
      {mediaUrl && m.type === "sticker" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt="Sticker" loading="lazy" className="mb-1 h-28 w-28 object-contain" />
      )}
      {mediaUrl && m.type === "audio" && <audio src={mediaUrl} controls preload="none" className="mb-1 max-w-[260px]" />}
      {mediaUrl && m.type === "video" && <video src={mediaUrl} controls preload="none" className="mb-1 max-h-72 rounded-lg" />}
      {mediaUrl && m.type === "document" && (
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold underline">
          <FileText className="h-3.5 w-3.5" /> Abrir documento
        </a>
      )}
      {(m.body || m.media_caption) && <p className="whitespace-pre-wrap break-words">{m.body ?? m.media_caption}</p>}
      {!m.body && !m.media_caption && !mediaUrl && <p className="italic opacity-70">[{m.type}]</p>}
      <time className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] opacity-70">
        {m.source === "ai_agent" && <Bot className="h-3 w-3" />}
        {time}
        {out && <StatusTicks status={m.status} />}
      </time>
      {m.status === "failed" && m.error_title && (
        <p className="mt-1 text-[10.5px] text-red-600 dark:text-red-400">No se envió: {m.error_title}</p>
      )}
    </article>
  );
}
