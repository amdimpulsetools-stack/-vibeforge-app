"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock,
  CalendarX2,
  TrendingUp,
  Users,
  Zap,
  BarChart3,
} from "lucide-react";

interface Metric {
  icon: React.ElementType;
  value: number;
  suffix: string;
  label: string;
  description: string;
  color: string;
  iconBg: string;
}

const metrics: Metric[] = [
  {
    icon: Clock,
    value: 60,
    suffix: "%",
    label: "Menos tiempo agendando",
    description:
      "Recepcionistas agendan en 3 clicks en lugar de alternar entre WhatsApp, cuadernos y Excel.",
    color: "text-blue-600",
    iconBg: "bg-blue-100 text-blue-600",
  },
  {
    icon: CalendarX2,
    value: 0,
    suffix: "",
    label: "Doble-agendamientos",
    description:
      "La agenda inteligente valida disponibilidad de doctor + consultorio. Cero conflictos.",
    color: "text-emerald-600",
    iconBg: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: TrendingUp,
    value: 35,
    suffix: "%",
    label: "Más visibilidad financiera",
    description:
      "Administradores ven revenue, deudas y cobros en tiempo real sin hacer cuentas manuales.",
    color: "text-amber-600",
    iconBg: "bg-amber-100 text-amber-600",
  },
  {
    icon: Users,
    value: 74,
    suffix: "%",
    label: "Retención de pacientes",
    description:
      "Follow-ups automáticos y tracking de origen permiten reactivar pacientes antes de perderlos.",
    color: "text-purple-600",
    iconBg: "bg-purple-100 text-purple-600",
  },
  {
    icon: Zap,
    value: 5,
    suffix: "min",
    label: "Setup inicial",
    description:
      "Configura tu clínica, doctores, servicios y consultorios en minutos. Sin capacitación técnica.",
    color: "text-rose-600",
    iconBg: "bg-rose-100 text-rose-600",
  },
  {
    icon: BarChart3,
    value: 4,
    suffix: "roles",
    label: "Cada uno ve lo suyo",
    description:
      "Owner, Admin, Recepcionista y Doctor. Permisos claros, sin confusión, sin errores.",
    color: "text-teal-600",
    iconBg: "bg-teal-100 text-teal-600",
  },
];

function useCountUp(target: number, isVisible: boolean, duration = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    // For 0, just set immediately
    if (target === 0) {
      setCount(0);
      return;
    }

    let start = 0;
    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentCount = Math.round(eased * target);

      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [target, isVisible, duration]);

  return count;
}

function MetricCard({
  metric,
  index,
  isVisible,
}: {
  metric: Metric;
  index: number;
  isVisible: boolean;
}) {
  const count = useCountUp(metric.value, isVisible);

  return (
    <div
      className="metric-card rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-500 opacity-0 translate-y-6 group"
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      {/* Icon + Value */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${metric.iconBg} group-hover:scale-110 transition-transform`}
        >
          <metric.icon className="h-5 w-5" />
        </div>
        <div className="text-right">
          <span className={`text-3xl sm:text-4xl font-extrabold ${metric.color}`}>
            {count}
          </span>
          <span className={`text-lg font-bold ${metric.color}`}>
            {metric.suffix}
          </span>
        </div>
      </div>

      {/* Label */}
      <h3 className="text-base font-bold text-slate-900 mb-1">
        {metric.label}
      </h3>

      {/* Description */}
      <p className="text-sm text-slate-500 leading-relaxed">
        {metric.description}
      </p>
    </div>
  );
}

export function ExpectedResults() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-in");
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 sm:py-28 bg-slate-50/50">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 [&.animate-in_.metric-card]:opacity-100 [&.animate-in_.metric-card]:translate-y-0"
      >
        {/* Header */}
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Resultados que puedes esperar
          </h2>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl mx-auto">
            Métricas reales basadas en los problemas más comunes de clínicas que administran todo manualmente.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {metrics.map((metric, i) => (
            <MetricCard
              key={metric.label}
              metric={metric}
              index={i}
              isVisible={isVisible}
            />
          ))}
        </div>

        {/* Bottom disclaimer */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs text-slate-500">
              Métricas proyectadas basadas en el diseño del producto.
              Resultados reales pueden variar según el uso y la clínica.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
