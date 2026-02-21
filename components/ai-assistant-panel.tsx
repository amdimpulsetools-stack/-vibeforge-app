"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2, Download, ChevronRight, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[] | null;
  sql?: string | null;
  sqlError?: string | null;
  timestamp: Date;
}

function exportToCSV(data: Record<string, unknown>[], filename = "datos-exportados") {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? "" : String(val);
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DataTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return <p className="text-xs text-muted-foreground italic">Sin resultados</p>;

  const headers = Object.keys(data[0]);
  const preview = data.slice(0, 20);

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map((h) => (
              <th key={h} className="px-3 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
              {headers.map((h) => (
                <td key={h} className="px-3 py-1.5 whitespace-nowrap">
                  {row[h] === null || row[h] === undefined ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    String(row[h])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 20 && (
        <p className="px-3 py-1.5 text-xs text-muted-foreground">
          Mostrando 20 de {data.length} resultados
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        isUser ? "bg-primary text-primary-foreground" : "bg-emerald-500/20 text-emerald-600"
      )}>
        {isUser ? "TÚ" : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={cn("flex max-w-[85%] flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-2xl px-3 py-2 text-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm border border-border bg-card"
        )}>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
        </div>

        {/* SQL Error */}
        {message.sqlError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-600">
            Error SQL: {message.sqlError}
          </div>
        )}

        {/* Data table */}
        {message.data && message.data.length > 0 && (
          <div className="w-full max-w-full">
            <DataTable data={message.data} />
            <button
              onClick={() => exportToCSV(message.data!)}
              className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar a Excel (CSV)
            </button>
          </div>
        )}

        {message.data && message.data.length === 0 && !isUser && (
          <p className="text-xs text-muted-foreground italic">No se encontraron resultados.</p>
        )}

        <span className="text-[10px] text-muted-foreground/50">
          {message.timestamp.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

const EXAMPLE_QUERIES = [
  "¿Cuántas citas se atendieron hoy?",
  "¿Qué pacientes tienen deuda pendiente?",
  "¿Cuál es el doctor con más citas este mes?",
  "¿Cuántos pacientes vienen de Instagram?",
];

export function AiAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "¡Hola! Soy tu asistente de base de datos. Puedo consultar información de pacientes, citas, pagos y más. ¿En qué te ayudo?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: json.error ?? "Ocurrió un error. Por favor, intenta de nuevo.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: json.response,
          data: json.data,
          sql: json.sql,
          sqlError: json.sqlError,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Error de conexión. Verifica que el servidor esté funcionando.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          open
            ? "bg-muted text-muted-foreground rotate-180"
            : "bg-primary text-primary-foreground hover:scale-105"
        )}
        title="Asistente IA"
      >
        {open ? <X className="h-5 w-5" /> : <Database className="h-5 w-5" />}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[380px] max-w-[95vw] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Database Assistant</p>
              <p className="text-[10px] text-emerald-600">Solo lectura · Seguro</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Consultando...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Example queries (shown when only welcome message) */}
        {messages.length === 1 && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Ejemplos:</p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="rounded-lg border border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre tus datos..."
              rows={2}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="flex h-auto w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
            Presiona Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>

      {/* Backdrop (click outside closes panel) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
