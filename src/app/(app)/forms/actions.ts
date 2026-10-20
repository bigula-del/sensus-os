"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { cleanFields, TEMPLATES } from "@/lib/forms";

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

export async function createForm(fd: FormData) {
  const { sb } = await requireStaff();
  const t = TEMPLATES[String(fd.get("template") ?? "blank")] ?? TEMPLATES.blank;
  const project = fd.get("project_id");
  const { data } = await sb
    .from("forms")
    .insert({ name: t.name, project_id: isUuid(project) ? project : null, fields: t.fields.map((x) => ({ ...x, id: randomUUID().slice(0, 8) })) })
    .select("id")
    .single();
  revalidatePath("/forms");
  redirect(`/forms/${data?.id ?? ""}`);
}

export async function saveForm(id: string, d: { name: string; project_id: string | null; is_open: boolean; fields: unknown }) {
  const { sb } = await requireStaff();
  if (!isUuid(id)) return { error: "Unknown form." };
  const { error } = await sb
    .from("forms")
    .update({ name: String(d.name ?? "").slice(0, 200) || "Form", project_id: isUuid(d.project_id) ? d.project_id : null, is_open: !!d.is_open, fields: cleanFields(d.fields) })
    .eq("id", id);
  if (error) return { error: "The form could not be saved." };
  revalidatePath(`/forms/${id}`);
  revalidatePath("/forms");
  return { ok: "Saved" };
}

export async function deleteForm(fd: FormData) {
  const { sb } = await requireStaff();
  const id = fd.get("id");
  if (isUuid(id)) await sb.from("forms").delete().eq("id", id);
  revalidatePath("/forms");
  redirect("/forms");
}
