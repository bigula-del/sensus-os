"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { ecbRates } from "@/lib/fx";
import { CURRENCIES } from "@/lib/proposals";
import { EXPENSE_CATEGORIES } from "@/lib/projects";

export type ExpenseDraft = {
  spent_on: string;
  supplier_name: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  project_id: string;
  service_id: string;
  receipt_path: string;
  read_by_ai: boolean;
};

const isUuid = (s: string | null | undefined) => !!s && /^[0-9a-f-]{36}$/i.test(s);

export async function createExpense(d: ExpenseDraft): Promise<{ error?: string; ok?: string }> {
  const { sb, user, profile } = await requireStaff();
  const amount = Number(d.amount);
  if (!d.supplier_name?.trim() || !Number.isFinite(amount) || amount <= 0) return { error: "Add at least the supplier and the amount." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d.spent_on) ? d.spent_on : new Date().toISOString().slice(0, 10);
  const currency = (CURRENCIES as readonly string[]).includes(d.currency) ? d.currency : "EUR";
  const fx = currency === "EUR" ? { EUR: 1 } : await ecbRates(date);
  const amountEur = Math.round((amount / (fx[currency] || 1)) * 100) / 100;
  const approver = profile.role === "admin" || profile.role === "finance";
  const { error } = await sb.from("expenses").insert({
    spent_on: date,
    supplier_name: d.supplier_name.trim().slice(0, 200),
    description: d.description?.trim().slice(0, 500) || null,
    amount,
    currency,
    amount_eur: amountEur,
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(d.category) ? d.category : "Other",
    project_id: isUuid(d.project_id) ? d.project_id : null,
    service_id: isUuid(d.project_id) && isUuid(d.service_id) ? d.service_id : null,
    receipt_path: d.receipt_path && d.receipt_path.startsWith("receipts/") ? d.receipt_path.slice("receipts/".length) : d.receipt_path || null,
    read_by_ai: !!d.read_by_ai,
    status: approver ? "Approved" : "To review",
    created_by: user.id,
    approved_by: approver ? user.id : null,
  });
  if (error) return { error: "The expense could not be saved." };
  revalidatePath("/expenses");
  if (isUuid(d.project_id)) revalidatePath(`/projects/${d.project_id}`);
  return { ok: approver ? "Expense saved." : "Expense saved and sent for approval." };
}

export async function setExpenseStatus(fd: FormData) {
  const { sb, user, profile } = await requireStaff();
  if (profile.role !== "admin" && profile.role !== "finance") return;
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!isUuid(id) || !["Approved", "Rejected", "To review"].includes(status)) return;
  await sb.from("expenses").update({ status, approved_by: status === "Approved" ? user.id : null }).eq("id", id);
  revalidatePath("/expenses");
}

/** Short-lived private link to a receipt (5 minutes). */
export async function receiptLink(path: string): Promise<string | null> {
  const { sb } = await requireStaff();
  const { data } = await sb.storage.from("receipts").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export type ReceiptReading = {
  supplier_name?: string; spent_on?: string; amount?: number; currency?: string; description?: string; category?: string;
  project_id?: string; service_id?: string; why?: string;
};

/**
 * Reads a receipt that was already uploaded to private storage, using Claude.
 * Needs ANTHROPIC_API_KEY in Vercel; without it, staff fill the form by hand.
 */
export async function readReceipt(path: string): Promise<{ error?: string; data?: ReceiptReading }> {
  const { sb } = await requireStaff();
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { error: "AI reading is not switched on yet. Fill in the details below." };
  const { data: file, error } = await sb.storage.from("receipts").download(path);
  if (error || !file) return { error: "The receipt could not be opened." };
  const type = file.type || (path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(type)) return { error: "AI can read photos (JPG, PNG) and PDFs. Fill in the details below." };
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const today = new Date().toISOString().slice(0, 10);
  const { data: projects } = await sb
    .from("projects")
    .select("id, code, title, start_date, end_date, clients(name), project_services(id, service, project_service_costs(suppliers(name)))")
    .in("status", ["Confirmed", "In operation", "Completed"])
    .order("start_date", { ascending: false })
    .limit(30);
  type PRow = { id: string; code: string; title: string; start_date: string | null; end_date: string | null; clients: { name: string } | null;
    project_services: { id: string; service: string; project_service_costs: { suppliers: { name: string } | null } | null }[] };
  const list = ((projects ?? []) as unknown as PRow[])
    .map((p) => `${p.id} = #${p.code} ${p.title} (${p.clients?.name ?? ""}, ${p.start_date ?? "?"} to ${p.end_date ?? "?"}); services: ${p.project_services
      .map((s) => `${s.id} ${s.service}${s.project_service_costs?.suppliers ? ` [${s.project_service_costs.suppliers.name}]` : ""}`)
      .join("; ")}`)
    .join("\n");

  const prompt = `You read receipts and supplier invoices for Sensus Travel DMC, a destination management company. Today is ${today}.
Reply with ONLY a JSON object, no other text:
{"supplier_name": string, "spent_on": "YYYY-MM-DD", "amount": number (the total paid, tax included), "currency": ISO 4217 code, "description": short English description, "category": one of ${JSON.stringify(EXPENSE_CATEGORIES)}, "project_id": an id from the list or "", "service_id": a service id of that project or "", "why": one short sentence explaining the project match or why none}
Match a project only when the supplier, service or dates clearly fit (expenses usually fall on or shortly before the project dates). Use "" when unsure; general company costs (software, office, marketing) have no project.
Projects:
${list || "(none)"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            type === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
              : { type: "image", source: { type: "base64", media_type: type, data: b64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { error: res.status === 401 ? "The AI key in Vercel is not valid." : "AI could not read this receipt. Fill in the details below." };
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: "AI could not read this receipt. Fill in the details below." };
    const r = JSON.parse(m[0]) as ReceiptReading;
    return { data: r };
  } catch {
    return { error: "AI could not read this receipt. Fill in the details below." };
  }
}
