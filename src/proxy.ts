import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ["/login", "/auth", "/set-password", "/p/", "/f/"];

/** Plain-language check of the three settings, so a setup mistake shows which setting to fix. */
function setupProblem() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const problems: string[] = [];
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is missing.");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim()))
    problems.push(`NEXT_PUBLIC_SUPABASE_URL should look like https://abcd1234.supabase.co (it starts with "${url.slice(0, 12)}…").`);
  if (!anon) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  else if (anon.startsWith("sb_secret") || anon.startsWith("http")) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY holds the wrong value: it needs the publishable (anon) key.");
  if (!secret) problems.push("SUPABASE_SERVICE_ROLE_KEY is missing.");
  else if (secret.startsWith("sb_publishable") || secret.startsWith("http")) problems.push("SUPABASE_SERVICE_ROLE_KEY holds the wrong value: it needs the secret (service_role) key.");
  return problems;
}

function setupPage(lines: string[]) {
  const body = `Sensus OS setup needs a fix in Vercel (Project, then Settings, then Environment Variables):\n\n- ${lines.join("\n- ")}\n\nAfter fixing, redeploy the latest deployment.`;
  return new NextResponse(body, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function proxy(request: NextRequest) {
  const problems = setupProblem();
  if (problems.length) return setupPage(problems);
  try {
    return await guard(request);
  } catch (e) {
    return setupPage([`The database could not be reached: ${e instanceof Error ? e.message : String(e)}`]);
  }
}

/** Refreshes the Supabase session on every request and sends signed-out visitors to /login. */
async function guard(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list, headers) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon|apple-icon|manifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
