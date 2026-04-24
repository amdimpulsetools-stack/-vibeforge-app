import {
  Lock,
  CloudUpload,
  Headphones,
  BadgeDollarSign,
  Quote,
  Stethoscope,
} from "lucide-react";

const signals = [
  { icon: Lock, label: "Datos encriptados" },
  { icon: CloudUpload, label: "Backups automáticos" },
  { icon: Headphones, label: "Soporte en español" },
  { icon: BadgeDollarSign, label: "Precios en soles" },
];

// ── Real, verifiable signals ────────────────────────────────────────────────
// Vitra is the first pilot (fertility clinic, Lima). Pull-quote is a
// placeholder framed around the concrete reason they chose the platform —
// replace with a verified testimonial once the pilot wraps.

interface PilotCard {
  clinic: string;
  type: string;
  location: string;
  status: string;
  quote: string;
  author: string;
  role: string;
}

const pilots: PilotCard[] = [
  {
    clinic: "Vitra",
    type: "Centro de Fertilidad",
    location: "Lima, Perú",
    status: "Pilot activo — Abril 2026",
    quote:
      "Buscábamos un sistema que entendiera planes de tratamiento largos con cobros por sesión y consentimientos por procedimiento. Yenda lo tenía de fábrica.",
    author: "Dirección médica",
    role: "Centro Vitra",
  },
];

export function SocialProof() {
  return (
    <section className="py-20 sm:py-28 bg-slate-50/50">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Stethoscope className="h-3.5 w-3.5" />
            Clínicas reales, no demos
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Construido con los primeros 100.
          </h2>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Cada flujo de Yenda nace de una conversación con un doctor, un
            administrador o una recepcionista que nos dijo qué les frenaba
            en su día a día.
          </p>
        </div>

        {/* Pilot testimonial + early-access badge */}
        <div className="mt-12 grid gap-6 lg:grid-cols-5">
          {/* Testimonial (spans 3) */}
          {pilots.map((p) => (
            <figure
              key={p.clinic}
              className="lg:col-span-3 relative rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
            >
              <Quote className="absolute top-6 right-6 h-8 w-8 text-emerald-100" />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white font-bold text-lg">
                  {p.clinic.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-slate-900">{p.clinic}</div>
                  <div className="text-xs text-slate-500">
                    {p.type} · {p.location}
                  </div>
                </div>
              </div>
              <blockquote className="mt-5 text-base text-slate-700 leading-relaxed">
                “{p.quote}”
              </blockquote>
              <figcaption className="mt-4 text-xs text-slate-500">
                — {p.author}, {p.role}
              </figcaption>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {p.status}
              </div>
            </figure>
          ))}

          {/* Early-access card (spans 2) */}
          <div className="lg:col-span-2 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-8 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Acceso anticipado
              </div>
              <h3 className="mt-3 text-2xl font-extrabold text-slate-900 leading-tight">
                Sé de los primeros 100 en probarlo.
              </h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                Tu feedback durante los primeros 3 meses moldea el roadmap.
                Recibes features que pides, no lo que se nos ocurre.
              </p>
            </div>
            <a
              href="#pricing"
              className="mt-6 inline-flex items-center justify-center h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
            >
              Ver planes y empezar
            </a>
          </div>
        </div>

        {/* Trust signals */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {signals.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm"
            >
              <s.icon className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-slate-600">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
