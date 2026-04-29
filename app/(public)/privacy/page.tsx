import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Lock,
  Cloud,
  CreditCard,
  MessageCircle,
  Sparkles,
  Globe,
  Bug,
  FileText,
} from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { LegalSection } from "@/components/legal/legal-section";
import { LegalCallout } from "@/components/legal/legal-callout";
import { LegalList, LegalListItem } from "@/components/legal/legal-list";
import { LegalToc, type LegalTocItem } from "@/components/legal/legal-toc";
import { SubProcessorCard } from "@/components/legal/sub-processor-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: `Política de privacidad de ${APP_NAME}. Conoce cómo protegemos tus datos personales y médicos.`,
};

const TOC: LegalTocItem[] = [
  { id: "datos", label: "Datos que recopilamos" },
  { id: "rol-legal", label: "Rol legal y marco normativo" },
  { id: "uso", label: "Cómo usamos tus datos" },
  { id: "almacenamiento", label: "Almacenamiento y seguridad" },
  { id: "datos-medicos", label: "Datos médicos" },
  { id: "retencion", label: "Retención de datos" },
  { id: "terceros", label: "Sub-encargados y terceros" },
  { id: "incidentes", label: "Notificación de incidentes" },
  { id: "cookies", label: "Cookies y almacenamiento local" },
  { id: "derechos", label: "Tus derechos (Ley 29733)" },
  { id: "dpo", label: "Delegado de Protección de Datos" },
  { id: "contacto", label: "Contacto" },
];

