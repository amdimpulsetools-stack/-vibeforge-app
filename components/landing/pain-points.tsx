"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ArrowRight, Hand } from "lucide-react";

const pains = [
  "Manejas las citas entre WhatsApp, un cuaderno y Google Calendar",
  "Tu recepcionista es la única que entiende el Excel de pacientes",
  "No sabes cuánto facturaste esta semana sin hacer cuentas a mano",
  "Pierdes pacientes porque nadie les dio seguimiento",
  "Tu software actual parece del 2010 y pagas demasiado por él",
  "Cada nuevo doctor que agregas es un dolor de cabeza administrativo",
];

// Closing copy adapts to how many pains the user acknowledged.
// Small nudge: silence → validation → explicit CTA.
function closing(count: number, total: number) {
  if (count === 0) {
    return {
      lead: "No debería ser tan difícil administrar una clínica en 2026.",
      emphasis: "Construimos algo mejor.",
      cta: null as null | { label: string; href: string },
    };
  }
  if (count < 3) {
    return {
      lead: `${count} de ${total} ya es suficiente razón.`,
      emphasis: "Yenda cierra esas fugas desde el día 1.",
      cta: { label: "Ver cómo", href: "#revenue-impact" },
    };
  }
  return {
    lead: `${count} de ${total}. Entonces sí, esto no da más.`,
    emphasis: "Yenda es la salida.",
    cta: { label: "Ver cuánto recuperas", href: "#revenue-impact" },
  };
}

export function PainPoints() {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-in");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const c = closing(checked.size, pains.length);

  return (
    <section className="relative py-20 sm:py-28 bg-slate-950 overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-teal-500/10 blur-[120px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <div
        ref={sectionRef}
        className="relative mx-auto max-w-4xl px-6 [&.animate-in_.pain-item]:opacity-100 [&.animate-in_.pain-item]:translate-y-0"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 backdrop-blur">
            <Hand className="h-3.5 w-3.5 text-emerald-400" />
            Toca los que te pasen
          </div>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            ¿Te suena familiar?
          </h2>
          <p className="mt-4 text-base text-slate-400">
            Marca cada situación que pasa en tu clínica. Al final te decimos
            cuánto cuesta y cómo lo resolvemos.
          </p>

          {/* Live counter */}
          <div
            className={`mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-300 ${
              checked.size > 0
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/[0.03] text-slate-500"
            }`}
          >
            <span className="tabular-nums">
              {checked.size} de {pains.length}
            </span>
            <span>seleccionados</span>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pains.map((pain, i) => {
            const isChecked = checked.has(i);
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                aria-pressed={isChecked}
                className={`pain-item group relative flex items-start gap-4 rounded-2xl border p-5 text-left transition-all duration-500 opacity-0 translate-y-4 cursor-pointer overflow-hidden active:scale-[0.98] ${
                  isChecked
                    ? "border-emerald-400/50 bg-emerald-500/[0.08] shadow-[0_0_0_1px_rgb(52_211_153/0.15),0_8px_32px_-8px_rgb(16_185_129/0.25)]"
                    : "border-white/10 bg-white/[0.03] hover:border-emerald-400/30 hover:bg-white/[0.06]"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Glow on hover */}
                <div
                  className={`pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 ${
                    isChecked ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{
                    background:
                      "radial-gradient(420px circle at var(--x,50%) var(--y,50%), rgba(16,185,129,0.08), transparent 50%)",
                  }}
                />

                {/* Indicator — circle that pops into a check */}
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isChecked
                      ? "border-emerald-400 bg-emerald-400 scale-110"
                      : "border-slate-600 bg-transparent group-hover:border-emerald-400/60 group-hover:bg-emerald-400/10"
                  }`}
                >
                  <Check
                    className={`h-3.5 w-3.5 text-slate-950 transition-all duration-300 ${
                      isChecked ? "opacity-100 scale-100" : "opacity-0 scale-50"
                    }`}
                    strokeWidth={3.5}
                  />
                </div>

                <span
                  className={`text-[15px] leading-snug font-medium transition-colors ${
                    isChecked ? "text-white" : "text-slate-300 group-hover:text-white"
                  }`}
                >
                  {pain}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic closing */}
        <div className="mt-12 text-center">
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl mx-auto">
            {c.lead}{" "}
            <span className="font-semibold text-white">{c.emphasis}</span>
          </p>

          {c.cta && (
            <a
              href={c.cta.href}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              {c.cta.label}
              <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
