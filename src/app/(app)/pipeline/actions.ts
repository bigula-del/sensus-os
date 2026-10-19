"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ALL_STAGES, field, type Stage } from "@/lib/format";

export async function createLead(_prev: unknown, fd: FormData) {
  const { sb, user } = await requireStaff();
  const title = field(fd, "title");
  const clientName = field(fd, "client");
  if (!title || !clientName) return { error: "Add at least the client and a title." };

  // reuse the client if it already exists (same name, any case)
  let { data: client } = await sb.from("clients").select("id").ilike("name", clientName).maybeSingle();
  if (!client) {
    const ins = await sb
      .from("clients")
      .insert({ name: clientName, kind: field(fd, "client_kind") ?? "corporate", country: field(fd, "market"), market: field(fd, "market"), created_by: user.id })
      .select("id")
      .single();
    if (ins.error) return { error: "The client could not be saved." };
    client = ins.data;
  }

  let contactId: string | null = null;
  const contactName = field(fd, "contact");
  if (contactName) {
    const c = await sb.from("contacts").insert({ client_id: client.id, full_name: contactName, email: field(fd, "contact_email") }).select("id").single();
    contactId = c.data?.id ?? null;
  }

  const pax = Number(field(fd, "pax") ?? "") || null;
  const value = Number(field(fd, "value") ?? "") || null;
  const destinations = (field(fd, "destinations") ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const { data, error } = await sb
    .from("leads")
    .insert({
      title,
      client_id: client.id,
      contact_id: contactId,
      kind: field(fd, "kind") === "Leisure" ? "Leisure" : "MICE",
      destinations,
      dates_text: field(fd, "dates"),
      start_date: field(fd, "start_date"),
      end_date: field(fd, "end_date"),
      pax,
      market: field(fd, "market"),
      source: field(fd, "source"),
      estimated_value_eur: value,
      owner_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: "The lead could not be saved." };
  revalidatePath("/pipeline");
  redirect(`/pipeline/${data.id}`);
}

export async function moveLead(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "id");
  const stage = field(fd, "stage") as Stage | null;
  if (!id || !stage || !ALL_STAGES.includes(stage)) return;
  await sb.from("leads").update({ stage, lost_reason: stage === "Lost" ? field(fd, "lost_reason") : null }).eq("id", id);
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
}
