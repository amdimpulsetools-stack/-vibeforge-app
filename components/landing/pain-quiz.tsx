"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import { SuccessCheck } from "@/components/ui/success-check";

// ── Preguntas ───────────────────────────────────────────────────────────────
// Cinco, ni una más. Regla de diseño: cada respuesta tiene que mover algo
// visible en el resultado (cifra, bullet del análisis, beneficio de la
// tarjeta o plan). Una pregunta que no mueve nada se corta.

type QuestionId = "agenda" | "volumen" | "noshows" | "recepcion" | "doctores";
type Answers = Partial<Record<QuestionId, string>>;

interface Question {
  id: QuestionId;
  title: string;
  options: { id: string; label: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: "agenda",
    title: "¿Dónde está tu agenda de citas ahora mismo?",
    options: [
      { id: "papel", label: "En un cuaderno o agenda de papel" },
      { id: "excel", label: "En Excel o Google Calendar" },
      { id: "whatsapp", label: "En WhatsApp — entre los mensajes" },
      { id: "sistema", label: "En un sistema, pero no me convence" },
      { id: "todo", label: "Un poco de todo, la verdad" },
    ],
  },
  {
    id: "volumen",
    title: "En un día normal, ¿cuántos pacientes atiende cada doctor?",
    options: [
      { id: "v5", label: "Hasta 5" },
      { id: "v10", label: "Entre 6 y 10" },
      { id: "v15", label: "Entre 11 y 15" },
      { id: "v15p", label: "Más de 15" },
    ],
  },
  {
    id: "noshows",
    title: "De cada 10 pacientes que reservan, ¿cuántos no llegan?",
    options: [
      { id: "n0", label: "Casi todos llegan (0 o 1)" },
      { id: "n2", label: "Como 2" },
      { id: "n3", label: "3 o más" },
      { id: "nns", label: "No lo sé con exactitud" },
    ],
  },
  {
    id: "recepcion",
    title: "Si mañana tu recepcionista no viene a trabajar, ¿qué pasa?",
    options: [
      { id: "normal", label: "Todo sigue normal, la información está a la mano" },
      { id: "medio", label: "Me las arreglo, pero pierdo medio día" },
      { id: "nadie", label: "Nadie sabe quién viene ni quién debe" },
      { id: "para", label: "Se para la clínica" },
      { id: "yo", label: "No tengo recepcionista, lo hago yo" },
    ],
  },
  {
    id: "doctores",
    title: "¿Cuántos doctores atienden en tu clínica, incluyéndote?",
    options: [
      { id: "d1", label: "Solo yo" },
      { id: "d3", label: "2 o 3" },
      { id: "d10", label: "Entre 4 y 10" },
      { id: "d10p", label: "Más de 10" },
    ],
  },
];

// ── Modelo numérico ─────────────────────────────────────────────────────────
// Mismo modelo que la calculadora de revenue-impact (no-shows −40% + 4% de
// captación) para que la landing no tenga dos verdades. Deliberadamente más
// conservador que ella: tarifa S/120 fija (la calculadora usa 150 editable),
// banda baja de cada rango, solo el mes (nunca anualiza) y techo de
// credibilidad: sobre S/15,000 la cifra en soles se oculta y el titular pasa
// a ser el conteo de pacientes — una cifra increíble después de invertir 5
// respuestas quema más confianza que ninguna cifra.

const PACIENTES_DIA: Record<string, number> = { v5: 4, v10: 8, v15: 13, v15p: 17 };
const DOCTORES: Record<string, number> = { d1: 1, d3: 2, d10: 5, d10p: 10 };
const NO_SHOW: Record<string, number> = { n0: 0.1, n2: 0.2, n3: 0.3, nns: 0.2 };

const TARIFA = 120;
const DIAS_MES = 22;
const TECHO_SOLES = 15000;

function roundSoles(n: number) {
  const step = n < 3000 ? 50 : n < 10000 ? 100 : 500;
  return Math.round(n / step) * step;
}

