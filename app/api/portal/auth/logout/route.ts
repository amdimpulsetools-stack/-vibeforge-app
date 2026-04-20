import { NextResponse } from "next/server";
import { destroyPortalSession } from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function POST() {
  await destroyPortalSession();
  return NextResponse.json({ success: true });
}
