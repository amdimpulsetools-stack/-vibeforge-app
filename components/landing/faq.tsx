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
    question: "¿Emite boletas y facturas electrónicas a SUNAT?",
    answer:
      "Sí. Cobras la consulta y desde la misma pantalla sale el comprobante electrónico a SUNAT. No tienes que pasar el dato a otro sistema ni mandarle fotos al contador a fin de mes.",
  },
  {
    question: "Mi recepcionista no es muy de computadoras. ¿Va a poder?",
    answer:
      "Sí. Si maneja WhatsApp, maneja Yenda. Agendar una cita son tres pasos y no hay manual que leer. En los primeros días la acompañamos por videollamada las veces que haga falta.",
  },
  {
    question: "¿Otra clínica puede ver a mis pacientes?",
    answer:
      "No, nunca. Cada clínica trabaja en su propio espacio, separado por completo del resto — ni siquiera nuestro equipo entra a tu información clínica sin que tú lo autorices. Todo viaja y se guarda encriptado, con copias de seguridad automáticas todos los días. Si mañana se malogra tu computadora, tu historia clínica sigue intacta; con un cuaderno o un Excel en el escritorio, no.",
  },
  {
    question: "¿Qué pasa cuando terminan los 14 días de prueba?",
    answer:
      "Nada automático. No tenemos tu tarjeta, así que no podemos cobrarte. Te avisamos antes de que termine y tú decides si te quedas. Si no haces nada, la prueba simplemente se acaba.",
  },
  {
    question: "¿Puedo usar mi número de WhatsApp actual?",
    answer:
      "Los recordatorios salen por la API oficial de WhatsApp Business de Meta, con un número dedicado de tu clínica: los pacientes ven el nombre de tu clínica, no tu celular personal — y tu número personal por fin vuelve a ser tuyo. Sin riesgo de bloqueo por envíos masivos.",
  },
  {
    question: "¿Puedo migrar mis datos desde otro sistema?",
    answer:
      "Sí, y no lo haces tú. Nos mandas tu Excel, tu lista de pacientes o lo que tengas, y nuestro equipo lo deja cargado y ordenado antes de tu primer día. Sin costo adicional.",
  },
  {
    question: "¿Y si se cae el internet en la clínica?",
    answer:
      "Puedes seguir atendiendo y registrar después. Y como todo vive en la nube, si se malogra la computadora de recepción abres Yenda desde el celular y sigues trabajando.",
  },
  {
    question: "¿Funciona en mi celular?",
    answer:
      "Sí. La plataforma es completamente responsiva. Funciona en cualquier dispositivo con navegador, sin instalar nada.",
  },
  {
    question: "¿Qué pasa si necesito más de lo que incluye mi plan?",
    answer:
      "Agregas doctores, consultorios o miembros de equipo sueltos, sin tener que saltar al plan siguiente.",
  },
  {
    question: "¿La IA va a reemplazar a mis doctores?",
    answer:
      "No. El asistente solo lee datos administrativos y financieros: no hace diagnósticos ni entra a las historias clínicas de tus pacientes.",
  },
  {
    question: "¿Y si algún día quiero irme? ¿Mis datos quedan atrapados?",
    answer:
      "No. Tus datos son tuyos: exportas tus reportes a CSV cuando quieras y, si decides irte, nuestro equipo te entrega tu información completa. Sin penalidades ni letra chica.",
  },
];

export function FAQ() {
  // FAQPage schema: las 11 preguntas ya redactadas se vuelven elegibles
  // para rich snippets en Google sin costo adicional.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
  return (
    <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
    <section id="faq" className="py-16 sm:py-24 bg-white">
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
                <AccordionTrigger className="text-left text-base font-semibold text-slate-800 hover:text-emerald-600 hover:no-underline py-5">
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
    </>
  );
}
