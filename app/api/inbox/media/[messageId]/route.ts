import { NextRequest, NextResponse } from "next/server";
import { getOrgWhatsApp, isInboxError, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

const MAX_BYTES = 16 * 1024 * 1024;
const ALLOWED = /^(image|audio|video)\/|^application\/pdf$/;

/**
 * GET /api/inbox/media/:messageId — muestra una foto / audio / documento
 * recibido sin guardarlo en el Storage de Yenda (MVP: no consume la
 * cuota). Se pide a Meta en el momento (el id de media vale ~7 días).
 * Solo para mensajes de la propia org; tipos y tamaño acotados.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const ctx = await requireInbox();
  if (isInboxError(ctx)) return ctx;
  const { messageId } = await params;
  const { data: msg } = await ctx.admin
    .from("wa_messages")
    .select("meta_media_id, media_mime")
    .eq("id", messageId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (!msg?.meta_media_id) return NextResponse.json({ error: "Sin archivo" }, { status: 404 });

  const wa = await getOrgWhatsApp(ctx.admin, ctx.orgId);
  if (!wa) return NextResponse.json({ error: "WhatsApp no configurado" }, { status: 400 });
  try {
    const info = await wa.getMediaInfo(msg.meta_media_id as string);
    const mime = info.mime_type ?? (msg.media_mime as string | null) ?? "application/octet-stream";
    if (!ALLOWED.test(mime)) return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 415 });
    if (info.file_size && info.file_size > MAX_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande" }, { status: 413 });
    }
    const res = await wa.downloadMedia(info.url);
    if (!res.ok || !res.body) return NextResponse.json({ error: "Meta no entregó el archivo" }, { status: 502 });
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "El archivo ya no está disponible en WhatsApp (vence a los 7 días)." },
      { status: 410 },
    );
  }
}
