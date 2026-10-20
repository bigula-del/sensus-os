"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { field } from "@/lib/format";
import { brandedHtml, connectedEmail, disconnect, graph, sendMail, MsNotConnected, type MailItem } from "@/lib/microsoft";

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const isMsgId = (s: unknown): s is string => typeof s === "string" && s.length > 10 && s.length < 400 && /^[A-Za-z0-9_\-=+/]+$/.test(s);
const emails = (s: string | null) =>
  (s ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 30);
const back = (params: Record<string, string>) => `/inbox?${new URLSearchParams(params).toString()}`;
const fail = (e: unknown) => (e instanceof MsNotConnected ? e.message : e instanceof Error ? e.message.slice(0, 200) : "Something went wrong with Outlook.");
const addr = (r?: { emailAddress: { name?: string; address: string } }) => (r ? (r.emailAddress.name && r.emailAddress.name !== r.emailAddress.address ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress.address) : "");

export async function disconnectOutlook() {
  const { user } = await requireStaff();
  await disconnect(user.id);
  redirect("/inbox");
}

/** New email, or a reply when reply_to holds a message ID (the reply stays in the same Outlook conversation). */
export async function sendEmail(fd: FormData) {
  const { user, profile } = await requireStaff();
  const replyTo = field(fd, "reply_to");
  const body = field(fd, "body") ?? "";
  const folder = field(fd, "folder") ?? "inbox";
  try {
    if (replyTo && isMsgId(replyTo)) {
      if (!body) redirect(back({ m: replyTo, folder, error: "Write your reply first." }));
      const all = fd.get("all") === "1";
      const html = body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>");
      await graph(user.id, `/me/messages/${encodeURIComponent(replyTo)}/${all ? "replyAll" : "reply"}`, { method: "POST", body: JSON.stringify({ comment: html }) });
      redirect(back({ m: replyTo, folder, sent: "1" }));
    }
    const to = emails(field(fd, "to"));
    const cc = emails(field(fd, "cc"));
    const subject = field(fd, "subject")?.slice(0, 300) ?? "";
    if (!to.length || !subject || !body) redirect(back({ compose: "1", error: "Add a recipient, a subject and a message." }));
    await sendMail(user.id, to, subject, brandedHtml(body.split(/\n{2,}/), profile.full_name), cc);
  } catch (e) {
    unstable_rethrow(e);
    redirect(back({ ...(replyTo ? { m: replyTo, folder } : { compose: "1" }), error: fail(e) }));
  }
  redirect(back({ folder: "sentitems", sent: "1" }));
}

async function fetchMessage(profileId: string, id: string) {
  return graph<MailItem>(profileId, `/me/messages/${encodeURIComponent(id)}?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview`, { textBody: true });
}

/** Keeps a copy of the email on a lead or project, so the whole team can read it there. */
export async function linkEmail(fd: FormData) {
  const { sb, user } = await requireStaff();
  const id = field(fd, "message_id");
  const folder = field(fd, "folder") ?? "inbox";
  const target = field(fd, "target") ?? "";
  const [kind, targetId] = target.split(":");
  if (!isMsgId(id) || !isUuid(targetId) || !["lead", "project"].includes(kind)) redirect(back({ ...(isMsgId(id) ? { m: id } : {}), folder, error: "Choose a lead or project." }));
  let m: MailItem;
  try {
    m = await fetchMessage(user.id, id);
  } catch (e) {
    redirect(back({ m: id, folder, error: fail(e) }));
  }
  const mailbox = await connectedEmail(user.id);
  const row = {
    message_id: id, subject: m.subject?.slice(0, 500) ?? "(no subject)", sender: addr(m.from).slice(0, 300),
    recipients: [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map(addr).join(", ").slice(0, 2000),
    received_at: m.receivedDateTime, mailbox, body_text: (m.body?.content ?? m.bodyPreview ?? "").slice(0, 40000), linked_by: user.id,
    lead_id: kind === "lead" ? targetId : null, project_id: kind === "project" ? targetId : null,
  };
  const { error } = await sb.from("email_links").upsert(row, { onConflict: "message_id" });
  if (error) redirect(back({ m: id, folder, error: "The link could not be saved. Has the Microsoft database step been run?" }));
  revalidatePath(kind === "lead" ? `/pipeline/${targetId}` : `/projects/${targetId}`);
  redirect(back({ m: id, folder, linked: "1" }));
}

export async function unlinkEmail(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "message_id");
  const from = field(fd, "from");
  if (id) await sb.from("email_links").delete().eq("message_id", id);
  const safe = from && /^\/(pipeline|projects|inbox)[\w/?=&%-]*$/.test(from) ? from : "/inbox";
  revalidatePath(safe.split("?")[0]);
  redirect(safe);
}

type LeadGuess = { title?: string; client?: string; client_kind?: "corporate" | "agency" | "private"; contact?: string; contact_email?: string; kind?: "MICE" | "Leisure"; pax?: number | null; destinations?: string[]; dates?: string; start_date?: string | null; end_date?: string | null; market?: string | null };

