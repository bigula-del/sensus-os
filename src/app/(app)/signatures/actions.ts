"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

export type NewRequest = {
  name: string; signer_name: string; signer_email: string; message: string;
  source: "pdf" | "proposal"; file_path: string; proposal_id: string; project_id: string; lead_id: string;
};

export async function createRequest(d: NewRequest): Promise<{ error?: string; id?: string }> {
  const { sb, user } = await requireStaff();
  const name = d.name?.trim().slice(0, 200);
  const signer = d.signer_name?.trim().slice(0, 200);
  const email = d.signer_email?.trim().toLowerCase().slice(0, 200);
  if (!name || !signer || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Add the document name, the signer's name and a valid email." };

  let hash: string | null = null;
  let file: string | null = null;
  let proposal: string | null = null;
  let lead: string | null = isUuid(d.lead_id) ? d.lead_id : null;
  if (d.source === "pdf") {
    if (!d.file_path || d.file_path.includes("..")) return { error: "Upload the PDF first." };
    const { data: blob, error } = await sb.storage.from("documents").download(d.file_path);
    if (error || !blob) return { error: "The PDF could not be read. Upload it again." };
    hash = createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex");
    file = d.file_path;
  } else {
    if (!isUuid(d.proposal_id)) return { error: "Choose the proposal to be signed." };
    const { data: p } = await sb.from("proposals").select("id, share_token, status, lead_id").eq("id", d.proposal_id).maybeSingle();
    if (!p || !["Sent", "Approved"].includes(p.status)) return { error: "Only a proposal that was sent to the client can be signed." };
    const { data: content } = await sb.rpc("client_proposal", { p_token: p.share_token });
    hash = createHash("sha256").update(JSON.stringify(content ?? {})).digest("hex");
    proposal = p.id;
    lead = lead ?? p.lead_id;
  }

  const { data, error } = await sb
    .from("signature_requests")
    .insert({
      name, signer_name: signer, signer_email: email, message: d.message?.trim().slice(0, 1000) || null,
      file_path: file, proposal_id: proposal, document_sha256: hash, status: "Draft",
      project_id: isUuid(d.project_id) ? d.project_id : null, lead_id: lead, created_by: user.id,
      audit: [{ at: new Date().toISOString(), event: "created", by: user.id, fingerprint: hash }],
    })
    .select("id")
    .single();
  if (error || !data) return { error: "The request could not be saved." };
  revalidatePath("/signatures");
  return { id: data.id };
}

/** Marks the request as sent. Until email is connected, the signer link is copied and sent by email or WhatsApp. */
export async function markSent(fd: FormData) {
  const { sb, user } = await requireStaff();
  const id = fd.get("id");
  if (!isUuid(id)) return;
  const { data: r } = await sb.from("signature_requests").select("status, audit").eq("id", id).maybeSingle();
  if (r?.status === "Draft") {
    await sb.from("signature_requests").update({
      status: "Sent", sent_at: new Date().toISOString(),
      audit: [...((r.audit as unknown[]) ?? []), { at: new Date().toISOString(), event: "sent", by: user.id }],
    }).eq("id", id);
  }
  revalidatePath("/signatures");
  redirect(`/signatures?r=${id}`);
}

export async function deleteRequest(fd: FormData) {
  const { sb } = await requireStaff();
  const id = fd.get("id");
  if (isUuid(id)) await sb.from("signature_requests").delete().eq("id", id).eq("status", "Draft");
  revalidatePath("/signatures");
  redirect("/signatures");
}
