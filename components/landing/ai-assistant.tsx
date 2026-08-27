"use client";

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Send, Sparkles } from "lucide-react";

const chatExamples = [
  {
    question: "¿Qué servicio facturó más este mes?",
    answer: "Ecografías facturaron S/4,200 este mes, un 35% más que consultas generales. Representan el 28% de tus ingresos totales.",
  },
  {
    question: "¿Qué doctor tuvo más cancelaciones?",
    answer: "Dr. Ramos tuvo 8 cancelaciones este mes (23% de sus citas). La mayoría fueron los lunes por la mañana. Sugiero revisar su disponibilidad.",
  },
  {
    question: "¿Cómo puedo optimizar los horarios del martes?",
    answer: "Los martes tienes 40% de la agenda vacía entre 2-4pm. Mover consultas de seguimiento a esas horas liberaría la mañana para nuevos pacientes.",
  },
  {
    question: "¿Cuántos pacientes nuevos tuve vs recurrentes?",
    answer: "Este mes: 45 nuevos, 128 recurrentes. Tu tasa de retención es del 74%, 8 puntos arriba vs. el mes pasado.",
  },
];

const tiers = [
  { label: "Básico", plan: "Independiente", color: "bg-slate-100 text-slate-600" },
  { label: "Avanzado", plan: "Centro Médico", color: "bg-blue-100 text-blue-700" },
  { label: "Máximo", plan: "Clínica", color: "bg-emerald-100 text-emerald-700" },
];

export function AIAssistant() {
  const sectionRef = useRef<HTMLDivElement>(null);
  // La demo es INTERACTIVA (auditoría 2026-08-21): el visitante elige la
  // pregunta y ve la respuesta escribirse. Es la diferencia entre "dicen
  // que tienen IA" y "vi la IA". Al entrar en pantalla se dispara la
  // primera pregunta sola, como invitación.
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ask = (idx: number) => {
    if (typingRef.current) clearInterval(typingRef.current);
    setActiveIdx(idx);
    setTyped("");
    const answer = chatExamples[idx].answer;
    let i = 0;
    typingRef.current = setInterval(() => {
      i += 2;
      setTyped(answer.slice(0, i));
      if (i >= answer.length && typingRef.current) {
        clearInterval(typingRef.current);
        typingRef.current = null;
      }
    }, 18);
  };

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-in");
          ask(0);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    // El intervalo de typing se limpia AQUÍ, en el cleanup del efecto — el
    // original lo devolvía dentro del callback del observer, que ignora el
    // valor de retorno: el setInterval nunca moría al desmontar.
    return () => {
      observer.disconnect();
      if (typingRef.current) clearInterval(typingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="py-20 sm:py-28 bg-slate-50 border-y border-slate-100 overflow-hidden">
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
              Pregúntale a tu clínica lo que le preguntarías a un contador: en
              español, y te responde al toque. Qué servicio facturó más,
              qué doctor tuvo más cancelaciones, cuántos pacientes vinieron de
              Instagram. Incluido en los tres planes, sin costo aparte.
            </p>

            {/* Tier pills */}
            <div className="mt-6 flex flex-wrap gap-2">
              {tiers.map((t) => (
                <span
                  key={t.label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${t.color}`}
                >
                  {t.label}
                  <span className="text-[10px] opacity-60">· {t.plan}</span>
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

              {/* Chat: chips de pregunta + respuesta con typing. Sin
                  max-h + overflow-hidden (el original recortaba el cuarto
                  turno en silencio). */}
              <div className="p-4 min-h-[300px] bg-gradient-to-b from-white to-slate-50/30">
                <p className="text-xs font-medium text-slate-500 mb-2.5">
                  Prueba una pregunta real:
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {chatExamples.map((msg, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => ask(i)}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        activeIdx === i
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                      }`}
                    >
                      {msg.question}
                    </button>
                  ))}
                </div>
                {activeIdx !== null && (
                  <div aria-live="polite">
                    <div className="flex justify-end mb-2">
                      <div className="rounded-2xl rounded-br-md bg-emerald-500 px-3.5 py-2 text-xs text-white max-w-[80%] shadow-sm">
                        {chatExamples[activeIdx].question}
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-xs text-slate-700 max-w-[85%] leading-relaxed min-h-[2rem]">
                        {typed}
                        {typed.length < chatExamples[activeIdx].answer.length && (
                          <span className="inline-block w-1 h-3 ml-0.5 bg-emerald-500 animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="border-t border-slate-100 px-4 py-3 bg-white">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-400 flex-1">
                    Elige una pregunta arriba: así se siente por dentro
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
