import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";

/** Opens a receipt through a private link that expires after 5 minutes. Staff only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me?.profile || me.profile.role === "client") return NextResponse.redirect(new URL("/login", request.url));
  const { data: e } = await me.sb.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (!e?.receipt_path) return new NextResponse("No receipt for this expense.", { status: 404 });
  const { data } = await me.sb.storage.from("receipts").createSignedUrl(e.receipt_path, 300);
  if (!data?.signedUrl) return new NextResponse("The receipt could not be opened.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
