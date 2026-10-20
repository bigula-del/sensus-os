import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { connectWithCode, SITE_URL } from "@/lib/microsoft";

/** Microsoft sends the person back here after they approve access. */
export async function GET(request: NextRequest) {
  const { user } = await requireStaff();
  const q = request.nextUrl.searchParams;
  const back = (params: string) => {
    const res = NextResponse.redirect(`${SITE_URL}/inbox?${params}`);
    res.cookies.delete({ name: "ms_state", path: "/api/microsoft" });
    return res;
  };
  if (q.get("error")) return back(`error=${encodeURIComponent(q.get("error_description")?.split("\r")[0]?.slice(0, 200) || "Microsoft did not allow access.")}`);
  const state = request.cookies.get("ms_state")?.value;
  const code = q.get("code");
  if (!code || !state || state !== q.get("state")) return back("error=" + encodeURIComponent("The connection timed out. Please try again."));
  try {
    await connectWithCode(user.id, code);
    return back("connected=1");
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "Connection failed."));
  }
}
