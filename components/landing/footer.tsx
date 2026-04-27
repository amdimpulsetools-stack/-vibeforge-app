import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { YendaLogo } from "@/components/icons/yenda-logo";

const links = [
  { label: "Características", href: "#features" },
  { label: "Planes", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const legalLinks = [
  { label: "Términos", href: "/terms" },
  { label: "Privacidad", href: "/privacy" },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <YendaLogo width={88} className="opacity-90" />

          {/* Nav links */}
          <nav className="flex items-center gap-6">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-slate-500 hover:text-emerald-600 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="text-sm text-slate-500 hover:text-emerald-600 transition-colors"
            >
              Contacto
            </Link>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            Hecho en Perú 🇵🇪 para Latinoamérica
          </p>
          <div className="flex items-center gap-4">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            © 2026 {APP_NAME}. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
