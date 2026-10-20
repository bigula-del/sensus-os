"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

export async function sendMessage(channelId: string, body: string) {
  const { sb, user } = await requireStaff();
  const text = body.trim().slice(0, 4000);
  if (!isUuid(channelId) || !text) return { error: "Empty message." };
  const { error } = await sb.from("chat_messages").insert({ channel_id: channelId, author_id: user.id, body: text });
  if (error) return { error: "Not sent. Try again." };
  revalidatePath("/chat");
  return { ok: true };
}

export async function createChannel(fd: FormData) {
  const { sb } = await requireStaff();
  const name = String(fd.get("name") ?? "").trim().toLowerCase().replace(/[^a-z0-9à-ü-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const project = fd.get("project_id");
  if (!name) redirect("/chat");
  const { data } = await sb.from("chat_channels").insert({ name, project_id: isUuid(project) ? project : null }).select("id").single();
  revalidatePath("/chat");
  redirect(`/chat?c=${data?.id ?? ""}`);
}

/** Opens (or creates) the private conversation between me and a colleague. */
export async function openDirect(fd: FormData) {
  const { sb, user } = await requireStaff();
  const other = fd.get("user_id");
  if (!isUuid(other) || other === user.id) redirect("/chat");
  const { data: existing } = await sb.from("chat_channels").select("id, member_ids").eq("is_direct", true).contains("member_ids", [user.id, other]);
  const found = (existing ?? []).find((c) => (c.member_ids as string[]).length === 2);
  if (found) redirect(`/chat?c=${found.id}`);
  const { data } = await sb.from("chat_channels").insert({ name: "direct", is_direct: true, member_ids: [user.id, other] }).select("id").single();
  revalidatePath("/chat");
  redirect(`/chat?c=${data?.id ?? ""}`);
}

/** Creates the #general channel the first time anyone opens the chat. */
export async function ensureGeneral() {
  const { sb } = await requireStaff();
  const { data } = await sb.from("chat_channels").select("id").eq("is_direct", false).limit(1);
  if (!data?.length) await sb.from("chat_channels").insert({ name: "general" });
}
