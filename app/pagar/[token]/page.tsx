import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PayClient, type PayLinkData } from "./pay-client";

/**
 * Página pública de pago (enlace enviado al paciente por WhatsApp).
 * Sin sesión, móvil primero. El server component hace el fetch inicial del
 * estado del enlace y delega toda la interacción a <PayClient>.
 */

// El estado del enlace cambia (pending → paid/expired): nunca cachear.
export const dynamic = "force-dynamic";

// Página transaccional con token en la URL: fuera de los buscadores.
export const metadata: Metadata = {
  title: "Pago seguro",
  robots: { index: false, follow: false },
};

async function fetchPayLink(token: string): Promise<PayLinkData> {
  // fetch server-side necesita URL absoluta: se reconstruye desde los
  // headers del request (funciona igual en localhost, previews y prod).
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const res = await fetch(`${proto}://${host}/api/pay/${token}`, {
    cache: "no-store",
  });
  if (res.status === 404) notFound();
  if (!res.ok) {
    throw new Error(`No se pudo cargar el enlace de pago (${res.status})`);
  }
  return (await res.json()) as PayLinkData;
}

export default async function PagarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchPayLink(token);
  return <PayClient token={token} initialData={data} />;
}
