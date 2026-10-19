"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function setPassword(_prev: unknown, fd: FormData) {
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords are different." };
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login?error=link-expired");
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: "That password could not be saved. Try a different one." };
  redirect("/");
}
