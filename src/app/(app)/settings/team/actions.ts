"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin, initialsOf, type Role } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { field } from "@/lib/format";

const ROLES: Role[] = ["admin", "sales", "operations", "finance"];

export async function inviteUser(_prev: unknown, fd: FormData) {
  await requireAdmin();
  const email = field(fd, "email")?.toLowerCase();
  const name = field(fd, "name");
  const role = field(fd, "role") as Role | null;
  if (!email || !name || !role || !ROLES.includes(role)) return { error: "Add a name, an email and a role." };
  const origin = (await headers()).get("origin") ?? "";
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
    redirectTo: `${origin}/auth/confirm?next=/set-password`,
  });
  if (error || !data.user) return { error: error?.message.includes("already") ? "This email already has an account." : "The invitation could not be sent." };
  await admin.from("profiles").update({ full_name: name, role, initials: initialsOf(name) }).eq("id", data.user.id);
  revalidatePath("/settings/team");
  return { ok: `Invitation sent to ${email}.` };
}

export async function setRole(fd: FormData) {
  const { user } = await requireAdmin();
  const id = field(fd, "id");
  const role = field(fd, "role") as Role | null;
  const active = field(fd, "active") !== "false";
  if (!id || !role || !ROLES.includes(role)) return;
  if (id === user.id && (role !== "admin" || !active)) return; // never lock yourself out
  const { sb } = await requireAdmin();
  await sb.from("profiles").update({ role, active }).eq("id", id);
  revalidatePath("/settings/team");
}
