import { BadgeDollarSign, CloudUpload, Headphones, Lock, Quote } from "lucide-react";
import { PROOF } from "./content";
import { Arrow, Container, Eyebrow, SectionTitle, StatusDot, textLink } from "./primitives";

/**
 * Prueba: solo afirmaciones verificables (auditoría 2026-08-21). La cita
 * es del equipo de Yenda, no de una clínica; el testimonio con nombre y
 * foto vuelve cuando exista uno real y autorizado.
 */
const SIGNAL_ICONS = [Lock, CloudUpload, Headphones, BadgeDollarSign];

export function ProofV2() {
  return (
    <section id="clientes" className="scroll-mt-20 bg-white">
      <Container className="grid gap-10 border-b border-slate-200 py-20 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-28">
        <div>
          <Eyebrow>{PROOF.eyebrow}</Eyebrow>
          <div className="mt-5 flex items-center gap-4">
            <span aria-hidden className="flex h-8 w-11 overflow-hidden rounded shadow-[0_6px_12px_rgba(83,48,48,0.08)] motion-safe:-rotate-[7deg]">
              <i className="w-1/3 bg-[#d97065]" />
              <i className="w-1/3 bg-white" />
              <i className="w-1/3 bg-[#d97065]" />
            </span>
            <span className="text-[13px] font-medium text-slate-700">{PROOF.badge}</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{PROOF.pilots}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800">
            <StatusDot /> {PROOF.pilotActive}
          </p>

          <div className="mt-8 rounded-lg border border-emerald-100 bg-emerald-50/70 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">{PROOF.early.eyebrow}</p>
            <p className="mt-2 font-display text-lg font-semibold tracking-tight text-slate-900">{PROOF.early.title}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{PROOF.early.body}</p>
            <a href="#precios" className={`${textLink} mt-4 text-[13px]`}>
              {PROOF.early.link} <Arrow />
            </a>
          </div>
        </div>

        <div>
          <SectionTitle className="lg:text-[2.25rem]">{PROOF.title}</SectionTitle>
          <p className="mt-5 max-w-lg text-[15px] leading-[1.9] text-slate-600">{PROOF.intro}</p>
          <figure className="relative mt-7 rounded-lg border border-slate-200 bg-slate-50/70 p-6">
            <Quote aria-hidden className="absolute right-5 top-5 h-6 w-6 text-emerald-200" />
            <blockquote className="max-w-xl text-[14.5px] leading-[1.85] text-slate-700">“{PROOF.quote}”</blockquote>
            <figcaption className="mt-4 text-[12px] text-slate-500">— {PROOF.quoteBy}</figcaption>
          </figure>
          <ul className="mt-6 flex flex-wrap gap-2.5">
            {PROOF.signals.map((s, i) => {
              const Icon = SIGNAL_ICONS[i];
              return (
                <li key={s} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700">
                  <Icon className="h-3.5 w-3.5 text-emerald-700" strokeWidth={2} /> {s}
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}
