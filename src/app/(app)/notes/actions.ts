"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

export async function createNote(fd: FormData) {
  const { sb, user } = await requireStaff();
  const project = fd.get("project_id");
  const { data } = await sb
    .from("notes")
    .insert({ owner_id: user.id, title: "", body: "", project_id: isUuid(project) ? project : null })
    .select("id")
    .single();
  revalidatePath("/notes");
  redirect(`/notes?n=${data?.id ?? ""}`);
}

export async function saveNote(id: string, patch: { title?: string; body?: string; project_id?: string | null; shared?: boolean }) {
  const { sb, user } = await requireStaff();
  if (!isUuid(id)) return { error: "Unknown note." };
  const upd: Record<string, unknown> = {};
  if (typeof patch.title === "string") upd.title = patch.title.slice(0, 200);
  if (typeof patch.body === "string") upd.body = patch.body.slice(0, 50000);
  if (patch.project_id !== undefined) upd.project_id = isUuid(patch.project_id) ? patch.project_id : null;
  if (typeof patch.shared === "boolean") upd.shared = patch.shared;
  const { error } = await sb.from("notes").update(upd).eq("id", id).eq("owner_id", user.id);
  if (error) return { error: "Not saved." };
  if (patch.project_id !== undefined || patch.shared !== undefined) revalidatePath("/notes");
  return { ok: true };
}

export async function deleteNote(fd: FormData) {
  const { sb, user } = await requireStaff();
  const id = fd.get("id");
  if (isUuid(id)) await sb.from("notes").delete().eq("id", id).eq("owner_id", user.id);
  revalidatePath("/notes");
  redirect("/notes");
}
