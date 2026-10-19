"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin, initialsOf, type Role } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { field } from "@/lib/format";

const ROLES: Role[] = ["admin", "sales", "operations", "finance"];

/** Readable temporary password: no look-alike characters (0/O, 1/l/I). */
function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}

/**
 * Creates the account directly with a temporary password that the admin passes on.
 * No email is needed, so this works before a custom email server is connected.
 */
export async function addMember(_prev: unknown, fd: FormData) {
  await requireAdmin();
  const email = field(fd, "email")?.toLowerCase();
  const name = field(fd, "name");
  const role = field(fd, "role") as Role | null;
  if (!email || !name || !role || !ROLES.includes(role)) return { error: "Add a name, an email and a role." };
  const password = tempPassword();
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) return { error: /already/i.test(error?.message ?? "") ? "This email already has an account." : "The account could not be created." };
  await admin.from("profiles").update({ full_name: name, role, initials: initialsOf(name) }).eq("id", data.user.id);
  revalidatePath("/settings/team");
  return { ok: { email, name, password } };
}

/** Gives someone a new temporary password (for a forgotten password). */
export async function resetMemberPassword(_prev: unknown, fd: FormData) {
  const { user } = await requireAdmin();
  const id = field(fd, "id");
  if (!id || id === user.id) return { error: "Choose a team member." };
  const password = tempPassword();
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
  if (error) return { error: "The password could not be reset." };
  return { password };
}

export async function setRole(fd: FormData) {
  const { sb, user } = await requireAdmin();
  const id = field(fd, "id");
  const role = field(fd, "role") as Role | null;
  const active = field(fd, "active") !== "false";
  if (!id || !role || !ROLES.includes(role)) return;
  if (id === user.id) return; // never lock yourself out
  await sb.from("profiles").update({ role, active }).eq("id", id);
  revalidatePath("/settings/team");
}