function computeQuizResult(a: Answers) {
  const pacientesDia = PACIENTES_DIA[a.volumen ?? ""] ?? 8;
  const doctores = DOCTORES[a.doctores ?? ""] ?? 1;
  const noShow = NO_SHOW[a.noshows ?? ""] ?? 0.2;
  const citasMes = doctores * pacientesDia * DIAS_MES;
  const tasaRecup = noShow * 0.4 + 0.04;
  const pacientesRecup = Math.round(citasMes * noShow * 0.4);
  const solesPunto = citasMes * TARIFA * tasaRecup;
  const hi = roundSoles(solesPunto);
  const lo = roundSoles(solesPunto * 0.7);
  return {
    pacientesDia,
    doctores,
    citasMes,
    pacientesRecup,
    lo,
    hi,
    overCap: solesPunto > TECHO_SOLES,
  };
}

// Mismos umbrales que planForDoctors (revenue-impact.tsx) — el plan lo decide
// SOLO la pregunta de doctores. Subir de tier por otra respuesta sería vender
// de más, y se nota.
function planFor(doctoresOpt: string) {
  if (doctoresOpt === "d1")
    return {
      name: "Independiente",
      price: 129,
      anchor: "Un solo paciente que no falta al mes ya te pagó el sistema",
    };
  if (doctoresOpt === "d3")
    return {
      name: "Centro Médico",
      price: 349,
      anchor: "3 consultas al mes cubren el plan completo",
    };
  return {
    name: "Clínica",
    price: 649,
    anchor: "Un tratamiento de S/700 al mes cubre la suscripción de toda la clínica",
  };
}

// ── Plantillas del análisis ─────────────────────────────────────────────────
// Cada bullet cita textualmente la opción elegida: la cita es la prueba de
// que el sistema escuchó. Sin ella, cualquier análisis suena a horóscopo.

const INSIGHT_AGENDA: Record<string, string> = {
  papel:
    "Tu historia clínica vive en papel. Cada paciente que vuelve después de seis meses es una búsqueda manual — y lo que no encuentras, lo vuelves a preguntar.",
  excel:
    "El Excel funciona hasta que dos personas lo abren a la vez. Ahí empiezan las citas duplicadas y los cobros que nadie registró.",
  whatsapp:
    "Tu agenda está adentro de un chat. Eso significa que tu número personal es la central de citas de la clínica — a las once de la noche también.",
  sistema:
    "Ya pagas por un sistema que no usas al 100%. Ese es el gasto más caro que existe: pagas la licencia y sigues haciendo el trabajo a mano.",
  todo: "Tu información está repartida en tres lugares y ninguno tiene la foto completa. Por eso nunca sabes con certeza cuánto facturaste esta semana.",
};

const INSIGHT_NOSHOW: Record<string, string> = {
  n0: "Tu asistencia está mejor que el promedio. Entonces tu riesgo no son los no-shows: es que ese control depende de que alguien esté llamando uno por uno.",
  n2: "Estás justo en el promedio: 2 de cada 10 no llega. Con recordatorio automático por WhatsApp, ese número baja a 1 de cada 8.",
  n3: "3 de cada 10 es una sangría. No es culpa tuya ni del paciente: es que nadie le recordó, y el que se olvida no avisa.",
  nns: "Y ese es el dato más importante de todos: si no sabes cuántos no llegan, no puedes saber cuánto te cuesta. Para el cálculo usamos el promedio, 2 de cada 10.",
};

const INSIGHT_RECEPCION: Record<string, string> = {
  normal:
    "Bien. Entonces tu prioridad no es ordenar, es crecer: sumar doctores sin sumar caos.",
  medio:
    "Medio día perdido cada vez que falta una persona. Eso no es un problema de tu recepcionista: es un problema de dónde está guardada la información.",
  nadie:
    "Hoy tu clínica tiene un solo punto de falla, y es una persona. El día que renuncie, se va con la información en la cabeza.",
  para: "Tu clínica no se detiene si faltas tú, pero sí si falta ella. Eso es riesgo operativo puro.",
  yo: "Estás haciendo dos trabajos: el de doctor y el de secretaria. Cada hora que pasas coordinando citas es una hora que no facturas.",
};

