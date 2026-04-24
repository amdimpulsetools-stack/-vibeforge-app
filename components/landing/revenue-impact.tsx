"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarX2,
  Wallet,
  Repeat2,
  UserPlus,
  TrendingUp,
  Info,
} from "lucide-react";

// ── Revenue-loss sources ────────────────────────────────────────────────────
// Each card represents money a typical Peruvian clinic loses every month
// because of gaps Yenda closes. Numbers come from common industry ranges
// (no-show 15–25% without reminders; recovery of forgotten debts ~60%;
// retention with scheduled follow-ups; % bump from 24/7 online booking).

interface Leak {
  icon: React.ElementType;
  title: string;
  loss: string;
  recovered: string;
  detail: string;
  iconBg: string;
  accent: string;
}

const leaks: Leak[] = [
  {
    icon: CalendarX2,
    title: "No-shows",
    loss: "15–25% de tu agenda",
    recovered: "Hasta 38% menos",
    detail:
      "Recordatorios por email y WhatsApp + confirmación desde el portal. El paciente que olvida, te avisa a tiempo.",
    iconBg: "bg-rose-100 text-rose-600",
    accent: "text-rose-600",
  },
  {
    icon: Wallet,
    title: "Cobranza pendiente",
    loss: "S/ 500–1,200 al mes",
    recovered: "60–80% recuperado",
    detail:
      "Cada cita muestra cuánto debe el paciente. Nada se pasa por alto, aunque cambie la recepcionista.",
    iconBg: "bg-amber-100 text-amber-600",
    accent: "text-amber-600",
  },
  {
    icon: Repeat2,
    title: "Pacientes que no vuelven",
    loss: "40% sin seguimiento",
    recovered: "+15% retención",
    detail:
      "Planes de tratamiento con saldo, follow-ups automáticos y portal del paciente. El ciclo no se rompe.",
    iconBg: "bg-purple-100 text-purple-600",
    accent: "text-purple-600",
  },
  {
    icon: UserPlus,
    title: "Captación frenada",
    loss: "Solo por llamada",
    recovered: "+8–12% nuevos",
    detail:
      "Booking público 24/7 en tu web. El paciente reserva de madrugada, tú lo recibes en la agenda.",
    iconBg: "bg-emerald-100 text-emerald-600",
    accent: "text-emerald-600",
  },
];

// ── ROI calculator ──────────────────────────────────────────────────────────
// Model (conservative):
//   monthlyAppointments = doctors * appointmentsPerDoctorPerMonth
//   no-show loss today ≈ 20% of (appointments * price)
//   Yenda reduces that to ≈ 5%
//   additional capture from 24/7 booking ≈ 8%
// Final number = (noShowSaved + captureGain)

function computeRecovery(
  doctors: number,
  apptPerDoctor: number,
  avgPrice: number
) {
  const monthlyAppts = doctors * apptPerDoctor;
  const monthlyRevenueAtFull = monthlyAppts * avgPrice;
  const noShowLossToday = monthlyRevenueAtFull * 0.2;
  const noShowLossWithYenda = monthlyRevenueAtFull * 0.05;
  const noShowSaved = noShowLossToday - noShowLossWithYenda;
  const captureGain = monthlyRevenueAtFull * 0.08;
  return Math.round(noShowSaved + captureGain);
}

function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE")}`;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {value.toLocaleString("es-PE")}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full bg-slate-200 appearance-none cursor-pointer accent-emerald-600"
      />
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>
          {min.toLocaleString("es-PE")}
          {suffix}
        </span>
        <span>
          {max.toLocaleString("es-PE")}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function useAnimatedNumber(target: number, duration = 400) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    const delta = target - initial;
    let raf = 0;
    function step(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(initial + delta * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function ROICalculator() {
  const [doctors, setDoctors] = useState(3);
  const [apptPerDoctor, setApptPerDoctor] = useState(60);
  const [avgPrice, setAvgPrice] = useState(150);

  const monthly = computeRecovery(doctors, apptPerDoctor, avgPrice);
  const yearly = monthly * 12;
  const displayMonthly = useAnimatedNumber(monthly);
  const displayYearly = useAnimatedNumber(yearly);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Controls */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Calcula tu recuperación
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Mueve los controles según tu realidad. Los números se actualizan
              al instante.
            </p>
          </div>

          <Slider
            label="Doctores en tu clínica"
            value={doctors}
            min={1}
            max={20}
            step={1}
            suffix=""
            onChange={setDoctors}
          />
          <Slider
            label="Citas por doctor al mes"
            value={apptPerDoctor}
            min={20}
            max={150}
            step={5}
            suffix=""
            onChange={setApptPerDoctor}
          />
          <Slider
            label="Tarifa promedio por cita"
            value={avgPrice}
            min={50}
            max={500}
            step={10}
            suffix=" S/"
            onChange={setAvgPrice}
          />
        </div>

        {/* Result */}
        <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-100 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <TrendingUp className="h-4 w-4" />
            Recuperación estimada
          </div>
          <div className="mt-3">
            <div className="text-4xl sm:text-5xl font-extrabold text-slate-900 tabular-nums">
              {formatSoles(displayMonthly)}
              <span className="text-xl font-semibold text-slate-500">
                /mes
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              ≈ {formatSoles(displayYearly)} al año
            </div>
          </div>
          <div className="mt-5 space-y-2 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>
                Reducción de no-shows del 20% al 5% con recordatorios
                automáticos.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>
                +8% de captación por booking público abierto 24/7.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-6 flex items-start gap-2 text-xs text-slate-500">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Cálculo conservador basado en ratios comunes del sector salud LATAM.
          Tu caso puede variar según especialidad, ubicación y uso del sistema.
        </p>
      </div>
    </div>
  );
}

export function RevenueImpact() {
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
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="revenue-impact"
      className="relative py-20 sm:py-28 bg-white overflow-hidden"
    >
      {/* Soft background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-50/50 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-amber-50/40 blur-[100px]" />
      </div>

      <div
        ref={sectionRef}
        className="relative mx-auto max-w-6xl px-6 [&.animate-in_.leak-card]:opacity-100 [&.animate-in_.leak-card]:translate-y-0"
      >
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" />
            Impacto en ingresos
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900">
            Tu clínica pierde dinero todos los meses.{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              Yenda te muestra dónde.
            </span>
          </h2>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed">
            No se trata de presionar a tus pacientes. Se trata de dejar de
            perder cobros por olvido, horas muertas por no-shows y pacientes
            que nadie llamó para volver.
          </p>
        </div>

        {/* Leak grid */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {leaks.map((leak, i) => (
            <div
              key={leak.title}
              className="leak-card rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md hover:border-slate-300 transition-all duration-500 opacity-0 translate-y-6"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${leak.iconBg} mb-4`}
              >
                <leak.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {leak.title}
              </h3>
              <p className="mt-1 text-xs text-slate-400 line-through decoration-rose-400/60">
                {leak.loss}
              </p>
              <p className={`mt-1 text-sm font-semibold ${leak.accent}`}>
                {leak.recovered}
              </p>
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                {leak.detail}
              </p>
            </div>
          ))}
        </div>

        {/* Calculator */}
        <div className="mt-14">
          <ROICalculator />
        </div>

        {/* Soft CTA */}
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500">
            ¿Quieres ver estos números en tu clínica real?{" "}
            <a
              href="#pricing"
              className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-4"
            >
              Elige tu plan y empieza →
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
