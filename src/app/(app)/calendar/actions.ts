"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { field } from "@/lib/format";

const isUuid = (s: string | null) => !!s && /^[0-9a-f-]{36}$/i.test(s);

function refresh(projectId?: string | null, leadId?: string | null) {
  revalidatePath("/calendar");
  revalidatePath("/");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (leadId) revalidatePath(`/pipeline/${leadId}`);
}

export async function createEvent(_prev: unknown, fd: FormData) {
  const { sb, user } = await requireStaff();
  const title = field(fd, "title");
  const date = field(fd, "date");
  const kind = field(fd, "kind");
  if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Add a title and a date." };
  const time = field(fd, "time");
  const project = field(fd, "project_id");
  const lead = field(fd, "lead_id");
  const { error } = await sb.from("events").insert({
    title: title.slice(0, 200),
    starts_on: date,
    starts_at: time && /^\d{2}:\d{2}/.test(time) ? time : null,
    kind: kind === "meeting" || kind === "project" ? kind : "reminder",
    project_id: isUuid(project) ? project : null,
    lead_id: isUuid(lead) ? lead : null,
    owner_id: isUuid(field(fd, "owner_id")) ? field(fd, "owner_id") : user.id,
  });
  if (error) return { error: "The event could not be saved." };
  refresh(project, lead);
  const back = field(fd, "back");
  redirect(back && back.startsWith("/") ? back : `/calendar?m=${date.slice(0, 7)}`);
}

export async function setDone(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "id");
  if (!isUuid(id)) return;
  const { data } = await sb.from("events").update({ done: field(fd, "done") !== "false" }).eq("id", id).select("project_id, lead_id").maybeSingle();
  refresh(data?.project_id, data?.lead_id);
}

export async function deleteEvent(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "id");
  if (!isUuid(id)) return;
  const { data } = await sb.from("events").delete().eq("id", id).select("project_id, lead_id, starts_on").maybeSingle();
  refresh(data?.project_id, data?.lead_id);
  redirect(`/calendar?m=${(data?.starts_on ?? new Date().toISOString()).slice(0, 7)}`);
}
