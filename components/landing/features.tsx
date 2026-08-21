"use client";

import { useEffect, useRef } from "react";
import { Calendar, Users, Shield, Building, Wallet, ReceiptText } from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Agenda Inteligente",
    before:
      "La cita entra por WhatsApp, se anota en el cuaderno, se olvida pasar al Excel — y a las 9 am hay dos pacientes para el mismo consultorio",
    after:
      "Una sola agenda que sabe qué doctor está libre y cuánto dura cada servicio. No deja agendar dos pacientes a la misma hora, y a cada uno le manda su recordatorio por WhatsApp sin que nadie escriba nada.",
  },
  {
    icon: Users,
    title: "Gestión de Pacientes",
    before:
      "El paciente entra y tienes que acordarte de qué le hiciste hace ocho meses y si te quedó debiendo",
    after:
      "Abres su ficha antes de que se siente: qué le hiciste, cuánto pagó, cuánto debe, qué le recetaste y cuándo debería volver. Todo en una pantalla, en dos segundos.",
  },
  {
    icon: Wallet,
    title: "Caja diaria que cuadra sola",
    before:
      "Cobras en efectivo, se anota en un cuaderno, y al final del mes nadie sabe si falta plata",
    after:
      "Apertura, cierre y arqueo conectados a cada cita cobrada. Al final del día sabes cuánto entró — y si falta algo, sabes exactamente dónde.",
  },
  {
    icon: ReceiptText,
    title: "Boletas y facturas SUNAT",
    before:
      "Cobras aquí, y las boletas se emiten en otro sistema — o el contador te persigue a fin de mes",
    after:
      "Emisión electrónica a SUNAT desde la misma cita, en un clic. Sin pasar los datos a otro sistema.",
  },
  {
    icon: Shield,
    title: "Control de Equipo",
    before:
      "Tu recepcionista ve cuánto factura la clínica y un doctor abre historias de pacientes que no son suyos",
    after:
      "Tú decides quién ve qué. La recepcionista agenda y cobra pero no ve tus números totales. Cada doctor entra solo a sus pacientes. Todo movimiento queda registrado con nombre y hora.",
  },
  {
    icon: Building,
    title: "Tu Clínica Completa",
    before:
      "El Excel de citas, el cuaderno de caja, el WhatsApp de recordatorios y el talonario de boletas: ninguno se habla con el otro",
    after:
      "Registras la cita una vez y ya está todo: el doctor la ve en su agenda, el cobro entra a caja, la boleta sale a SUNAT y el recordatorio se va por WhatsApp solo.",
  },
];

export function Features() {
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
    <section id="features" className="py-20 sm:py-28 bg-white">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 [&.animate-in_.feat-card]:opacity-100 [&.animate-in_.feat-card]:translate-y-0"
      >
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Todo lo que necesitas. Nada que no.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {features.map((feat, i) => (
            <div
              key={feat.title}
              className="feat-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-500 opacity-0 translate-y-6 group"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                  <feat.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{feat.title}</h3>
              </div>

              {/* Before */}
              <div className="mb-3 rounded-lg bg-red-50/50 border border-red-100 p-3">
                <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Antes</span>
                <p className="text-sm text-red-400/80 mt-1 line-through decoration-red-300/50">
                  {feat.before}
                </p>
              </div>

              {/* After */}
              <div className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-3">
                <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Ahora</span>
                <p className="text-sm text-slate-700 mt-1">{feat.after}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
