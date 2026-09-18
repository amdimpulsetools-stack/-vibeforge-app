import Link from "next/link";
import { FAQ } from "./content";
import { Container, Eyebrow, SectionTitle } from "./primitives";

/**
 * FAQ con <details> nativos (sin JS): las mismas once preguntas de la home.
 * Sin JSON-LD aquí: `/2` es noindex y la home ya publica el FAQPage.
 */
export function FaqV2() {
  return (
    <section id="preguntas" className="scroll-mt-20 bg-white">
      <Container className="grid gap-10 py-20 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-28">
        <div>
          <Eyebrow>{FAQ.eyebrow}</Eyebrow>
          <SectionTitle className="mt-4">{FAQ.title}</SectionTitle>
          <p className="mt-4 text-[15px] leading-[1.85] text-slate-600">
            {FAQ.intro}
            <Link href={FAQ.introHref} className="border-b border-emerald-300 text-emerald-700 hover:text-emerald-900">
              {FAQ.introLink}
            </Link>
            {FAQ.introTail}
          </p>
        </div>
        <div>
          {FAQ.items.map((item) => (
            <details key={item.question} className="group border-b border-slate-200 first:[&>summary]:pt-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-[15px] font-medium leading-snug text-slate-900 marker:hidden [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden className="shrink-0 text-xl font-light text-emerald-600 transition-transform duration-[var(--dur-base)] group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-6 pr-6 text-[14px] leading-[1.8] text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
