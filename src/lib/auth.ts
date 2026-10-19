import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type Role = "admin" | "sales" | "operations" | "finance" | "client";
export type Profile = { id: string; full_name: string; role: Role; initials: string | null };

/** The signed-in user and their profile, or null when signed out. */
export async function getMe() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb
    .from("profiles")
    .select("id, full_name, role, initials")
    .eq("id", user.id)
    .single<Profile>();
  return { sb, user, profile };
}

/** Sensus staff only. Clients and signed-out visitors are sent away. Call in every staff page and action. */
export async function requireStaff() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.profile || me.profile.role === "client") redirect("/login?error=no-access");
  return { ...me, profile: me.profile };
}

/** Admin only (Matheus). Everyone else gets a 404, so the page's existence is not revealed. */
export async function requireAdmin() {
  const me = await requireStaff();
  if (me.profile.role !== "admin") notFound();
  return me;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
