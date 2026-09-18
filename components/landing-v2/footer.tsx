import Link from "next/link";
import { YendaLogo } from "@/components/icons/yenda-logo";
import { APP_NAME } from "@/lib/constants";
import { FOOTER } from "./content";
import { Arrow, Container } from "./primitives";

export function FooterV2() {
  return (
    <footer className="bg-white">
      <Container>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-slate-200 pb-7">
          <YendaLogo width={92} className="opacity-90" />
          <span className="text-[12.5px] text-slate-500">{FOOTER.tagline}</span>
          <nav aria-label="Enlaces" className="flex flex-wrap gap-x-5 gap-y-2 md:ml-auto">
            {FOOTER.links.map((l) => (
              <Link key={l.href} href={l.href} className="text-[12.5px] font-medium text-slate-700 hover:text-emerald-700">
                {l.label}
                {l.label === "Contacto" && <Arrow className="ml-1.5 text-base" />}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 py-6 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {FOOTER.year} {APP_NAME}. Todos los derechos reservados.
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {FOOTER.legal.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-emerald-700">
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="hover:text-emerald-700">
              Ingresar
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
