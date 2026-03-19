import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get attachment to know storage path
  const { data: attachment } = await supabase
    .from("clinical_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete from storage
  await supabase.storage.from("clinical-files").remove([attachment.storage_path]);

  // Delete DB record
  const { error } = await supabase.from("clinical_attachments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: attachment } = await supabase
    .from("clinical_attachments")
    .select("storage_path, file_name, file_type")
    .eq("id", id)
    .single();

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate signed URL for download
  const { data: signedUrl } = await supabase.storage
    .from("clinical-files")
    .createSignedUrl(attachment.storage_path, 300); // 5 min expiry

  if (!signedUrl) return NextResponse.json({ error: "Error generating URL" }, { status: 500 });

  return NextResponse.json({ url: signedUrl.signedUrl, file_name: attachment.file_name });
}
