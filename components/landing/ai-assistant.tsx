"use client";

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Send, Sparkles } from "lucide-react";

const chatExamples = [
  {
    question: "¿Cuál fue mi servicio más rentable este mes?",
    answer: "Ecografías generaron S/4,200 este mes — un 35% más que consultas generales. Representan el 28% de tus ingresos totales.",
  },
  {
    question: "¿Qué doctor tuvo más cancelaciones?",
    answer: "Dr. Ramos tuvo 8 cancelaciones este mes (23% de sus citas). La mayoría fueron los lunes por la mañana. Sugiero revisar su disponibilidad.",
  },
  {
    question: "¿Cómo puedo optimizar los horarios del martes?",
    answer: "Los martes tienes 40% de slots vacíos entre 2-4pm. Mover consultas de seguimiento a esas horas liberaría la mañana para nuevos pacientes.",
  },
  {
    question: "¿Cuántos pacientes nuevos tuve vs recurrentes?",
    answer: "Este mes: 45 nuevos, 128 recurrentes. Tu tasa de retención es del 74% — 8 puntos arriba vs. el mes pasado.",
  },
];

const tiers = [
  { label: "Básico", plan: "Independiente", color: "bg-slate-100 text-slate-600" },
  { label: "Avanzado", plan: "Centro Médico", color: "bg-blue-100 text-blue-700" },
  { label: "Máximo", plan: "Clínica", color: "bg-emerald-100 text-emerald-700" },
];

export function AIAssistant() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visibleMessages, setVisibleMessages] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-in");
          // Stagger chat messages
          let count = 0;
          const interval = setInterval(() => {
            count++;
            setVisibleMessages(count);
            if (count >= chatExamples.length) clearInterval(interval);
          }, 400);
          observer.disconnect();
          return () => clearInterval(interval);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 sm:py-28 bg-slate-50/50 overflow-hidden">
      <div ref={sectionRef} className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Text */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Incluido en todos los planes
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              IA incluida en todos los planes.{" "}
              <span className="text-emerald-600">No es un extra.</span>
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Cada plan incluye un asistente inteligente que analiza tu operación
              y te ayuda a tomar mejores decisiones. No reemplaza doctores.
              Potencia administradores.
            </p>

            {/* Tier pills */}
            <div className="mt-6 flex flex-wrap gap-2">
              {tiers.map((t) => (
                <span
                  key={t.label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${t.color}`}
                >
                  {t.label}
                  <span className="text-[10px] opacity-60">— {t.plan}</span>
                </span>
              ))}
            </div>

            <p className="mt-6 text-[11px] text-slate-400 leading-relaxed max-w-md">
              El asistente IA analiza datos operativos y administrativos.
              No realiza diagnósticos médicos ni accede a información clínica de pacientes.
            </p>
          </div>

          {/* Right: Chat UI mockup */}
          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 bg-slate-50/80">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
                  <BrainCircuit className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Asistente IA</p>
                  <p className="text-[10px] text-emerald-500 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                    En línea
                  </p>
                </div>
              </div>

              {/* Chat messages */}
              <div className="p-4 space-y-3 min-h-[320px] max-h-[400px] overflow-hidden bg-gradient-to-b from-white to-slate-50/30">
                {chatExamples.map((msg, i) => (
                  <div
                    key={i}
                    className={`transition-all duration-500 ${
                      i < visibleMessages
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-4"
                    }`}
                  >
                    {/* User question */}
                    <div className="flex justify-end mb-2">
                      <div className="rounded-2xl rounded-br-md bg-emerald-500 px-3.5 py-2 text-xs text-white max-w-[80%] shadow-sm">
                        {msg.question}
                      </div>
                    </div>
                    {/* AI answer */}
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-xs text-slate-700 max-w-[85%] leading-relaxed">
                        {msg.answer}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat input */}
              <div className="border-t border-slate-100 px-4 py-3 bg-white">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-400 flex-1">
                    Pregunta algo sobre tu clínica...
                  </span>
                  <div className="h-7 w-7 rounded-md gradient-primary flex items-center justify-center">
                    <Send className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
