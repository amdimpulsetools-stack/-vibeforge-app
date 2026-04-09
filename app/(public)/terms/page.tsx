import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: `Términos y condiciones de uso de ${APP_NAME}. Lee las condiciones que rigen el uso de nuestra plataforma.`,
};

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground no-underline transition-colors hover:text-emerald-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio
      </Link>

      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Términos y Condiciones de Uso
      </h1>
      <p className="text-muted-foreground">
        Última actualización: 26 de marzo de 2026
      </p>

      <p>
        Bienvenido a <strong>{APP_NAME}</strong>. Al acceder y utilizar nuestra
        plataforma, aceptas estos términos y condiciones en su totalidad. Si no
        estás de acuerdo con alguna parte, no debes utilizar el servicio.
      </p>

      {/* ---- Aceptación de términos ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        1. Aceptación de términos
      </h2>
      <p>
        Al crear una cuenta, acceder o utilizar {APP_NAME}, declaras que has
        leído, entendido y aceptado estos Términos y Condiciones, así como
        nuestra{" "}
        <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300">
          Política de Privacidad
        </Link>
        . Si utilizas la plataforma en nombre de una organización (clínica,
        consultorio o centro médico), declaras que tienes la autoridad para
        vincular a dicha organización a estos términos.
      </p>

      {/* ---- Descripción del servicio ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        2. Descripción del servicio
      </h2>
      <p>
        {APP_NAME} es una plataforma de gestión integral para clínicas y
        consultorios médicos que incluye:
      </p>
      <ul>
        <li>Agenda inteligente y gestión de citas.</li>
        <li>Registro y gestión de pacientes e historiales clínicos.</li>
        <li>Gestión de equipo médico y administrativo.</li>
        <li>Reportes y analíticas de la práctica médica.</li>
        <li>Asistente con inteligencia artificial para apoyo clínico.</li>
        <li>Recordatorios automáticos por WhatsApp y correo electrónico.</li>
        <li>Integración con Mercado Pago para cobros y suscripciones.</li>
      </ul>

      {/* ---- Cuentas y acceso ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        3. Cuentas y acceso
      </h2>
      <ul>
        <li>
          Debes proporcionar información veraz y actualizada al registrarte.
        </li>
        <li>
          Eres responsable de mantener la confidencialidad de tus credenciales
          de acceso (correo y contraseña).
        </li>
        <li>
          Debes notificarnos inmediatamente si sospechas de un acceso no
          autorizado a tu cuenta.
        </li>
        <li>
          El propietario de la organización puede invitar miembros con
          diferentes roles (administrador, doctor, recepcionista), cada uno con
          permisos específicos.
        </li>
        <li>
          Nos reservamos el derecho de suspender o cancelar cuentas que violen
          estos términos.
        </li>
      </ul>

      {/* ---- Planes y pagos ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        4. Planes y pagos
      </h2>
      <ul>
        <li>
          {APP_NAME} ofrece diferentes planes de suscripción con distintas
          funcionalidades y límites. Los detalles y precios de cada plan están
          disponibles en la plataforma.
        </li>
        <li>
          <strong>Período de prueba:</strong> los nuevos usuarios pueden acceder
          a un período de prueba gratuito según lo indicado al momento del
          registro. Al finalizar el período de prueba, se requerirá la
          suscripción a un plan de pago para continuar usando el servicio.
        </li>
        <li>
          <strong>Procesador de pagos:</strong> todos los pagos se procesan a
          través de <strong>Mercado Pago</strong>. Al realizar un pago, aceptas
          también los términos y condiciones de Mercado Pago.
        </li>
        <li>
          <strong>Facturación:</strong> las suscripciones se cobran de forma
          mensual o anual según el plan elegido. Los cargos se realizan de
          forma automática al inicio de cada período.
        </li>
        <li>
          <strong>Cancelación:</strong> puedes cancelar tu suscripción en
          cualquier momento desde la configuración de tu cuenta. La cancelación
          será efectiva al final del período de facturación vigente. No se
          realizan reembolsos por períodos parciales.
        </li>
        <li>
          <strong>Cambios de precio:</strong> nos reservamos el derecho de
          modificar los precios con un aviso previo mínimo de 30 días por
          correo electrónico.
        </li>
      </ul>

      {/* ---- Uso aceptable ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        5. Uso aceptable
      </h2>
      <p>Al utilizar {APP_NAME}, te comprometes a:</p>
      <ul>
        <li>
          Usar la plataforma únicamente para fines legítimos relacionados con la
          gestión de tu práctica médica.
        </li>
        <li>
          No intentar acceder a datos de otras organizaciones o usuarios.
        </li>
        <li>
          No realizar ingeniería inversa, descompilar o intentar extraer el
          código fuente de la plataforma.
        </li>
        <li>
          No utilizar la plataforma para almacenar o transmitir contenido
          ilegal, malicioso o que infrinja derechos de terceros.
        </li>
        <li>
          No sobrecargar intencionalmente los servidores o interferir con el
          funcionamiento normal del servicio.
        </li>
        <li>
          Cumplir con todas las leyes y regulaciones aplicables, incluyendo las
          normas de protección de datos personales y datos de salud del Perú.
        </li>
      </ul>

      {/* ---- Propiedad intelectual ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        6. Propiedad intelectual
      </h2>
      <ul>
        <li>
          {APP_NAME}, incluyendo su código, diseño, marca, logotipos y
          contenido, es propiedad exclusiva de sus creadores y está protegido
          por las leyes de propiedad intelectual.
        </li>
        <li>
          Los datos que ingreses en la plataforma (información de pacientes,
          notas médicas, etc.) siguen siendo de tu propiedad. Nos otorgas una
          licencia limitada para procesarlos exclusivamente con el fin de
          proveer el servicio.
        </li>
        <li>
          No puedes copiar, modificar, distribuir o crear obras derivadas de la
          plataforma sin autorización expresa por escrito.
        </li>
      </ul>

      {/* ---- Limitación de responsabilidad ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        7. Limitación de responsabilidad
      </h2>
      <ul>
        <li>
          {APP_NAME} se proporciona &quot;tal como está&quot; y &quot;según
          disponibilidad&quot;. No garantizamos que el servicio sea
          ininterrumpido o libre de errores.
        </li>
        <li>
          Haremos esfuerzos razonables para mantener la disponibilidad y
          seguridad del servicio, pero no asumimos responsabilidad por pérdidas
          derivadas de interrupciones temporales, errores técnicos o accesos no
          autorizados por causas fuera de nuestro control.
        </li>
        <li>
          Nuestra responsabilidad total acumulada no excederá el monto pagado
          por ti en los últimos 12 meses de suscripción.
        </li>
      </ul>

      {/* ---- Datos médicos ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        8. Datos médicos — Descargo de responsabilidad
      </h2>
      <p>
        <strong>
          {APP_NAME} NO es un dispositivo médico ni un sistema de diagnóstico.
        </strong>
      </p>
      <ul>
        <li>
          La plataforma es una herramienta de gestión administrativa y clínica
          diseñada para apoyar al profesional de salud, pero no reemplaza el
          juicio clínico profesional.
        </li>
        <li>
          Las sugerencias generadas por el asistente de IA son orientativas y
          nunca deben considerarse como diagnóstico o recomendación médica
          definitiva.
        </li>
        <li>
          El profesional de salud es el único responsable de las decisiones
          clínicas tomadas con respecto a sus pacientes.
        </li>
        <li>
          {APP_NAME} no se hace responsable por diagnósticos, tratamientos o
          decisiones clínicas derivadas del uso de la plataforma o del
          asistente de IA.
        </li>
      </ul>

      {/* ---- Modificaciones ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        9. Modificaciones a los términos
      </h2>
      <p>
        Nos reservamos el derecho de modificar estos términos en cualquier
        momento. Los cambios serán notificados a través de la plataforma o por
        correo electrónico con al menos 15 días de anticipación. El uso
        continuado del servicio después de la fecha efectiva de los cambios
        constituye tu aceptación de los nuevos términos.
      </p>

      {/* ---- Ley aplicable ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        10. Ley aplicable y jurisdicción
      </h2>
      <p>
        Estos términos se rigen por las leyes de la República del Perú.
        Cualquier controversia derivada del uso de {APP_NAME} será sometida a la
        jurisdicción de los tribunales competentes de Lima, Perú. Las partes
        acuerdan agotar una etapa de conciliación extrajudicial antes de iniciar
        cualquier procedimiento judicial.
      </p>

      {/* ---- Contacto ---- */}
      <h2 className="text-xl font-semibold text-foreground">11. Contacto</h2>
      <p>
        Si tienes preguntas sobre estos términos, puedes contactarnos en:
      </p>
      <ul>
        <li>
          <strong>Correo electrónico:</strong>{" "}
          <a
            href="mailto:legal@vibeforge.app"
            className="text-emerald-400 hover:text-emerald-300"
          >
            legal@vibeforge.app
          </a>
        </li>
        <li>
          <strong>Plataforma:</strong> desde la sección de Configuración en tu
          cuenta de {APP_NAME}.
        </li>
      </ul>

      <div className="mt-12 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          Al utilizar {APP_NAME}, confirmas que has leído y aceptado estos
          Términos y Condiciones en su totalidad.
        </p>
      </div>
    </article>
  );
}
