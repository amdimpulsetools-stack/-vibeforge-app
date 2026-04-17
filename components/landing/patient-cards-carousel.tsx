import {
  Clock,
  Heart,
  TrendingUp,
  Instagram,
  AlertTriangle,
  Pill,
  Activity,
  Star,
  UserCheck,
} from "lucide-react";

/**
 * Three patient cards in an infinite CSS marquee, with a white fade on the
 * edges so the side cards appear only partially visible.
 */
export function PatientCardsCarousel() {
  const cards = [
    <OverviewCard key="overview" />,
    <DemographicsCard key="demographics" />,
    <ClinicalHistoryCard key="clinical" />,
  ];
  // Duplicated 3x so the animation loops seamlessly.
  const loop = [...cards, ...cards, ...cards];

  return (
    <div className="relative mx-auto w-full overflow-hidden">
      {/* Fade edges to white */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 md:w-32"
        style={{
          background:
            "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 md:w-32"
        style={{
          background:
            "linear-gradient(to left, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)",
        }}
      />

      <div className="flex w-max gap-6 patient-carousel-track py-8">
        {loop.map((card, i) => (
          <div
            key={i}
            className="shrink-0 w-[22rem] md:w-[26rem]"
          >
            {card}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes patient-carousel-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-1 * (22rem + 1.5rem) * 3)); }
        }
        @media (min-width: 768px) {
          @keyframes patient-carousel-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(calc(-1 * (26rem + 1.5rem) * 3)); }
          }
        }
        .patient-carousel-track {
          animation: patient-carousel-scroll 24s linear infinite;
        }
        .patient-carousel-track:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .patient-carousel-track {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Card 1 — Overview (existing design)                                  */
/* ─────────────────────────────────────────────────────────────────── */
function OverviewCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="bg-teal-600 px-5 py-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
          ML
        </div>
        <div>
          <p className="text-white font-bold">María López Gutiérrez</p>
          <p className="text-teal-200 text-xs">
            DNI: 45678912 · 34 años · Lima, San Borja
          </p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-lg font-bold text-teal-600">24</p>
            <p className="text-[10px] text-slate-500">Citas totales</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-lg font-bold text-emerald-600">S/. 2,400</p>
            <p className="text-[10px] text-slate-500">Valor total</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-lg font-bold text-blue-600">3</p>
            <p className="text-[10px] text-slate-500">Tratamientos</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Ginecología", "SOP", "Control mensual", "Seguro EPS"].map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-medium text-teal-700"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          Última cita: 15 mar 2026 — Dra. Angela Quispe
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Card 2 — Demographics & Marketing                                    */
/* ─────────────────────────────────────────────────────────────────── */
function DemographicsCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
          ML
        </div>
        <div className="flex-1">
          <p className="text-white font-bold">María López Gutiérrez</p>
          <p className="text-violet-200 text-xs flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Perfil de marketing
          </p>
        </div>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
          <Star className="h-2.5 w-2.5 fill-current" /> VIP
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-violet-50 p-2.5">
            <p className="text-[9px] text-violet-600 font-semibold uppercase tracking-wide">
              Origen
            </p>
            <p className="text-sm font-bold text-slate-900 flex items-center gap-1 mt-0.5">
              <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram Ads
            </p>
          </div>
          <div className="rounded-lg bg-fuchsia-50 p-2.5">
            <p className="text-[9px] text-fuchsia-600 font-semibold uppercase tracking-wide">
              Canal preferido
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">WhatsApp</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <p className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wide">
              LTV
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">S/. 2,400</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-2.5">
            <p className="text-[9px] text-blue-600 font-semibold uppercase tracking-wide">
              Retención
            </p>
            <p className="text-sm font-bold text-slate-900 flex items-center gap-1 mt-0.5">
              <UserCheck className="h-3.5 w-3.5 text-emerald-500" /> Activa
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Ocupación</span>
            <span className="font-semibold text-slate-800">Diseñadora UX</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Primer contacto</span>
            <span className="font-semibold text-slate-800">12 ene 2024</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Referida por</span>
            <span className="font-semibold text-slate-800">María G.</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Promo navideña 2025", "Newsletter OK", "Cumpleaños jul"].map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-medium text-violet-700"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Card 3 — Clinical History                                            */
/* ─────────────────────────────────────────────────────────────────── */
function ClinicalHistoryCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
          ML
        </div>
        <div className="flex-1">
          <p className="text-white font-bold">María López Gutiérrez</p>
          <p className="text-blue-200 text-xs flex items-center gap-1">
            <Activity className="h-3 w-3" /> Historia clínica
          </p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {/* Alerts */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide">
              Alergias
            </span>
          </div>
          <p className="text-xs font-semibold text-red-900">Penicilina, AINES</p>
        </div>

        {/* Conditions */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">
            Condiciones crónicas
          </p>
          <p className="text-xs text-slate-800">
            <span className="font-semibold">SOP</span> (E28.2) · Hipotiroidismo (E03.9)
          </p>
        </div>

        {/* Medication */}
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Pill className="h-3.5 w-3.5 text-violet-600" />
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">
              Medicación activa
            </span>
          </div>
          <ul className="space-y-0.5">
            <li className="text-xs text-slate-800">
              <span className="font-semibold">Metformina</span> 850mg · 1x día
            </li>
            <li className="text-xs text-slate-800">
              <span className="font-semibold">Levotiroxina</span> 50mcg · ayunas
            </li>
          </ul>
        </div>

        {/* Recent diagnoses */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Últimos CIE-10:</span>
          <div className="flex gap-1">
            {["E28.2", "N91.3", "K59.0"].map((code) => (
              <span
                key={code}
                className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-blue-700"
              >
                {code}
              </span>
            ))}
          </div>
        </div>

        {/* Treatment progress */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
              Tratamiento activo
            </span>
            <span className="text-[10px] font-bold text-emerald-700">4 / 12</span>
          </div>
          <p className="text-xs font-semibold text-slate-800 mb-1.5">
            Control de fertilidad
          </p>
          <div className="h-1.5 w-full rounded-full bg-emerald-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: "33%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
