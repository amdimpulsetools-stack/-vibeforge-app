"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "¿Mis datos están seguros?",
    answer:
      "Sí. Cada clínica tiene su espacio completamente aislado. Los datos están encriptados y protegidos con seguridad a nivel de base de datos.",
  },
  {
    question: "¿Hay algún periodo de prueba?",
    answer:
      "No tenemos trial porque no lo necesitas. Pagas mes a mes, sin contrato. Si en el primer mes no te convence, simplemente cancelas.",
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
];

export function FAQ() {
  return (
    <section id="faq" className="py-20 sm:py-28 bg-white">
      <div className="mx-auto max-w-2xl px-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 text-center mb-10">
          Preguntas frecuentes
        </h2>

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
      </div>
    </section>
  );
}
