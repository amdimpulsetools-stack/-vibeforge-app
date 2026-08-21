"use client";

import Link from "next/link";
import { ArrowRight, X, Check } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

// La comparativa correcta para este mercado NO es contra otro software:
// el 80% del comprador peruano elige entre Yenda y su cuaderno. Nombrar
// competidores en la home les hace publicidad y le enseña alternativas
// que no había considerado (auditoría 2026-08-21). Contra Doctoralia /
// Dentalink: páginas SEO dedicadas, nunca enlazadas desde aquí.
const rows: { label: string; today: string; yenda: string }[] = [
  {
    label: "Recordar al paciente",
    today: "Alguien tiene que escribirle a mano — o nadie lo hace",
    yenda: "WhatsApp automático 24h y 2h antes",
  },
  {
    label: "El paciente quiere reservar a las 10 pm",
    today: "Espera a mañana, o se va a otra clínica",
    yenda: "Reserva solo y cae en tu agenda",
  },
  {
    label: "Historia clínica",
    today: "Papel, o fotos en el celular",
    yenda: "Digital, con autoguardado, buscable",
  },
  {
    label: "Saber cuánto facturaste",
    today: "Sumar a mano el domingo",
    yenda: "En pantalla, en vivo",
  },
  {
    label: "Boletas y facturas",
    today: "Sistema aparte, o el contador",
    yenda: "Electrónicas a SUNAT desde la misma cita",
  },
  {
    label: "Si tu recepcionista se va",
    today: "Se va con la información",
    yenda: "La información se queda contigo",
  },
  {
    label: "Tus S/2,000 en Instagram",
    today: "No sabes qué trajeron",
    yenda: "Cuántas citas y cuántos soles, por campaña",
  },
  {
    label: "Costo",
    today: "“Gratis” — más las fugas de cada mes",
    yenda: "Desde S/129/mes",
  },
];

export function StatusQuoTable() {
  return (
    <section className="py-20 sm:py-28 bg-slate-50">
      <div className="mx-auto max-w-5xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Lo que hoy te parece gratis, es lo más caro que pagas.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            El papel, el Excel y el WhatsApp personal no cuestan mensualidad —
            cuestan citas perdidas, cobros olvidados y domingos sumando a mano.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-4 py-3.5 sm:px-5 font-semibold text-slate-500 text-xs uppercase tracking-wider" />
                  <th className="px-4 py-3.5 sm:px-5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                    Hoy: papel, Excel y WhatsApp
                  </th>
                  <th className="px-4 py-3.5 sm:px-5 font-bold text-emerald-700 text-xs uppercase tracking-wider bg-emerald-50/60 rounded-t-lg">
                    Con Yenda
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3.5 sm:px-5 font-semibold text-slate-900 align-top">
                      {r.label}
                    </td>
                    <td className="px-4 py-3.5 sm:px-5 text-slate-500 align-top">
                      <span className="inline-flex items-start gap-1.5">
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                        {r.today}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 sm:px-5 text-slate-700 align-top bg-emerald-50/60">
                      <span className="inline-flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        {r.yenda}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal delay={200} className="mt-8 text-center">
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl gradient-primary px-8 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
          >
            Empezar mis 14 días gratis
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-xs text-slate-500">
            Sin tarjeta. Cancelas cuando quieras.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
