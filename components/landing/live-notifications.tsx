"use client";

import { useEffect, useRef } from "react";
import DisplayCards from "@/components/ui/display-cards";
import type { DisplayCardProps } from "@/components/ui/display-cards";
import {
  CalendarPlus,
  CalendarClock,
  CreditCard,
  UserCheck,
  Bell,
  Stethoscope,
} from "lucide-react";

const notificationCards: DisplayCardProps[] = [
  {
    icon: <CalendarPlus className="size-4 text-emerald-500" />,
    title: "Nueva cita registrada",
    description: "María García — Control general 9:00 AM",
    date: "Hace 2 min",
    titleClassName: "text-emerald-600",
    className:
      "[grid-area:stack] hover:-translate-y-10 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-slate-200 before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-white/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
  },
  {
    icon: <CalendarClock className="size-4 text-amber-500" />,
    title: "Paciente reprogramada",
    description: "Carlos López — Ecografía → Jueves 10:30",
    date: "Hace 15 min",
    titleClassName: "text-amber-600",
    // translate-x reducido en mobile (8 vs 16) para que el stack no se
    // dispare fuera del viewport. Desde sm vuelve al offset original.
    className:
      "[grid-area:stack] translate-x-8 sm:translate-x-16 translate-y-10 hover:-translate-y-1 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-slate-200 before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-white/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
  },
  {
    icon: <CreditCard className="size-4 text-blue-500" />,
    title: "Pago registrado",
    description: "Ana Rodríguez — S/. 150.00 completado",
    date: "Hace 30 min",
    titleClassName: "text-blue-600",
    className:
      "[grid-area:stack] translate-x-16 sm:translate-x-32 translate-y-20 hover:translate-y-10",
  },
];

export function LiveNotifications() {
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

  return (
    // overflow-hidden defensivo: aunque las cards adentro ya estan
    // dimensionadas para no desbordar, este wrapper garantiza que cualquier
    // nuevo decorador con translate/skew no rompa el ancho del body en
    // mobile (bug reportado: aparecia franja blanca a la derecha).
    <section className="py-20 sm:py-28 bg-slate-50/50 overflow-hidden">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 opacity-0 translate-y-8 transition-all duration-700 ease-out [&.animate-in]:opacity-100 [&.animate-in]:translate-y-0"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left — Text */}
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-5">
              <Bell className="h-3 w-3" />
              Notificaciones en tiempo real
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
              Todo lo que pasa en tu clínica.{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                Al instante.
              </span>
            </h2>
            <p className="text-slate-600 text-lg leading-relaxed mb-8">
              Nuevas citas, reprogramaciones, pagos completados, pacientes que
              llegan. Recibe notificaciones en tiempo real para que nunca pierdas
              el control de tu día.
            </p>

            <div className="space-y-4">
              {[
                {
                  icon: CalendarPlus,
                  label: "Citas nuevas y confirmaciones",
                  color: "bg-emerald-100 text-emerald-600",
                },
                {
                  icon: CalendarClock,
                  label: "Reprogramaciones automáticas",
                  color: "bg-amber-100 text-amber-600",
                },
                {
                  icon: UserCheck,
                  label: "Pacientes que llegan a recepción",
                  color: "bg-blue-100 text-blue-600",
                },
                {
                  icon: Stethoscope,
                  label: "Notas clínicas completadas",
                  color: "bg-purple-100 text-purple-600",
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.color}`}
                  >
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Display Cards. overflow-hidden + min-w-0 para que
               el grid item permita comprimirse y no fuerce ancho minimo
               de las cards skew/translate al body en mobile. */}
          <div className="order-1 lg:order-2 flex items-center justify-center min-h-[350px] min-w-0 overflow-hidden">
            <DisplayCards cards={notificationCards} />
          </div>
        </div>
      </div>
    </section>
  );
}
