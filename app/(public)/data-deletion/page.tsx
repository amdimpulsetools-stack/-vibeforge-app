import Link from "next/link";
import { ArrowLeft, Trash2, Clock, Mail, ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { LegalSection } from "@/components/legal/legal-section";
import { LegalCallout } from "@/components/legal/legal-callout";
import { LegalList, LegalListItem } from "@/components/legal/legal-list";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: `Cómo solicitar la eliminación de tu cuenta y tus datos en ${APP_NAME}.`,
};

/**
 * Página pública de instrucciones de eliminación de datos.
 *
 * Existe porque el App Review de Meta (campo "Eliminación de datos de
 * usuario" en developers.facebook.com) exige una URL pública con
 * instrucciones claras — y porque es buena práctica bajo la Ley 29733.
 * El flujo real ya existía (Zona de peligro en /account + cron de purga
 * con gracia de 30 días, mig 149); esto solo lo documenta de cara al
 * público. Debe permanecer accesible SIN login (publicPaths del
 * middleware).
 */
export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-8 -ml-2")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver al inicio
      </Link>

      <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
        <Trash2 className="h-7 w-7 text-primary" /> Eliminación de datos
      </h1>
      <p className="mt-3 text-muted-foreground">
        En {APP_NAME} puedes solicitar la eliminación de tu cuenta y de los datos
        personales asociados en cualquier momento. Esta página explica cómo
        hacerlo y qué ocurre después.
      </p>

      <LegalSection number="01" id="desde-la-app" title="Opción 1 — Desde la aplicación (recomendada)">
        <LegalList>
          <LegalListItem>
            Inicia sesión en {APP_NAME} y ve a <strong>Mi cuenta</strong>.
          </LegalListItem>
          <LegalListItem>
            Baja hasta la sección <strong>Zona de peligro</strong> y elige{" "}
            <strong>Eliminar mi cuenta</strong>.
          </LegalListItem>
          <LegalListItem>
            Confirma la solicitud. Recibirás un correo de confirmación con la
            fecha efectiva de eliminación.
          </LegalListItem>
        </LegalList>
      </LegalSection>

      <LegalSection number="02" id="por-correo" title="Opción 2 — Por correo electrónico">
        <p>
          Si no puedes acceder a tu cuenta, escribe a{" "}
          <a href="mailto:privacidad@yenda.app" className="font-medium text-primary underline">
            privacidad@yenda.app
          </a>{" "}
          desde el correo asociado a tu cuenta, con el asunto{" "}
          <em>&quot;Solicitud de eliminación de datos&quot;</em>. Atendemos las
          solicitudes en un plazo máximo de 10 días hábiles, conforme a la Ley
          N.º 29733 de Protección de Datos Personales del Perú.
        </p>
      </LegalSection>

      <LegalSection number="03" id="que-ocurre" title="Qué ocurre al solicitar la eliminación">
        <LegalList>
          <LegalListItem icon={Clock}>
            <strong>Periodo de gracia de 30 días.</strong> Tu cuenta se desactiva
            de inmediato y los datos se eliminan definitivamente al cumplirse 30
            días. Durante ese periodo puedes arrepentirte y reactivarla
            escribiéndonos.
          </LegalListItem>
          <LegalListItem icon={Trash2}>
            <strong>Se elimina:</strong> tu perfil de usuario, credenciales de
            acceso, configuraciones y datos de facturación de la suscripción.
          </LegalListItem>
          <LegalListItem icon={ShieldCheck}>
            <strong>Historias clínicas:</strong> los registros médicos de
            pacientes pertenecen a la clínica tratante (titular del banco de
            datos) y están sujetos a plazos de conservación exigidos por la
            normativa de salud peruana. Si eres paciente, dirige tu solicitud a
            tu clínica; como encargados del tratamiento, la asistiremos en
            cumplirla.
          </LegalListItem>
        </LegalList>
      </LegalSection>

      <LegalSection number="04" id="whatsapp" title="Datos recibidos a través de WhatsApp">
        <p>
          Si escribiste a una clínica por WhatsApp y tus mensajes fueron
          procesados por {APP_NAME} en nombre de esa clínica, puedes pedir su
          eliminación por cualquiera de las dos vías anteriores indicando el
          número de teléfono desde el que escribiste. Eliminaremos las
          conversaciones y los metadatos asociados dentro del mismo plazo.
        </p>
      </LegalSection>

      <LegalCallout icon={Mail}>
        ¿Dudas sobre este proceso? Escríbenos a{" "}
        <a href="mailto:privacidad@yenda.app" className="font-medium underline">
          privacidad@yenda.app
        </a>
        . Más detalle sobre el tratamiento de datos en nuestra{" "}
        <Link href="/privacy" className="font-medium underline">
          Política de Privacidad
        </Link>
        .
      </LegalCallout>
    </main>
  );
}
