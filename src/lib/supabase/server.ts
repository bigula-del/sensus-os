import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/** Supabase client acting as the signed-in user. Row level security applies. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses row level security, so use it ONLY inside
 * server actions that have already checked the caller is an admin
 * (inviting users, changing roles). Never import this from client code.
 */
export function supabaseAdmin() {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!key || key.startsWith("sb_publishable") || key.startsWith("http")) {
    throw new Error("SETUP: In Vercel, SUPABASE_SERVICE_ROLE_KEY must hold the Supabase secret key (starts with sb_secret_).");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
