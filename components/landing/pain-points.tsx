"use client";

import { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";

const pains = [
  "Manejas las citas entre WhatsApp, un cuaderno y Google Calendar",
  "Tu recepcionista es la única que entiende el Excel de pacientes",
  "No sabes cuánto facturaste esta semana sin hacer cuentas a mano",
  "Pierdes pacientes porque nadie les dio seguimiento",
  "Tu software actual parece del 2010 y pagas demasiado por él",
  "Cada nuevo doctor que agregas es un dolor de cabeza administrativo",
];

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

  return (
    <section className="py-20 sm:py-28 bg-slate-50/50">
      <div
        ref={sectionRef}
        className="mx-auto max-w-3xl px-6 [&.animate-in_.pain-item]:opacity-100 [&.animate-in_.pain-item]:translate-y-0"
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            ¿Te suena familiar?
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pains.map((pain, i) => {
            const isChecked = checked.has(i);
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`pain-item group flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-500 opacity-0 translate-y-4 cursor-pointer ${
                  isChecked
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                    isChecked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-slate-300 group-hover:border-slate-400"
                  }`}
                >
                  {isChecked && <Check className="h-3 w-3 text-white" />}
                </div>
                <span
                  className={`text-sm leading-snug transition-colors ${
                    isChecked ? "text-slate-500 line-through" : "text-slate-700"
                  }`}
                >
                  {pain}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-center text-sm text-slate-500 mt-10 max-w-lg mx-auto">
          No debería ser tan difícil administrar una clínica en 2026.{" "}
          <span className="font-medium text-slate-700">Construimos algo mejor.</span>
        </p>
      </div>
    </section>
  );
}
