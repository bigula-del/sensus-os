import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { authUrl, msConfigured, SITE_URL } from "@/lib/microsoft";

/** Starts the "Connect Outlook" flow: sends the person to Microsoft to approve access to their own mailbox. */
export async function GET() {
  const { user } = await requireStaff();
  if (!msConfigured()) return NextResponse.redirect(`${SITE_URL}/inbox?error=setup`);
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state, user.email ?? undefined));
  res.cookies.set("ms_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/microsoft", maxAge: 600 });
  return res;
}