const PROFILE_BASE: Record<string, string> = {
  d1: "consultorio independiente",
  d3: "centro médico",
  d10: "clínica",
  d10p: "clínica grande",
};

const PROFILE_FRAG: Record<string, string> = {
  papel: "con la agenda en papel",
  excel: "que corre en Excel",
  whatsapp: "con la agenda dentro de WhatsApp",
  sistema: "con un sistema que no convence",
  todo: "con la información repartida en varios lados",
};

function priorityLine(a: Answers): string {
  if (a.noshows === "n3")
    return "Recuperar las sillas vacías — recordatorios automáticos por WhatsApp desde la primera semana.";
  if (a.recepcion === "nadie" || a.recepcion === "para")
    return "Sacar la información de una sola cabeza: que la clínica funcione aunque falte cualquiera.";
  if (a.noshows === "nns")
    return "Medir. No puedes recuperar lo que no estás viendo — Yenda te da el número real desde el día 1.";
  if (a.agenda === "papel" || a.agenda === "todo" || a.agenda === "whatsapp")
    return "Una sola agenda para todo el equipo, con la historia y los cobros pegados a cada cita.";
  return "Crecer sin sumar caos: cada doctor con su agenda, sus cobros y sus reportes.";
}

// Los beneficios de la tarjeta: mismo plan, orden distinto según respuestas.
// Cada uno lleva su etiqueta de origen ("Porque respondiste…") — la
// personalización visible es lo que separa esto de una tarjeta genérica.
function buildBenefits(a: Answers, planName: string) {
  const out: { text: string; tag: string }[] = [];
  const labelOf = (qid: QuestionId) => {
    const q = QUESTIONS.find((x) => x.id === qid)!;
    return q.options.find((o) => o.id === a[qid])?.label ?? "";
  };
  const push = (text: string, qid: QuestionId) => {
    if (!out.some((b) => b.text === text)) out.push({ text, tag: labelOf(qid) });
  };

  if (a.noshows === "n0") push("Reserva online 24/7 para tus pacientes", "noshows");
  else
    push(
      "Recordatorios por WhatsApp y email + confirmación del paciente",
      "noshows"
    );

  if (a.agenda === "whatsapp")
    push("Reserva online: tu número deja de ser la central de citas", "agenda");
  else if (a.agenda === "sistema")
    push("Historia clínica SOAP + recetas, todo ligado a la cita", "agenda");
  else
    push(
      "Pasamos tus pacientes desde tu Excel o tu sistema actual — nosotros, no tú",
      "agenda"
    );

  if (a.recepcion === "yo")
    push("El paciente reserva solo por el portal; tú solo atiendes", "recepcion");
  else if (a.recepcion === "normal")
    push("Reportes por doctor y por sede, exportables a CSV", "recepcion");
  else if (planName === "Independiente")
    push(
      "Citas, cobros y deudas en un solo lugar — nada vive en la cabeza de nadie",
      "recepcion"
    );
  else
    push(
      "4 roles y permisos: cada quien ve lo suyo, nada depende de una sola persona",
      "recepcion"
    );

  if (a.doctores === "d1") push("Cobros y control de deudas", "doctores");
  else if (a.doctores === "d3")
    push("Resumen diario del equipo por email", "doctores");
  else
    push(
      "Te acompañamos por videollamada hasta que tu clínica esté funcionando",
      "doctores"
    );

  return out.slice(0, 4);
}

// ── Estado ──────────────────────────────────────────────────────────────────

type Phase = "quiz" | "analyzing" | "result";

interface State {
  step: number;
  answers: Answers;
  phase: Phase;
}

type Action =
  | { type: "answer"; qid: QuestionId; opt: string }
  | { type: "advance" }
  | { type: "back" }
  | { type: "analyzed" }
  | { type: "reset" }
  | { type: "restore"; state: State };