export default function PrivacyPage() {
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
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Documento legal · Última actualización: 29 de abril de 2026
        </div>
        <h1 className="bg-gradient-to-br from-foreground via-foreground to-emerald-200/90 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          Política de Privacidad
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          En <strong className="text-foreground">{APP_NAME}</strong> nos
          comprometemos a proteger la privacidad y seguridad de tus datos
          personales y los datos médicos de tus pacientes. Esta política
          describe cómo recopilamos, usamos, almacenamos y protegemos tu
          información, conforme a la <strong className="text-foreground">Ley N° 29733
          </strong> y su Reglamento.
        </p>
      </header>

      <div className="mb-6 lg:hidden">
        <LegalToc items={TOC} />
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-12">
        <LegalToc items={TOC} />

        <article>
          <LegalSection id="datos" number="01" title="Datos que recopilamos">
            <p>Recopilamos los siguientes tipos de información:</p>
            <LegalList>
              <LegalListItem>
                <strong>Datos de cuenta:</strong> nombre completo, correo
                electrónico, número de teléfono, especialidad médica, nombre de
                la clínica o consultorio.
              </LegalListItem>
              <LegalListItem>
                <strong>Datos de pacientes:</strong> nombre, documento de
                identidad (DNI/CE), fecha de nacimiento, datos de contacto,
                historial clínico, notas médicas, diagnósticos y tratamientos
                registrados por el profesional de salud.
              </LegalListItem>
              <LegalListItem>
                <strong>Datos de uso:</strong> registros de actividad dentro de
                la plataforma, preferencias de configuración, horarios y citas.
              </LegalListItem>
              <LegalListItem>
                <strong>Datos de pago:</strong> información de suscripción y
                facturación procesada a través de Mercado Pago. No almacenamos
                datos de tarjetas de crédito o débito directamente.
              </LegalListItem>
              <LegalListItem>
                <strong>Datos técnicos:</strong> dirección IP, tipo de
                navegador, sistema operativo y datos de rendimiento de la
                aplicación.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="rol-legal"
            number="02"
            title="Rol legal y marco normativo"
            description="Cómo se distribuyen las responsabilidades sobre los datos personales bajo la legislación peruana."
          >
            <LegalCallout
              variant="info"
              title="Yenda actúa como Encargado del Tratamiento"
            >
              Conforme al art. 36 de la Ley 29733 y su Reglamento (DS 003-2013-PCM),
              el <strong>Cliente (clínica/consultorio)</strong> es el Titular del
              Banco de Datos de pacientes y responsable de su inscripción ante la
              ANPD cuando corresponda. {APP_NAME} actúa como{" "}
              <strong>Encargado del Tratamiento</strong>.
            </LegalCallout>
            <LegalList>
              <LegalListItem>
                {APP_NAME} solo trata datos siguiendo las instrucciones
                documentadas del Cliente y para los fines necesarios de
                prestación del servicio.
              </LegalListItem>
              <LegalListItem>
                {APP_NAME} no utiliza los datos del Cliente con fines propios ni
                los comercializa.
              </LegalListItem>
              <LegalListItem>
                Al fin del contrato, {APP_NAME} devuelve o elimina los datos
                según instrucción del Cliente, salvo obligaciones legales de
                retención (ver §06).
              </LegalListItem>
              <LegalListItem>
                {APP_NAME} mantiene un registro interno de las actividades de
                tratamiento y aplica medidas técnicas y organizativas adecuadas
                conforme a la Directiva de Seguridad de la ANPD.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection id="uso" number="03" title="Cómo usamos tus datos">
            <p>Utilizamos tu información para:</p>
            <LegalList>
              <LegalListItem>Proveer y mantener los servicios de {APP_NAME}.</LegalListItem>
              <LegalListItem>
                Gestionar citas, historiales clínicos y la comunicación con
                pacientes.
              </LegalListItem>
              <LegalListItem>
                Procesar pagos y gestionar suscripciones.
              </LegalListItem>
              <LegalListItem>
                Enviar recordatorios de citas por WhatsApp o correo electrónico
                (con tu autorización).
              </LegalListItem>
              <LegalListItem>
                Mejorar la plataforma mediante análisis agregados y
                anonimizados.
              </LegalListItem>
              <LegalListItem>
                Cumplir con obligaciones legales, regulatorias y tributarias.
              </LegalListItem>
              <LegalListItem>
                Proveer funcionalidades de asistente con inteligencia artificial
                para apoyo clínico (resúmenes, sugerencias).
              </LegalListItem>
            </LegalList>
            <LegalCallout variant="success" title="IA y privacidad">
              Anthropic (proveedor del asistente de IA) opera bajo una política
              de <strong>zero-data-retention</strong>: los inputs y outputs no
              se almacenan ni se utilizan para entrenar modelos. El Cliente
              puede solicitar la desactivación de funciones de IA escribiendo a{" "}
              <a
                href="mailto:privacidad@yenda.app"
                className="font-medium text-emerald-300 hover:text-emerald-200"
              >
                privacidad@yenda.app
              </a>
              .
            </LegalCallout>
          </LegalSection>

          <LegalSection
            id="almacenamiento"
            number="04"
            title="Almacenamiento y seguridad"
            description="Tus datos se almacenan en infraestructura segura proporcionada por Supabase, que opera sobre Amazon Web Services (AWS)."
          >
            <LegalList>
              <LegalListItem>
                <strong>Cifrado en tránsito:</strong> todas las comunicaciones se
                realizan mediante HTTPS / TLS 1.2+.
              </LegalListItem>
              <LegalListItem>
                <strong>Cifrado en reposo:</strong> los datos almacenados están
                cifrados con AES-256.
              </LegalListItem>
              <LegalListItem>
                <strong>Row Level Security (RLS):</strong> políticas a nivel de
                fila garantizan que cada organización solo acceda a sus propios
                datos.
              </LegalListItem>
              <LegalListItem>
                <strong>Autenticación segura:</strong> contraseñas hasheadas con
                bcrypt; tokens JWT con expiración.
              </LegalListItem>
              <LegalListItem>
                <strong>Campos sensibles cifrados:</strong> credenciales de
                terceros y datos especialmente sensibles se cifran con una clave
                adicional a nivel de aplicación (AES-256-GCM).
              </LegalListItem>
              <LegalListItem>
                <strong>Copias de seguridad:</strong> backups automáticos
                diarios de la base de datos.
              </LegalListItem>
              <LegalListItem>
                <strong>Auditoría:</strong> registros de acceso a datos
                sensibles y actividad administrativa relevante.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection id="datos-medicos" number="05" title="Datos médicos">
            <p>
              Entendemos la naturaleza especialmente sensible de los datos
              médicos. Por ello:
            </p>
            <LegalList>
              <LegalListItem>
                Aplicamos buenas prácticas internacionales de seguridad de
                información en salud (referencias NIST 800-66 / ISO 27001 /
                HIPAA), adaptadas al marco legal peruano.
              </LegalListItem>
              <LegalListItem>
                Cumplimos con la Ley N° 29733 — Ley de Protección de Datos
                Personales del Perú, su Reglamento y la NTS 139-MINSA para el
                manejo de la historia clínica electrónica.
              </LegalListItem>
              <LegalListItem>
                El acceso a datos de pacientes está restringido exclusivamente a
                los miembros autorizados de cada organización.
              </LegalListItem>
              <LegalListItem>
                Los registros médicos no se comparten entre organizaciones bajo
                ninguna circunstancia.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="retencion"
            number="06"
            title="Retención de datos"
            description="Los plazos de conservación responden a obligaciones legales sectoriales y a la naturaleza de cada categoría de dato."
          >
            <LegalList>
              <LegalListItem>
                <strong>Historia clínica:</strong> mínimo <strong>15 años</strong>{" "}
                desde la última atención, conforme a la NTS 139-MINSA/DGIESP-V.01.
              </LegalListItem>
              <LegalListItem>
                <strong>Datos contables y comprobantes electrónicos:</strong>{" "}
                <strong>5 años</strong>, conforme al art. 87° del Código
                Tributario.
              </LegalListItem>
              <LegalListItem>
                <strong>Datos de cuenta del usuario:</strong> hasta{" "}
                <strong>30 días</strong> post-cancelación; luego se anonimizan o
                eliminan.
              </LegalListItem>
              <LegalListItem>
                <strong>Logs técnicos y de auditoría:</strong> 12 meses.
              </LegalListItem>
              <LegalListItem>
                Durante el período de gracia post-cancelación, el Cliente puede
                exportar sus datos en formato estructurado (CSV / JSON) sin
                costo.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="terceros"
            number="07"
            title="Sub-encargados y terceros"
            description="No vendemos ni compartimos datos personales con fines publicitarios. Trabajamos con los siguientes proveedores para prestar el servicio:"
          >
            <div className="not-prose mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SubProcessorCard
                name="Supabase / AWS"
                purpose="Base de datos, autenticación y almacenamiento. Infraestructura cloud."
                region="US"
                policyUrl="https://supabase.com/privacy"
                icon={Cloud}
              />
              <SubProcessorCard
                name="Vercel"
                purpose="Hosting y red de borde (edge) de la aplicación web."
                region="US"
                policyUrl="https://vercel.com/legal/privacy-policy"
                icon={Globe}
              />
              <SubProcessorCard
                name="Mercado Pago"
                purpose="Procesamiento de pagos y gestión de suscripciones (monto, correo del titular)."
                region="LATAM"
                policyUrl="https://www.mercadopago.com.pe/ayuda/terminos-y-politicas_194"
                icon={CreditCard}
              />
              <SubProcessorCard
                name="Nubefact"
                purpose="Emisión electrónica SUNAT (RUC, razón social, datos del comprobante)."
                region="PE"
                policyUrl="https://www.nubefact.com/politica-privacidad"
                icon={FileText}
              />
              <SubProcessorCard
                name="Resend"
                purpose="Envío transaccional de correos: confirmaciones, recordatorios, recibos."
                region="US"
                policyUrl="https://resend.com/legal/privacy-policy"
                icon={Mail}
              />
              <SubProcessorCard
                name="WhatsApp (Meta)"
                purpose="Envío de recordatorios de citas (solo cuando el profesional lo activa)."
                region="US/EU"
                policyUrl="https://www.whatsapp.com/legal/privacy-policy"
                icon={MessageCircle}
              />
              <SubProcessorCard
                name="Anthropic"
                purpose="Funciones de asistente con IA. Zero-data-retention; no se entrenan modelos con tus datos."
                region="US"
                policyUrl="https://www.anthropic.com/legal/privacy"
                icon={Sparkles}
              />
              <SubProcessorCard
                name="Sentry"
                purpose="Monitoreo de errores. Configurado con scrubbing de datos sensibles."
                region="US"
                policyUrl="https://sentry.io/privacy/"
                icon={Bug}
              />
              <SubProcessorCard
                name="Google"
                purpose="Inicio de sesión opcional con Google OAuth (correo, nombre, foto de perfil)."
                region="US"
                policyUrl="https://policies.google.com/privacy"
                icon={Lock}
              />
            </div>

            <LegalCallout variant="info" title="Transferencia internacional">
              AWS, Vercel, Anthropic, Sentry, Resend y Google operan
              principalmente en EE.UU. y la UE. La base legal para la
              transferencia internacional es el consentimiento informado del
              usuario al aceptar esta política, complementado con cláusulas
              contractuales de protección de datos con cada proveedor.
            </LegalCallout>

            <p className="mt-6">
              <strong className="text-foreground">Notificación de cambios:</strong>{" "}
              avisaremos cualquier alta de un nuevo sub-encargado con al menos{" "}
              <strong>30 días</strong> de anticipación.
            </p>
            <p>
              También podemos compartir información cuando sea requerido por ley
              o por orden judicial emitida por autoridad competente.
            </p>
          </LegalSection>

          <LegalSection
            id="incidentes"
            number="08"
            title="Notificación de incidentes de seguridad"
          >
            <LegalCallout
              variant="time"
              title="Notificación dentro de 72 horas"
              icon={Clock}
            >
              {APP_NAME} notificará al Cliente <strong>dentro de las 72 horas</strong>{" "}
              desde la detección de un incidente que comprometa los datos del
              Cliente o de sus pacientes.
            </LegalCallout>
            <p>
              La notificación se enviará al correo del owner registrado e
              incluirá: naturaleza del incidente, datos afectados, medidas
              tomadas para contener el incidente y recomendaciones para el
              Cliente.
            </p>
          </LegalSection>

          <LegalSection
            id="cookies"
            number="09"
            title="Cookies y almacenamiento local"
          >
            <LegalList>
              <LegalListItem>
                <strong>Cookies de sesión:</strong> necesarias para mantener tu
                sesión autenticada de forma segura.
              </LegalListItem>
              <LegalListItem>
                <strong>localStorage:</strong> para almacenar preferencias de
                interfaz (tema, idioma, estado del sidebar) que mejoren tu
                experiencia.
              </LegalListItem>
              <LegalListItem>
                No utilizamos cookies de terceros con fines de rastreo o
                publicidad.
              </LegalListItem>
            </LegalList>
          </LegalSection>

          <LegalSection
            id="derechos"
            number="10"
            title="Tus derechos (Ley 29733)"
            description="De acuerdo con la Ley N° 29733 y normativa aplicable, tienes los siguientes derechos sobre tus datos personales:"
          >
            <LegalList>
              <LegalListItem>
                <strong>Acceso:</strong> solicitar una copia de los datos
                personales que tenemos sobre ti.
              </LegalListItem>
              <LegalListItem>
                <strong>Rectificación:</strong> corregir datos inexactos o
                desactualizados.
              </LegalListItem>
              <LegalListItem>
                <strong>Cancelación / Supresión:</strong> solicitar la
                eliminación de tus datos personales, sujeto a obligaciones
                legales de retención (ver §06).
              </LegalListItem>
              <LegalListItem>
                <strong>Oposición:</strong> oponerte al tratamiento de tus datos
                para fines específicos.
              </LegalListItem>
              <LegalListItem>
                <strong>Portabilidad:</strong> solicitar tus datos en un formato
                estructurado y de uso común.
              </LegalListItem>
            </LegalList>
            <LegalCallout
              variant="info"
              title="Plazo de respuesta: 20 días hábiles"
              icon={AlertTriangle}
            >
              Conforme al art. 24 del Reglamento de la Ley 29733, responderemos
              tu solicitud ARCO dentro de un plazo máximo de <strong>20 días
              hábiles</strong> desde su recepción. Para ejercer cualquiera de
              estos derechos, contáctanos a{" "}
              <a
                href="mailto:privacidad@yenda.app"
                className="font-medium text-emerald-300 hover:text-emerald-200"
              >
                privacidad@yenda.app
              </a>
              .
            </LegalCallout>
          </LegalSection>

          <LegalSection
            id="dpo"
            number="11"
            title="Delegado de Protección de Datos"
          >
            <p>
              {APP_NAME} ha designado un punto de contacto único para asuntos de
              privacidad y protección de datos:
            </p>
            <div className="not-prose mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <p className="text-sm text-foreground">
                <strong>Contacto:</strong>{" "}
                <a
                  href="mailto:privacidad@yenda.app"
                  className="font-medium text-emerald-300 hover:text-emerald-200"
                >
                  privacidad@yenda.app
                </a>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Consultas, solicitudes ARCO, reportes de incidentes y cualquier
                duda sobre el tratamiento de tus datos.
              </p>
            </div>
          </LegalSection>

          <LegalSection id="contacto" number="12" title="Contacto">
            <p>
              Si tienes preguntas o solicitudes relacionadas con esta política
              de privacidad, puedes contactarnos a través de los siguientes
              canales:
            </p>
            <div className="not-prose mt-4 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:privacidad@yenda.app"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                )}
              >
                <Mail className="h-4 w-4" />
                privacidad@yenda.app
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
            Esta política puede ser actualizada periódicamente. Te notificaremos
            sobre cambios significativos a través de la plataforma o por correo
            electrónico, con al menos 15 días de anticipación cuando los cambios
            afecten materialmente tus derechos.
          </div>
        </article>
      </div>
    </div>
  );
}