async function guessLead(m: MailItem): Promise<LeadGuess> {
  const fromName = m.from?.emailAddress.name ?? "";
  const fromAddr = m.from?.emailAddress.address ?? "";
  const domain = fromAddr.split("@")[1] ?? "";
  const generic = /^(gmail|hotmail|outlook|live|yahoo|icloud|me|uol|bol|terra|sapo|msn)\./i.test(domain);
  const company = generic || !domain ? fromName || fromAddr : domain.split(".")[0]!.replace(/^\w/, (c) => c.toUpperCase());
  const plain: LeadGuess = { title: m.subject ?? "New enquiry", client: company, client_kind: generic ? "private" : "corporate", contact: fromName || fromAddr, contact_email: fromAddr };
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return plain;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `You help Sensus Travel DMC (Lisbon; MICE and leisure across Portugal, Spain, France, Italy, Cape Verde, Brazil, Argentina, Chile, Colombia, Mexico) turn a client enquiry email into a sales lead.
Reply with JSON only: {"title": short lead title like "Pharma incentive Lisbon, 120 pax", "client": company or agency name (or person name if private), "client_kind": "corporate"|"agency"|"private", "contact": person's name, "contact_email": email, "kind": "MICE"|"Leisure", "pax": number or null, "destinations": ISO country codes array, "dates": dates as written or "", "start_date": "YYYY-MM-DD" or null, "end_date": "YYYY-MM-DD" or null, "market": client's country or null}.
Today is ${new Date().toISOString().slice(0, 10)}.

From: ${addr(m.from)}
Subject: ${m.subject ?? ""}

${(m.body?.content ?? m.bodyPreview ?? "").slice(0, 12000)}`,
        }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return plain;
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const g = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as LeadGuess;
    return { ...plain, ...Object.fromEntries(Object.entries(g).filter(([, v]) => v !== null && v !== "" && v !== undefined)) };
  } catch {
    return plain;
  }
}

/** Creates a lead (with client and contact) from an email, links the email to it and opens the lead. */
export async function leadFromEmail(fd: FormData) {
  const { sb, user } = await requireStaff();
  const id = field(fd, "message_id");
  const folder = field(fd, "folder") ?? "inbox";
  if (!isMsgId(id)) redirect("/inbox");
  let m: MailItem;
  try {
    m = await fetchMessage(user.id, id);
  } catch (e) {
    redirect(back({ m: id, folder, error: fail(e) }));
  }
  const g = await guessLead(m);
  const clientName = (g.client ?? "New client").slice(0, 200);
  let { data: client } = await sb.from("clients").select("id").ilike("name", clientName).limit(1).maybeSingle();
  if (!client) {
    const ins = await sb.from("clients").insert({ name: clientName, kind: ["corporate", "agency", "private"].includes(g.client_kind ?? "") ? g.client_kind : "corporate", country: g.market ?? null, market: g.market ?? null, created_by: user.id }).select("id").single();
    if (ins.error) redirect(back({ m: id, folder, error: "The client could not be saved." }));
    client = ins.data;
  }
  let contactId: string | null = null;
  const cEmail = g.contact_email?.toLowerCase().slice(0, 200) || null;
  if (cEmail) {
    const { data: existing } = await sb.from("contacts").select("id").eq("client_id", client.id).ilike("email", cEmail).limit(1).maybeSingle();
    contactId = existing?.id ?? null;
  }
  if (!contactId && (g.contact || cEmail)) {
    const c = await sb.from("contacts").insert({ client_id: client.id, full_name: (g.contact || cEmail || "Contact").slice(0, 200), email: cEmail }).select("id").single();
    contactId = c.data?.id ?? null;
  }
  const isoDate = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const { data: lead, error } = await sb.from("leads").insert({
    title: (g.title ?? m.subject ?? "New enquiry").slice(0, 200), client_id: client.id, contact_id: contactId,
    kind: g.kind === "Leisure" ? "Leisure" : "MICE",
    destinations: (g.destinations ?? []).filter((d) => /^[A-Za-z]{2}$/.test(d)).map((d) => d.toUpperCase()).slice(0, 10),
    dates_text: g.dates?.slice(0, 200) || null, start_date: isoDate(g.start_date), end_date: isoDate(g.end_date),
    pax: Number.isFinite(Number(g.pax)) && Number(g.pax) > 0 ? Math.round(Number(g.pax)) : null,
    market: g.market?.slice(0, 100) ?? null, source: "Email", owner_id: user.id,
  }).select("id").single();
  if (error || !lead) redirect(back({ m: id, folder, error: "The lead could not be saved." }));
  await sb.from("email_links").upsert({
    message_id: id, subject: m.subject?.slice(0, 500) ?? "(no subject)", sender: addr(m.from).slice(0, 300),
    recipients: [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map(addr).join(", ").slice(0, 2000),
    received_at: m.receivedDateTime, mailbox: await connectedEmail(user.id), body_text: (m.body?.content ?? m.bodyPreview ?? "").slice(0, 40000),
    linked_by: user.id, lead_id: lead.id,
  }, { onConflict: "message_id" });
  revalidatePath("/pipeline");
  redirect(`/pipeline/${lead.id}`);
}

/** Sends a client link (proposal or signature) by email from the person's own Outlook. Used on proposal and signature pages. */
export async function emailClientLink(input: { to: string; subject: string; message: string; href: string; label: string }): Promise<{ error?: string; ok?: boolean }> {
  const { user, profile } = await requireStaff();
  const to = emails(input.to);
  if (!to.length) return { error: "Add the client's email." };
  if (!/^https:\/\/[\w.-]+\/(p|sign|f|i)\/[0-9a-f-]{36}$/i.test(input.href)) return { error: "Invalid link." };
  try {
    await sendMail(user.id, to, (input.subject || "Sensus Travel DMC").slice(0, 300), brandedHtml(input.message.trim().split(/\n{2,}/).filter(Boolean), profile.full_name, { href: input.href, label: input.label.slice(0, 60) }));
    return { ok: true };
  } catch (e) {
    return { error: fail(e) };
  }
}
