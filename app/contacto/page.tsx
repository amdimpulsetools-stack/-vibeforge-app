import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, ArrowRight, CalendarClock } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Escríbenos y te respondemos el mismo día hábil. Soporte en español, desde Perú.",
};

// Página mínima pero real: hasta la auditoría del 2026-08-21, el menú y el
// CTA de Enterprise ("Contactar ventas") apuntaban a /contacto… que no
// existía. Un 404 en el canal del cliente de mayor ticket.
export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 pt-32 pb-24">
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
          Hablemos de tu clínica
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed max-w-xl">
          Te respondemos el mismo día hábil, en español y sin bots de por
          medio. Cuéntanos cómo trabaja tu clínica hoy y te decimos con
          honestidad si Yenda te sirve.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href="mailto:soporte@yenda.app?subject=Consulta%20sobre%20Yenda"
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Mail className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-bold text-slate-900">Escríbenos</h2>
            <p className="mt-1 text-sm text-slate-600">
              soporte@yenda.app: ventas, soporte y consultas de planes
              Enterprise.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
              Enviar correo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CalendarClock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-bold text-slate-900">
              ¿Prefieres verlo funcionando?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Prueba Yenda 14 días con todas las funciones, sin tarjeta, y
              escríbenos con lo que encuentres.
            </p>
            <Link
              href="/register"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"
            >
              Empezar mis 14 días gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="m-0">
            ¿Ya eres cliente? Dentro de Yenda tienes un canal de soporte
            directo en <span className="font-semibold text-slate-900">Soporte</span>,
            en el menú lateral: por ahí llegan más rápido los temas de tu
            cuenta.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
