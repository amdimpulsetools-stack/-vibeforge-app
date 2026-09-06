"use client";

import Link from "next/link";
import { ArrowRight, Radar, Send, Target } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { LANDING_CTAS } from "@/components/landing/landing-copy";
import { useLandingProfile } from "@/components/landing/use-landing-profile";
import { trackLanding } from "@/lib/landing-analytics";

/**
 * El diferenciador (brief ítem 3): lo que ningún otro sistema de citas del
 * mercado peruano hace. Va justo después de la calculadora — el visitante
 * acaba de ver cuánta plata se le escapa y aquí encuentra el mecanismo que
 * la recupera.
 *
 * REGLA DE ESTA SECCIÓN: cada frase describe algo que ya existe en producto.
 * Nada de "la contacta automáticamente" (el envío automático está pausado:
 * hay una persona apretando el botón, y el App Review de Meta sigue
 * pendiente) y nada de plata recuperada (todavía no hay pantalla que muestre
 * facturación atribuida al seguimiento). Los tres pasos y los disparadores
 * son los reales del motor de seguimientos.
 */

const STEPS = [
  {
    Icon: Radar,
    kicker: "1",
    title: "Detecta",
    body: "Control pendiente sin cita, presupuesto aceptado sin iniciar, sesión de tratamiento perdida, cita completada sin siguiente control: cada caso abre un seguimiento solo.",
  },
  {
    Icon: Send,
    kicker: "2",
    title: "Contacta",
    body: "Cascada de hasta 3 intentos por WhatsApp o correo, con plantillas editables y el mensaje listo para enviar en un clic. Tu equipo decide; nada sale sin una persona detrás.",
  },
  {
    Icon: Target,
    kicker: "3",
    title: "Mide",
    body: "Cada cita que nace de un seguimiento queda marcada como recuperada. Sin atribución inflada: solo cuenta la que agendó después del contacto.",
  },
];

const TRIGGERS = [
  "Cita completada sin control",
  "No asistió",
  "Presupuesto aceptado sin iniciar",
  "Sesión de plan perdida",
  "Presupuesto sin respuesta (fertilidad)",
];

export function FollowupEngine() {
  const profile = useLandingProfile();
  const demo = LANDING_CTAS.demo;

  return (
    <section
      id="motor-seguimientos"
      className="relative border-y border-slate-100 bg-slate-50 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Motor de seguimientos y recuperación de citas
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
            Lo que ningún otro sistema de citas hace: detectar a la paciente
            que no volvió y darle a tu equipo el siguiente paso.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal
              key={step.title}
              delay={i * 90}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <step.Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Paso {step.kicker}
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">
                    {step.title}
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {step.body}
              </p>
            </Reveal>
          ))}
        </div>

        {/* Disparadores reales del motor. Nombrarlos uno por uno es la prueba
            de que esto existe: un competidor no puede escribir esta lista. */}
        <Reveal delay={120} className="mt-10">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
            Lo que abre un seguimiento hoy
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {TRIGGERS.map((t) => (
              <span
                key={t}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </Reveal>

        {/* Mini-mockup decorativo: mismo lenguaje visual que el del hero
            (tarjeta blanca, borde slate, tipografías chicas). Paciente
            ficticia a propósito — ninguna captura real sale de la landing. */}
        <Reveal delay={180} className="mt-12 flex justify-center">
          <div
            aria-hidden
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Seguimiento abierto
              </p>
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Intento 2 de 3
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-800">M. Torres</p>
              <p className="text-[11px] text-slate-500">
                Control post-tratamiento · sin cita desde hace 4 meses
              </p>
            </div>

            <div className="mt-3 flex gap-2">
              <span className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-center text-[11px] font-semibold text-white">
                WhatsApp
              </span>
              <span className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-center text-[11px] font-semibold text-slate-600">
                Cerrar caso
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <p className="text-[11px] font-medium text-slate-600">
                Cita recuperada · 12 sep
              </p>
            </div>
          </div>
        </Reveal>

        {/* TODO: "N pacientes recuperadas en su primer mes · Clínica" cuando exista la tarjeta en Reportes */}

        <Reveal delay={240} className="mt-12 text-center">
          <Link
            href={demo.href}
            onClick={() =>
              trackLanding(demo.event, {
                perfil: profile,
                ubicacion: "followup-engine",
              })
            }
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl gradient-primary px-8 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            Ver cómo funciona en una demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