const INITIAL: State = { step: 0, answers: {}, phase: "quiz" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "answer":
      return {
        ...state,
        answers: { ...state.answers, [action.qid]: action.opt },
      };
    case "advance": {
      if (state.phase !== "quiz") return state;
      if (!state.answers[QUESTIONS[state.step].id]) return state;
      if (state.step === QUESTIONS.length - 1)
        return { ...state, phase: "analyzing" };
      return { ...state, step: state.step + 1 };
    }
    case "back":
      if (state.phase !== "quiz" || state.step === 0) return state;
      return { ...state, step: state.step - 1 };
    case "analyzed":
      return { ...state, phase: "result" };
    case "reset":
      return INITIAL;
    case "restore":
      return action.state;
    default:
      return state;
  }
}

const STORAGE_KEY = "yenda-quiz";

// ── Componente ──────────────────────────────────────────────────────────────

export function PainQuiz() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  // true durante los 400ms del auto-avance de una primera respuesta: en ese
  // lapso el botón Continuar no aparece (evita el doble avance).
  const [pendingAuto, setPendingAuto] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { step, answers, phase } = state;

  // Restaurar de sessionStorage: el visitante que completó el quiz y vuelve
  // a scrollear encuentra su resultado, no el paso 1.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as State;
      const complete = QUESTIONS.every((q) => saved.answers?.[q.id]);
      if (saved.phase === "result" && complete) {
        dispatch({ type: "restore", state: { ...saved, phase: "result" } });
      } else if (saved.answers && typeof saved.step === "number") {
        dispatch({
          type: "restore",
          state: {
            step: Math.min(Math.max(saved.step, 0), QUESTIONS.length - 1),
            answers: saved.answers,
            phase: "quiz",
          },
        });
      }
    } catch {
      // sessionStorage bloqueado: el quiz simplemente arranca de cero
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          step,
          answers,
          phase: phase === "result" ? "result" : "quiz",
        })
      );
    } catch {
      // sin persistencia, sin drama
    }
  }, [step, answers, phase]);

  // La pantalla de "Analizando…" dura 700ms: suficiente para que el resultado
  // se sienta calculado, corto para un visitante en 4G.
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setTimeout(() => dispatch({ type: "analyzed" }), 700);
    return () => clearTimeout(t);
  }, [phase]);

  // Al completar, pre-carga los sliders de la calculadora de RevenueImpact:
  // el visitante baja y encuentra su propia clínica ya cargada, con la
  // tarifa editable. Un número que él sube con su mano no genera resistencia.
  useEffect(() => {
    if (phase !== "result") return;
    const r = computeQuizResult(answers);
    const apptPerDoctor = Math.min(
      150,
      Math.max(20, Math.round((r.pacientesDia * DIAS_MES) / 5) * 5)
    );
    window.dispatchEvent(
      new CustomEvent("yenda:quiz-result", {
        detail: { doctors: Math.min(20, r.doctores), apptPerDoctor },
      })
    );
  }, [phase, answers]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const select = (qid: QuestionId, opt: string) => {
    const isFirstAnswer = !answers[qid];
    dispatch({ type: "answer", qid, opt });
    // Auto-avance solo en la primera respuesta del paso: al corregir una
    // respuesta anterior el visitante quiere ver lo que eligió, no que la
    // pantalla se le escape — ahí aparece Continuar.
    if (isFirstAnswer) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setPendingAuto(true);
      timerRef.current = setTimeout(() => {
        setPendingAuto(false);
        dispatch({ type: "advance" });
      }, 400);
    }
  };

  const goBack = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingAuto(false);
    dispatch({ type: "back" });
  };

  const goNext = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingAuto(false);
    dispatch({ type: "advance" });
  };

  const reset = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    dispatch({ type: "reset" });
  };

  // Flechas mueven el foco sin seleccionar; Enter/Espacio confirman (el click
  // nativo del botón). Divergencia deliberada: elegir con flechas dispararía
  // el auto-avance a mitad de exploración.
  const onGroupKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key))
      return;
    e.preventDefault();
    const btns = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']")
    );
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    const next = btns[(idx + dir + btns.length) % btns.length];
    next?.focus({ preventScroll: true });
  };

  // Micro-recompensa en la cabecera del paso siguiente (nunca interstitial:
  // un interstitial cuesta un tap y el tap es el recurso escaso).
  const kickerFor = (idx: number): string | null => {
    if (idx === 2 && answers.volumen) {
      const citas = PACIENTES_DIA[answers.volumen] * DIAS_MES;
      return `≈ ${citas} citas al mes pasan por tu agenda.`;
    }
    if (idx === 3 && answers.noshows && answers.volumen) {
      if (answers.noshows === "nns")
        return "Como referencia: en el promedio del sector, 2 de cada 10 no llegan.";
      const sillas = Math.round(
        PACIENTES_DIA[answers.volumen] * DIAS_MES * NO_SHOW[answers.noshows]
      );
      return `Eso son unas ${sillas} sillas vacías al mes.`;
    }
    if (idx === 4) return "Última. Con esto calculamos tu plan.";
    return null;
  };

  return (
    <section className="relative pt-48 pb-24 sm:pt-64 sm:pb-36 bg-slate-950 overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-teal-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Header: la promesa completa se entiende sin participar — el que
            solo hace scroll igual recibe el mensaje. */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />5 preguntas ·
            30 segundos · sin correo
          </div>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            ¿Cuánta plata se te está escapando?
          </h2>
          <p className="mt-4 text-base text-slate-400 max-w-xl mx-auto">
            Responde 5 preguntas y te lo decimos al toque: tu diagnóstico y el
            plan exacto que le toca a tu clínica. Sin registrarte.
          </p>
        </div>

        {/* Anuncio para lector de pantalla: una sola región, fuera del stage */}
        <div aria-live="polite" className="sr-only">
          {phase === "quiz"
            ? `Pregunta ${step + 1} de ${QUESTIONS.length}: ${QUESTIONS[step].title}`
            : phase === "analyzing"
              ? "Analizando tus respuestas"
              : "Diagnóstico listo"}
        </div>

        {phase !== "result" ? (
          <div className="mx-auto max-w-2xl">
            {/* Progreso: 5 segmentos. El primero llega lleno (progreso
                dotado): entrar a un proceso ya empezado sube la tasa de
                finalización. */}
            <div className="flex items-center gap-3 mb-8">
              <div className="flex flex-1 gap-1.5">
                {QUESTIONS.map((q, i) => (
                  <div
                    key={q.id}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className={`h-full rounded-full bg-emerald-400 origin-left transition-transform duration-[var(--dur-slow)] ease-[var(--ease-standard)] ${
                        i <= step ? "scale-x-100" : "scale-x-0"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <span className="text-xs font-semibold tabular-nums text-slate-400">
                Pregunta {Math.min(step + 1, QUESTIONS.length)} de{" "}
                {QUESTIONS.length}
              </span>
            </div>

            {/* Stage apilado: todos los pasos ocupan la misma celda del grid,
                el alto es el del paso más alto → cero saltos de layout y cero
                scroll secuestrado. Los inactivos quedan inert. */}
            <div className="relative grid overflow-hidden">
              {QUESTIONS.map((q, idx) => {
                const active = phase === "quiz" && idx === step;
                const kicker = kickerFor(idx);
                return (
                  <div
                    key={q.id}
                    inert={!active}
                    className={`col-start-1 row-start-1 transition-[opacity,transform] duration-[var(--dur-slow)] ease-[var(--ease-standard)] ${
                      active
                        ? "opacity-100 translate-x-0"
                        : "pointer-events-none opacity-0 motion-safe:translate-x-4"
                    }`}
                  >
                    {kicker && (
                      <p className="mb-2 text-xs font-semibold text-emerald-300">
                        {kicker}
                      </p>
                    )}
                    <h3
                      id={`quiz-q-${q.id}`}
                      className="text-xl sm:text-2xl font-bold text-white mb-6"
                    >
                      {q.title}
                    </h3>
                    <div
                      role="radiogroup"
                      aria-labelledby={`quiz-q-${q.id}`}
                      onKeyDown={onGroupKeyDown}
                      className="flex flex-col gap-3"
                    >
                      {q.options.map((opt, i) => {
                        const selected = answers[q.id] === opt.id;
                        const focusable = answers[q.id]
                          ? selected
                          : i === 0;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            tabIndex={focusable ? 0 : -1}
                            onClick={() => select(q.id, opt.id)}
                            className={`group flex min-h-14 w-full cursor-pointer items-center gap-4 rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                              selected
                                ? "border-emerald-400/50 bg-emerald-500/[0.08] text-white shadow-[0_0_0_1px_rgb(52_211_153/0.15),0_8px_32px_-8px_rgb(16_185_129/0.25)]"
                                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-emerald-400/30 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            {/* Círculo que se convierte en check */}
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                                selected
                                  ? "scale-110 border-emerald-400 bg-emerald-400"
                                  : "border-slate-600 bg-transparent group-hover:border-emerald-400/60 group-hover:bg-emerald-400/10"
                              }`}
                            >
                              <Check
                                className={`h-3 w-3 text-slate-950 transition-all duration-300 ${
                                  selected
                                    ? "scale-100 opacity-100"
                                    : "scale-50 opacity-0"
                                }`}
                                strokeWidth={3.5}
                              />
                            </span>
                            <span className="text-[15px] font-medium leading-snug">
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Analizando… ocupa la misma celda que las preguntas */}
              {phase === "analyzing" && (
                <div className="col-start-1 row-start-1 flex items-center justify-center py-20">
                  <p className="animate-pulse text-base font-semibold text-emerald-300">
                    Analizando tus respuestas…
                  </p>
                </div>
              )}
            </div>

            {/* Controles fuera del stage: no se mueven entre pasos */}
            {phase === "quiz" && (
              <div className="mt-6 flex min-h-11 items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white ${
                    step === 0 ? "invisible" : ""
                  }`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>
                {answers[QUESTIONS[step].id] && !pendingAuto && (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    {step === QUESTIONS.length - 1
                      ? "Ver mi diagnóstico"
                      : "Continuar"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <QuizResult answers={answers} onReset={reset} />
        )}
      </div>
    </section>
  );
}

// ── Resultado ───────────────────────────────────────────────────────────────
// Izquierda (7 cols): el análisis — primero la justificación, después el
// precio. En móvil el orden es el mismo: precio primero sin análisis es una
// objeción sin anestesia.

function QuizResult({
  answers,
  onReset,
}: {
  answers: Answers;
  onReset: () => void;
}) {
  const r = computeQuizResult(answers);
  const plan = planFor(answers.doctores ?? "d1");
  const benefits = buildBenefits(answers, plan.name);

  const labelOf = (qid: QuestionId) => {
    const q = QUESTIONS.find((x) => x.id === qid)!;
    return q.options.find((o) => o.id === answers[qid])?.label ?? "";
  };

  const profile = `${PROFILE_BASE[answers.doctores ?? "d1"]} ${PROFILE_FRAG[answers.agenda ?? "todo"]}`;

  const bullets: { quote: string; text: string }[] = [
    { quote: labelOf("agenda"), text: INSIGHT_AGENDA[answers.agenda ?? "todo"] },
    { quote: labelOf("noshows"), text: INSIGHT_NOSHOW[answers.noshows ?? "nns"] },
    {
      quote: labelOf("recepcion"),
      text: INSIGHT_RECEPCION[answers.recepcion ?? "medio"],
    },
  ];
  if (r.doctores >= 2) {
    bullets.push({
      quote: labelOf("doctores"),
      text: "Con varios doctores, además, las boletas y facturas dejan de cuadrarse a mano: salen electrónicas a SUNAT desde la misma cita.",
    });
  }

  const fmt = (n: number) => n.toLocaleString("es-PE");
  const rangeLabel =
    r.lo >= r.hi ? `≈ S/ ${fmt(r.hi)}` : `S/ ${fmt(r.lo)} – ${fmt(r.hi)}`;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-12">
      {/* Análisis */}
      <div
        className="quiz-col lg:col-span-7"
        style={{ "--col-delay": "0ms" } as React.CSSProperties}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          <SuccessCheck size={14} />
          Diagnóstico listo
        </div>

        <p className="mt-4 text-sm text-slate-400">
          Tu perfil:{" "}
          <span className="font-semibold text-white">{profile}</span>
        </p>

        <div className="mt-5">
          {!r.overCap ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Se te está escapando aprox.
              </p>
              <div className="mt-1 text-4xl sm:text-5xl font-extrabold tracking-tight text-emerald-300 tabular-nums">
                <NumberPopIn value={rangeLabel} />
                <span className="ml-1 text-xl font-semibold text-slate-400">
                  /mes
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                ≈ {r.pacientesRecup} pacientes recuperados al mes con
                recordatorios automáticos y reserva online.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Con tu volumen de citas, recuperas
              </p>
              <div className="mt-1 text-4xl sm:text-5xl font-extrabold tracking-tight text-emerald-300 tabular-nums">
                <NumberPopIn value={`≈ ${fmt(r.pacientesRecup)} pacientes`} />
                <span className="ml-1 text-xl font-semibold text-slate-400">
                  /mes
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                A tu escala, la cifra en soles depende mucho de tu tarifa real
                — ajústala en la calculadora de aquí abajo.
              </p>
            </>
          )}
        </div>

        <ul className="mt-7 space-y-4">
          {bullets.map((b) => (
            <li key={b.quote} className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <div>
                <p className="text-xs italic text-slate-500">“{b.quote}”</p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-300">
                  {b.text}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm font-semibold text-emerald-300">
          Prioridad #1: {priorityLine(answers)}
        </p>

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Supuestos: tarifa conservadora de S/120 por cita, 22 días al mes,
          no-shows bajando ~40% con recordatorios y +4% de reservas online. El
          rango bajo asume que solo 7 de cada 10 pacientes contestan el
          recordatorio.{" "}
          <a
            href="#revenue-impact"
            className="font-semibold text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            Ajusta tus números en la calculadora ↓
          </a>
        </p>

        <button
          type="button"
          onClick={onReset}
          className="mt-4 text-xs text-slate-500 underline underline-offset-2 transition-colors hover:text-slate-300"
        >
          Volver a responder
        </button>
      </div>

      {/* Plan recomendado — borde degradado propio (la clase .pricing-popular
          está calibrada para fondo blanco y trae animaciones infinitas). */}
      <div
        className="quiz-col lg:col-span-5"
        style={{ "--col-delay": "110ms" } as React.CSSProperties}
      >
        <div className="rounded-2xl bg-gradient-to-b from-emerald-400/50 via-emerald-400/15 to-white/5 p-px">
          <div className="rounded-[15px] bg-slate-950/85 p-6 sm:p-7">
            <div className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              Tu plan según tus respuestas
            </div>

            <h3 className="mt-4 text-2xl font-extrabold text-white">
              {plan.name}
            </h3>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tight text-white tabular-nums">
                S/{plan.price}
              </span>
              <span className="text-sm text-slate-400">/mes</span>
            </div>
            <p className="mt-2 text-sm text-emerald-300/90">{plan.anchor}</p>

            <ul className="mt-6 space-y-3.5">
              {benefits.map((b) => (
                <li key={b.text} className="flex items-start gap-3">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                    strokeWidth={3}
                  />
                  <div>
                    <p className="text-sm leading-snug text-slate-200">
                      {b.text}
                    </p>
                    {b.tag && (
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Porque respondiste: “{b.tag}”
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {answers.doctores === "d10p" && (
              <p className="mt-4 text-xs text-slate-400">
                Incluye hasta 10 doctores; los adicionales los agregas sueltos,
                sin cambiar de plan.
              </p>
            )}

            <Link
              href="/register"
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 active:scale-[0.98]"
            >
              Empezar mis 14 días gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-2 text-center text-xs text-slate-500">
              Sin tarjeta. Cancelas cuando quieras.
            </p>

            {/* Válvula anti-encierro: el comprador quiere ver el menú
                completo antes de decidir; negárselo cierra pestañas. */}
            <a
              href="#pricing"
              className="mt-4 block text-center text-sm font-medium text-slate-400 underline underline-offset-4 transition-colors hover:text-white"
            >
              Comparar los 3 planes
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
