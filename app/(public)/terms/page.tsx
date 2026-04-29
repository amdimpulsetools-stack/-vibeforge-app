import Link from "next/link";
import { ArrowLeft, Mail, ScrollText, ShieldAlert } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { LegalSection } from "@/components/legal/legal-section";
import { LegalCallout } from "@/components/legal/legal-callout";
import { LegalList, LegalListItem } from "@/components/legal/legal-list";
import { LegalToc, type LegalTocItem } from "@/components/legal/legal-toc";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: `Términos y condiciones de uso de ${APP_NAME}. Lee las condiciones que rigen el uso de nuestra plataforma.`,
};

const TOC: LegalTocItem[] = [
  { id: "aceptacion", label: "Aceptación de términos" },
  { id: "servicio", label: "Descripción del servicio" },
  { id: "cuentas", label: "Cuentas y acceso" },
  { id: "planes", label: "Planes, pagos y SLA" },
  { id: "uso-aceptable", label: "Uso aceptable" },
  { id: "propiedad", label: "Propiedad intelectual" },
  { id: "responsabilidad", label: "Limitación de responsabilidad" },
  { id: "medicos", label: "Datos médicos — descargo" },
  { id: "exportacion", label: "Exportación y eliminación al cancelar" },
  { id: "fuerza-mayor", label: "Fuerza mayor" },
  { id: "cesion", label: "Cesión" },
  { id: "modificaciones", label: "Modificaciones a los términos" },
  { id: "ley", label: "Ley aplicable y jurisdicción" },
  { id: "contacto", label: "Contacto" },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio
      </Link>

      {/* Hero */}
      <header className="mb-10 max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <ScrollText className="h-3.5 w-3.5" aria-hidden />
          Documento legal · Última actualización: 29 de abril de 2026
        </div>
        <h1 className="bg-gradient-to-br from-foreground via-foreground to-emerald-200/90 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          Términos y Condiciones de Uso
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Bienvenido a <strong className="text-foreground">{APP_NAME}</strong>. Al
          acceder y utilizar nuestra plataforma, aceptas estos términos en su
          totalidad. Si no estás de acuerdo con alguna parte, no debes utilizar el
          servicio.
        </p>
      </header>

      {/* Mobile TOC trigger */}
      <div className="mb-6 lg:hidden">
        <LegalToc items={TOC} />
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-12">
        <LegalToc items={TOC} />

        <article>
          <LegalSection
            id="aceptacion"
            number="01"
            title="Aceptación de términos"
          >
            <p>
              Al crear una cuenta, acceder o utilizar {APP_NAME}, declaras que has
              leído, entendido y aceptado estos Términos y Condiciones, así como
              nuestra{" "}
              <Link
                href="/privacy"
                className="font-medium text-emerald-400 hover:text-emerald-300"
              >
                Política de Privacidad
              </Link>
              . Si utilizas la plataforma en nombre de una organización (clínica,
              consultorio o centro médico), declaras que tienes la autoridad para
              vincular a dicha organización a estos términos.
            </p>
          </LegalSection>

          <LegalSection
            id="servicio"
            number="02"
            title="Descripción del servicio"
            description={`${APP_NAME} es una plataforma de gestión integral para clínicas y consultorios médicos.`}
          >
            <LegalList>
              <LegalListItem>Agenda inteligente y gestión de citas.</LegalListItem>
              <LegalListItem>
                Registro y gestión de pacientes e historiales clínicos.
              </LegalListItem>
              <LegalListItem>
                Gestión de equipo médico y administrativo.
              </LegalListItem>
              <LegalListItem>
                Reportes y analíticas de la práctica médica.
              </LegalListItem>
              <LegalListItem>
                Asistente con inteligencia artificial para apoyo clínico.
              </LegalListItem>
              <LegalListItem>
                Recordatorios automáticos por WhatsApp y correo electrónico (con
                autorización del profesional).
              </LegalListItem>
              <LegalListItem>
                Integración con Mercado Pago para cobros y suscripciones.
              </LegalListItem>
              <LegalListItem>
                Emisión de comprobantes electrónicos SUNAT a través de Nubefact.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection id="cuentas" number="03" title="Cuentas y acceso">
            <LegalList>
              <LegalListItem>
                Debes proporcionar información veraz y actualizada al registrarte.
              </LegalListItem>
              <LegalListItem>
                Eres responsable de mantener la confidencialidad de tus
                credenciales de acceso (correo y contraseña).
              </LegalListItem>
              <LegalListItem>
                Debes notificarnos inmediatamente si sospechas de un acceso no
                autorizado a tu cuenta.
              </LegalListItem>
              <LegalListItem>
                El propietario de la organización puede invitar miembros con
                diferentes roles (administrador, doctor, recepcionista), cada uno
                con permisos específicos.
              </LegalListItem>
              <LegalListItem>
                Nos reservamos el derecho de suspender o cancelar cuentas que
                violen estos términos.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection id="planes" number="04" title="Planes, pagos y SLA">
            <LegalList>
              <LegalListItem>
                {APP_NAME} ofrece diferentes planes de suscripción con distintas
                funcionalidades y límites. Los detalles y precios de cada plan
                están disponibles en la plataforma.
              </LegalListItem>
              <LegalListItem>
                <strong>Período de prueba:</strong> 14 días gratuitos para nuevos
                usuarios. Al finalizar, se requerirá la suscripción a un plan de
                pago para continuar usando el servicio.
              </LegalListItem>
              <LegalListItem>
                <strong>Procesador de pagos:</strong> todos los pagos se procesan
                a través de Mercado Pago. Al realizar un pago, aceptas también
                los términos y condiciones de Mercado Pago.
              </LegalListItem>
              <LegalListItem>
                <strong>Facturación:</strong> las suscripciones se cobran de forma
                mensual, semestral o anual según el plan elegido. Los cargos se
                realizan automáticamente al inicio de cada período.
              </LegalListItem>
              <LegalListItem>
                <strong>Cancelación:</strong> puedes cancelar tu suscripción en
                cualquier momento desde la configuración de tu cuenta. La
                cancelación es efectiva al final del período de facturación
                vigente.
              </LegalListItem>
              <LegalListItem>
                <strong>Reembolsos:</strong> solo procedemos reembolsos en caso
                de cargo erróneo o falla mayor del servicio imputable a {APP_NAME}.
                No se realizan reembolsos por desuso o cancelación voluntaria.
              </LegalListItem>
              <LegalListItem>
                <strong>Cambios de precio:</strong> nos reservamos el derecho de
                modificar precios con un aviso previo mínimo de 30 días por
                correo electrónico.
              </LegalListItem>
            </LegalList>

            <LegalCallout variant="info" title="Disponibilidad del servicio (SLA)">
              {APP_NAME} hace esfuerzos razonables por mantener una disponibilidad
              mensual <strong>≥ 99%</strong>, excluyendo ventanas de mantenimiento
              programado anunciadas con al menos <strong>48 horas</strong> de
              anticipación y eventos de fuerza mayor (ver §10).
            </LegalCallout>
          </LegalSection>

          <LegalSection id="uso-aceptable" number="05" title="Uso aceptable">
            <p>Al utilizar {APP_NAME}, te comprometes a:</p>
            <LegalList>
              <LegalListItem>
                Usar la plataforma únicamente para fines legítimos relacionados
                con la gestión de tu práctica médica.
              </LegalListItem>
              <LegalListItem>
                No registrar ni tratar datos de personas que no sean pacientes
                legítimos del profesional usuario.
              </LegalListItem>
              <LegalListItem>
                No intentar acceder a datos de otras organizaciones o usuarios.
              </LegalListItem>
              <LegalListItem>
                No realizar ingeniería inversa, descompilar o intentar extraer el
                código fuente de la plataforma.
              </LegalListItem>
              <LegalListItem>
                No utilizar la plataforma para almacenar o transmitir contenido
                ilegal, malicioso o que infrinja derechos de terceros.
              </LegalListItem>
              <LegalListItem>
                No sobrecargar intencionalmente los servidores ni interferir con
                el funcionamiento normal del servicio.
              </LegalListItem>
              <LegalListItem>
                Cumplir con todas las leyes y regulaciones aplicables, incluyendo
                las normas de protección de datos personales y datos de salud del
                Perú.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="propiedad"
            number="06"
            title="Propiedad intelectual"
          >
            <LegalList>
              <LegalListItem>
                {APP_NAME}, incluyendo su código, diseño, marca, logotipos y
                contenido, es propiedad exclusiva de sus creadores y está
                protegido por las leyes de propiedad intelectual.
              </LegalListItem>
              <LegalListItem>
                Los datos que ingreses en la plataforma (información de
                pacientes, notas médicas, etc.) siguen siendo de tu propiedad.
                Nos otorgas una licencia limitada para procesarlos exclusivamente
                con el fin de proveer el servicio.
              </LegalListItem>
              <LegalListItem>
                No puedes copiar, modificar, distribuir o crear obras derivadas
                de la plataforma sin autorización expresa por escrito.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="responsabilidad"
            number="07"
            title="Limitación de responsabilidad"
          >
            <LegalList>
              <LegalListItem>
                {APP_NAME} se proporciona &quot;tal como está&quot; y &quot;según
                disponibilidad&quot;. No garantizamos que el servicio sea
                ininterrumpido o libre de errores.
              </LegalListItem>
              <LegalListItem>
                Haremos esfuerzos razonables para mantener la disponibilidad y
                seguridad del servicio, pero no asumimos responsabilidad por
                pérdidas derivadas de interrupciones temporales, errores técnicos
                o accesos no autorizados por causas fuera de nuestro control.
              </LegalListItem>
              <LegalListItem>
                Nuestra responsabilidad total acumulada no excederá el monto
                pagado por ti en los últimos 12 meses de suscripción.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="medicos"
            number="08"
            title="Datos médicos — Descargo de responsabilidad"
          >
            <LegalCallout
              variant="warning"
              title={`${APP_NAME} NO es un dispositivo médico ni un sistema de diagnóstico`}
              icon={ShieldAlert}
            >
              La plataforma es una herramienta de gestión administrativa y
              clínica diseñada para apoyar al profesional de salud, pero no
              reemplaza el juicio clínico profesional.
            </LegalCallout>
            <LegalList>
              <LegalListItem>
                Las sugerencias generadas por el asistente de IA son orientativas
                y nunca deben considerarse como diagnóstico o recomendación
                médica definitiva.
              </LegalListItem>
              <LegalListItem>
                El profesional de salud es el único responsable de las decisiones
                clínicas tomadas con respecto a sus pacientes.
              </LegalListItem>
              <LegalListItem>
                {APP_NAME} no se hace responsable por diagnósticos, tratamientos
                o decisiones clínicas derivadas del uso de la plataforma o del
                asistente de IA.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="exportacion"
            number="09"
            title="Exportación y eliminación de datos al cancelar"
          >
            <LegalList>
              <LegalListItem>
                <strong>Período de gracia:</strong> 30 días calendario desde la
                cancelación para que el Cliente exporte pacientes, citas,
                historias clínicas y comprobantes en formato CSV o JSON.
              </LegalListItem>
              <LegalListItem>
                <strong>Eliminación posterior:</strong> pasados los 30 días, los
                datos se eliminan o anonimizan, salvo aquellos que la ley obligue
                a conservar (comprobantes electrónicos SUNAT: 5 años; historia
                clínica: el Cliente decide migrar a otro sistema o archivar
                offline conforme a la NTS 139-MINSA).
              </LegalListItem>
              <LegalListItem>
                La exportación durante el período de gracia es gratuita.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection id="fuerza-mayor" number="10" title="Fuerza mayor">
            <p>
              Ninguna parte será responsable por incumplimientos derivados de
              eventos fuera de su control razonable, incluyendo pero no limitado
              a: caídas de proveedores cloud, desastres naturales, ataques DDoS
              masivos, cortes generalizados de internet, conflictos armados,
              pandemias o decisiones gubernamentales que impidan la operación
              normal del servicio. Las obligaciones se reanudan tan pronto como
              cese el evento.
            </p>
          </LegalSection>

          <LegalSection id="cesion" number="11" title="Cesión">
            <p>
              {APP_NAME} puede ceder este contrato a una sucesora en el contexto
              de fusión, adquisición o reorganización corporativa, notificando al
              Cliente con al menos 30 días de anticipación. El Cliente no podrá
              ceder este contrato a terceros sin autorización previa y por
              escrito de {APP_NAME}.
            </p>
          </LegalSection>

          <LegalSection
            id="modificaciones"
            number="12"
            title="Modificaciones a los términos"
          >
            <p>
              Nos reservamos el derecho de modificar estos términos en cualquier
              momento. Los cambios serán notificados a través de la plataforma o
              por correo electrónico con al menos <strong>15 días</strong> de
              anticipación. El uso continuado del servicio después de la fecha
              efectiva de los cambios constituye tu aceptación de los nuevos
              términos.
            </p>
          </LegalSection>

          <LegalSection
            id="ley"
            number="13"
            title="Ley aplicable y jurisdicción"
          >
            <p>
              Estos términos se rigen por las leyes de la República del Perú.
              Cualquier controversia derivada del uso de {APP_NAME} se someterá
              previamente a una etapa de conciliación extrajudicial ante el{" "}
              <strong>Centro de Conciliación de la Cámara de Comercio de Lima</strong>
              , con un plazo máximo de 30 días calendario antes de iniciar
              cualquier acción judicial. De no llegarse a acuerdo, las partes se
              someten a la jurisdicción de los tribunales competentes de Lima,
              Perú.
            </p>
          </LegalSection>

          <LegalSection id="contacto" number="14" title="Contacto">
            <p>
              Si tienes preguntas sobre estos términos, puedes contactarnos a
              través de los siguientes canales:
            </p>
            <div className="not-prose mt-4 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:legal@yenda.app"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                )}
              >
                <Mail className="h-4 w-4" />
                legal@yenda.app
              </a>
              <Link
                href="/settings"
                className={buttonVariants({ variant: "outline" })}
              >
                Configuración de la cuenta
              </Link>
            </div>
          </LegalSection>

          <div className="mt-12 rounded-xl border border-border/70 bg-card/40 p-6 text-sm leading-relaxed text-muted-foreground">
            Al utilizar {APP_NAME}, confirmas que has leído y aceptado estos
            Términos y Condiciones en su totalidad.
          </div>
        </article>
      </div>
    </div>
  );
}
