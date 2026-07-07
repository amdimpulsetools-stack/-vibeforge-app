"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/landing/reveal";

const faqs = [
  {
    question: "¿Mis datos están seguros?",
    answer:
      "Sí. Cada clínica tiene su espacio completamente aislado. Los datos están encriptados y protegidos con seguridad a nivel de base de datos.",
  },
  {
    question: "¿Hay algún periodo de prueba?",
    answer:
      "Sí. Pruebas gratis 14 días, sin tarjeta y con todas las funciones de tu plan. Después pagas mes a mes, sin contrato: si no te convence, simplemente cancelas.",
  },
  {
    question: "¿Puedo migrar mis datos desde otro sistema?",
    answer:
      "Estamos trabajando en herramientas de importación. Por ahora, nuestro equipo te ayuda personalmente con la migración.",
  },
  {
    question: "¿Funciona en mi celular?",
    answer:
      "Sí. La plataforma es completamente responsiva. Funciona en cualquier dispositivo con navegador.",
  },
  {
    question: "¿Qué pasa si necesito más de lo que incluye mi plan?",
    answer:
      "Todos los planes tienen addons flexibles. Agrega doctores, consultorios o miembros de equipo adicionales sin cambiar de plan.",
  },
  {
    question: "¿La IA va a reemplazar a mis doctores?",
    answer:
      "No. Nuestro asistente IA es exclusivamente para gestión administrativa. No hace diagnósticos ni accede a información clínica.",
  },
  {
    question: "¿Y si algún día quiero irme? ¿Mis datos quedan atrapados?",
    answer:
      "No. Tus datos son tuyos: exportas tus reportes a CSV cuando quieras y, si decides irte, nuestro equipo te entrega tu información completa. Sin penalidades ni letra chica.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-2xl px-6">
        <Reveal>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 text-center mb-10">
            Preguntas frecuentes
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border-slate-200"
              >
                <AccordionTrigger className="text-left text-sm font-semibold text-slate-800 hover:text-emerald-600 hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-slate-600 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
