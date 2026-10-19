"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { field } from "@/lib/format";

export async function signIn(_prev: unknown, fd: FormData) {
  const email = field(fd, "email");
  const password = field(fd, "password");
  if (!email || !password) return { error: "Enter your email and password." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is not right. Try again, or reset your password." };
  const next = field(fd, "next");
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function sendReset(_prev: unknown, fd: FormData) {
  const email = field(fd, "email");
  if (!email) return { error: "Enter your email first." };
  const origin = (await headers()).get("origin") ?? "";
  const sb = await supabaseServer();
  await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/set-password` });
  // Same answer whether or not the address exists, so the page cannot be used to find accounts.
  return { ok: "If this email has an account, a link to set a new password is on its way." };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
