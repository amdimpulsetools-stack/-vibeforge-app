import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: `Política de privacidad de ${APP_NAME}. Conoce cómo protegemos tus datos personales y médicos.`,
};

export default function PrivacyPage() {
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
        Política de Privacidad
      </h1>
      <p className="text-muted-foreground">
        Última actualización: 26 de marzo de 2026
      </p>

      <p>
        En <strong>{APP_NAME}</strong> nos comprometemos a proteger la privacidad
        y seguridad de tus datos personales y los datos médicos de tus pacientes.
        Esta política describe cómo recopilamos, usamos, almacenamos y protegemos
        tu información.
      </p>

      {/* ---- Datos que recopilamos ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        1. Datos que recopilamos
      </h2>
      <p>Recopilamos los siguientes tipos de información:</p>
      <ul>
        <li>
          <strong>Datos de cuenta:</strong> nombre completo, correo electrónico,
          número de teléfono, especialidad médica, nombre de la clínica o
          consultorio.
        </li>
        <li>
          <strong>Datos de pacientes:</strong> nombre, documento de identidad
          (DNI/CE), fecha de nacimiento, datos de contacto, historial clínico,
          notas médicas, diagnósticos y tratamientos registrados por el
          profesional de salud.
        </li>
        <li>
          <strong>Datos de uso:</strong> registros de actividad dentro de la
          plataforma, preferencias de configuración, horarios y citas.
        </li>
        <li>
          <strong>Datos de pago:</strong> información de suscripción y
          facturación procesada a través de Mercado Pago. No almacenamos datos
          de tarjetas de crédito o débito directamente.
        </li>
        <li>
          <strong>Datos técnicos:</strong> dirección IP, tipo de navegador,
          sistema operativo y datos de rendimiento de la aplicación.
        </li>
      </ul>

      {/* ---- Cómo usamos tus datos ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        2. Cómo usamos tus datos
      </h2>
      <p>Utilizamos tu información para:</p>
      <ul>
        <li>Proveer y mantener los servicios de {APP_NAME}.</li>
        <li>
          Gestionar citas, historiales clínicos y la comunicación con pacientes.
        </li>
        <li>Procesar pagos y gestionar suscripciones.</li>
        <li>
          Enviar recordatorios de citas por WhatsApp o correo electrónico (con tu
          autorización).
        </li>
        <li>
          Mejorar la plataforma mediante análisis agregados y anonimizados.
        </li>
        <li>Cumplir con obligaciones legales y regulatorias.</li>
        <li>
          Proveer funcionalidades de asistente con inteligencia artificial para
          apoyo clínico (resúmenes, sugerencias). Los datos enviados al
          asistente de IA se procesan de forma segura y no se utilizan para
          entrenar modelos.
        </li>
      </ul>

      {/* ---- Almacenamiento y seguridad ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        3. Almacenamiento y seguridad
      </h2>
      <p>
        Tus datos se almacenan en infraestructura segura proporcionada por{" "}
        <strong>Supabase</strong>, que opera sobre Amazon Web Services (AWS).
        Implementamos las siguientes medidas de seguridad:
      </p>
      <ul>
        <li>
          <strong>Cifrado en tránsito:</strong> todas las comunicaciones se
          realizan mediante HTTPS/TLS 1.2+.
        </li>
        <li>
          <strong>Cifrado en reposo:</strong> los datos almacenados en la base
          de datos están cifrados con AES-256.
        </li>
        <li>
          <strong>Row Level Security (RLS):</strong> políticas de seguridad a
          nivel de fila en la base de datos que garantizan que cada organización
          solo acceda a sus propios datos.
        </li>
        <li>
          <strong>Autenticación segura:</strong> contraseñas hasheadas con
          bcrypt, soporte para tokens JWT con expiración.
        </li>
        <li>
          <strong>Campos sensibles cifrados:</strong> datos médicos
          especialmente sensibles se cifran con una clave adicional a nivel de
          aplicación.
        </li>
        <li>
          <strong>Copias de seguridad:</strong> backups automáticos diarios de
          la base de datos.
        </li>
      </ul>

      {/* ---- Datos médicos ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        4. Datos médicos
      </h2>
      <p>
        Entendemos la naturaleza especialmente sensible de los datos médicos.
        Por ello:
      </p>
      <ul>
        <li>
          Aplicamos estándares de protección equivalentes a los de HIPAA
          (Health Insurance Portability and Accountability Act) de los Estados
          Unidos, adaptados al marco legal peruano.
        </li>
        <li>
          Cumplimos con la Ley N° 29733 — Ley de Protección de Datos Personales
          del Perú y su reglamento.
        </li>
        <li>
          El acceso a datos de pacientes está restringido exclusivamente a los
          miembros autorizados de cada organización (clínica/consultorio).
        </li>
        <li>
          Los registros médicos no se comparten entre organizaciones bajo
          ninguna circunstancia.
        </li>
        <li>
          Mantenemos registros de auditoría (logs) de acceso a datos sensibles.
        </li>
      </ul>

      {/* ---- Compartir datos con terceros ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        5. Compartir datos con terceros
      </h2>
      <p>
        No vendemos ni compartimos tus datos personales o los de tus pacientes
        con fines publicitarios. Solo compartimos información con:
      </p>
      <ul>
        <li>
          <strong>Mercado Pago:</strong> procesador de pagos para gestionar
          suscripciones y cobros. Solo se comparten los datos necesarios para la
          transacción (monto, correo electrónico del titular). Consulta su{" "}
          <a
            href="https://www.mercadopago.com.pe/ayuda/terminos-y-politicas_194"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            política de privacidad
          </a>
          .
        </li>
        <li>
          <strong>WhatsApp (Meta Business):</strong> para envío de recordatorios
          de citas, únicamente cuando el profesional de salud activa esta
          función. Solo se comparte el número de teléfono del paciente y el
          contenido del recordatorio.
        </li>
        <li>
          <strong>Supabase / AWS:</strong> como proveedores de infraestructura y
          almacenamiento de datos.
        </li>
        <li>
          <strong>Anthropic:</strong> para funcionalidades de asistente con IA.
          Los datos se envían de forma segura y no se utilizan para
          entrenar modelos de terceros.
        </li>
        <li>
          <strong>Autoridades competentes:</strong> cuando sea requerido por ley
          o por orden judicial.
        </li>
      </ul>

      {/* ---- Cookies y localStorage ---- */}
      <h2 className="text-xl font-semibold text-foreground">
        6. Cookies y almacenamiento local
      </h2>
      <p>Utilizamos:</p>
      <ul>
        <li>
          <strong>Cookies de sesión:</strong> necesarias para mantener tu sesión
          autenticada de forma segura.
        </li>
        <li>
          <strong>localStorage:</strong> para almacenar preferencias de interfaz
          (tema, idioma, estado del sidebar) que mejoren tu experiencia.
        </li>
        <li>
          No utilizamos cookies de terceros con fines de rastreo o publicidad.
        </li>
      </ul>

      {/* ---- Tus derechos ---- */}
      <h2 className="text-xl font-semibold text-foreground">7. Tus derechos</h2>
      <p>
        De acuerdo con la Ley N° 29733 y normativa aplicable, tienes derecho a:
      </p>
      <ul>
        <li>
          <strong>Acceso:</strong> solicitar una copia de los datos personales
          que tenemos sobre ti.
        </li>
        <li>
          <strong>Rectificación:</strong> corregir datos inexactos o
          desactualizados.
        </li>
        <li>
          <strong>Cancelación/Eliminación:</strong> solicitar la eliminación de
          tus datos personales, sujeto a obligaciones legales de retención
          (especialmente para registros médicos, que pueden tener períodos
          mínimos de conservación establecidos por ley).
        </li>
        <li>
          <strong>Oposición:</strong> oponerte al tratamiento de tus datos para
          fines específicos.
        </li>
        <li>
          <strong>Portabilidad:</strong> solicitar tus datos en un formato
          estructurado y de uso común.
        </li>
      </ul>
      <p>
        Para ejercer cualquiera de estos derechos, contáctanos a través de los
        medios indicados en la sección de Contacto.
      </p>

      {/* ---- Contacto ---- */}
      <h2 className="text-xl font-semibold text-foreground">8. Contacto</h2>
      <p>
        Si tienes preguntas o solicitudes relacionadas con esta política de
        privacidad, puedes contactarnos en:
      </p>
      <ul>
        <li>
          <strong>Correo electrónico:</strong>{" "}
          <a
            href="mailto:privacidad@yenda.app"
            className="text-emerald-400 hover:text-emerald-300"
          >
            privacidad@yenda.app
          </a>
        </li>
        <li>
          <strong>Plataforma:</strong> desde la sección de Configuración en tu
          cuenta de {APP_NAME}.
        </li>
      </ul>

      <div className="mt-12 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          Esta política de privacidad puede ser actualizada periódicamente. Te
          notificaremos sobre cambios significativos a través de la plataforma o
          por correo electrónico.
        </p>
      </div>
    </article>
  );
}
