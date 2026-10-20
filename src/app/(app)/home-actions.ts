"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { field } from "@/lib/format";

/** Quick note from the home page: the first line becomes the title. */
export async function quickNote(_prev: unknown, fd: FormData): Promise<{ ok?: number; error?: string }> {
  const { sb, user } = await requireStaff();
  const text = (field(fd, "text") ?? "").slice(0, 50000);
  if (!text) return { error: "Write something first." };
  const [first, ...rest] = text.split("\n");
  const { error } = await sb.from("notes").insert({ owner_id: user.id, title: first!.slice(0, 200), body: rest.join("\n").trim() });
  if (error) return { error: "The note could not be saved." };
  revalidatePath("/");
  revalidatePath("/notes");
  return { ok: Date.now() };
}

/** Quick reminder from the home page, for me. */
export async function quickReminder(_prev: unknown, fd: FormData): Promise<{ ok?: number; error?: string }> {
  const { sb, user } = await requireStaff();
  const title = field(fd, "title");
  const date = field(fd, "date");
  const time = field(fd, "time");
  if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Add what to remember and the date." };
  const { error } = await sb.from("events").insert({
    title: title.slice(0, 200), starts_on: date, starts_at: time && /^\d{2}:\d{2}$/.test(time) ? time : null, kind: "reminder", owner_id: user.id,
  });
  if (error) return { error: "The reminder could not be saved." };
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: Date.now() };
}
