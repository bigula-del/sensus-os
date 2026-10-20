"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { CURRENCIES, DEFAULT_FX, lineSellQuote, round2, type Basis, type Fx, type LineInput } from "@/lib/proposals";

/** Today's rates (1 EUR = x) from the European Central Bank, with fallbacks for currencies it does not publish. */
async function liveFx(): Promise<Fx> {
  const fx: Fx = { ...DEFAULT_FX };
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD,BRL,GBP,MXN", { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as { rates?: Record<string, number> };
      for (const [k, v] of Object.entries(j.rates ?? {})) if (v > 0) fx[k] = round2(v * 10000) / 10000;
    }
  } catch {
    // keep fallbacks; rates stay editable in the builder
  }
  return fx;
}

export async function createProposal(fd: FormData) {
  const { sb, user } = await requireStaff();
  const leadId = String(fd.get("lead_id") ?? "");
  const { data: lead } = await sb.from("leads").select("id, pax, stage").eq("id", leadId).maybeSingle();
  if (!lead) redirect("/pipeline");
  const { data: last } = await sb.from("proposals").select("version").eq("lead_id", leadId).order("version", { ascending: false }).limit(1).maybeSingle();
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data: p, error } = await sb
    .from("proposals")
    .insert({ lead_id: leadId, version: (last?.version ?? 0) + 1, pax: lead.pax || 10, fx: await liveFx(), valid_until: valid, created_by: user.id })
    .select("id")
    .single();
  if (error || !p) redirect(`/pipeline/${leadId}?error=proposal`);
  await sb.from("proposal_days").insert({ proposal_id: p.id, day_number: 1, title: "Arrival" });
  if (lead.stage === "New") await sb.from("leads").update({ stage: "Qualifying" }).eq("id", leadId);
  revalidatePath(`/pipeline/${leadId}`);
  redirect(`/proposals/${p.id}`);
}

export type SavePayload = {
  pax: number;
  foc_places: number;
  quote_currency: string;
  single_supplement: number | null;
  valid_until: string | null;
  intro: string;
  fx: Fx;
  days: { day_number: number; title: string }[];
  lines: LineInput[];
};

const num = (v: unknown, min = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, n) : min;
};

export async function saveProposal(id: string, payload: SavePayload): Promise<{ ok?: string; error?: string }> {
  const { sb } = await requireStaff();
  const { data: p } = await sb.from("proposals").select("id, status, lead_id").eq("id", id).maybeSingle();
  if (!p) return { error: "This proposal no longer exists." };
  if (p.status !== "Draft") return { error: "This version was already sent. Create a new version to make changes." };

  // sanitise everything that came from the browser
  const fx: Fx = { EUR: 1 };
  for (const c of CURRENCIES) if (c !== "EUR") fx[c] = num(payload.fx?.[c], 0) || DEFAULT_FX[c];
  const quote = (CURRENCIES as readonly string[]).includes(payload.quote_currency) ? payload.quote_currency : "EUR";
  const settings = { pax: Math.max(1, Math.round(num(payload.pax, 1))), foc_places: Math.round(num(payload.foc_places)), quote_currency: quote, fx };
  const days = (payload.days ?? []).slice(0, 60).map((d, i) => ({ day_number: i + 1, title: String(d.title ?? "").slice(0, 200) }));
  const dayMap = new Map((payload.days ?? []).map((d, i) => [d.day_number, i + 1]));
  const lines: LineInput[] = (payload.lines ?? []).slice(0, 500).map((l, i) => ({
    id: /^[0-9a-f-]{36}$/i.test(l.id) ? l.id : randomUUID(),
    day_number: dayMap.get(l.day_number) ?? 1,
    sort: i,
    service: String(l.service ?? "").slice(0, 300) || "Service",
    description: String(l.description ?? "").slice(0, 2000),
    basis: (["pax", "group", "room"].includes(l.basis) ? l.basis : "pax") as Basis,
    units: num(l.units),
    supplier_id: l.supplier_id && /^[0-9a-f-]{36}$/i.test(l.supplier_id) ? l.supplier_id : null,
    supplier_text: String(l.supplier_text ?? "").slice(0, 200),
    net_unit: num(l.net_unit),
    net_currency: fx[l.net_currency] ? l.net_currency : "EUR",
    margin_pct: num(l.margin_pct, -100),
    is_estimate: !!l.is_estimate,
  }));

  const upd = await sb
    .from("proposals")
    .update({
      pax: settings.pax,
      foc_places: settings.foc_places,
      quote_currency: quote,
      fx,
      single_supplement: payload.single_supplement == null || payload.single_supplement === ("" as unknown) ? null : num(payload.single_supplement),
      valid_until: payload.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(payload.valid_until) ? payload.valid_until : null,
      intro: String(payload.intro ?? "").slice(0, 4000) || null,
    })
    .eq("id", id);
  if (upd.error) return { error: "The proposal could not be saved." };

  // days: replace (small and safe)
  await sb.from("proposal_days").delete().eq("proposal_id", id);
  if (days.length) await sb.from("proposal_days").insert(days.map((d) => ({ ...d, proposal_id: id })));

  // lines: write the new set first, then remove lines that are no longer there
  if (lines.length) {
    const a = await sb.from("proposal_lines").upsert(
      lines.map((l) => ({
        id: l.id, proposal_id: id, day_number: l.day_number, sort: l.sort, service: l.service, description: l.description || null,
        basis: l.basis, units: l.units, sell_total_quote: round2(lineSellQuote(l, settings)),
      })),
    );
    if (a.error) return { error: "The services could not be saved." };
    const b = await sb.from("proposal_line_costs").upsert(
      lines.map((l) => ({
        line_id: l.id, supplier_id: l.supplier_id, supplier_text: l.supplier_text || null, net_unit: l.net_unit,
        net_currency: l.net_currency, margin_pct: l.margin_pct, is_estimate: l.is_estimate,
      })),
    );
    if (b.error) return { error: "The internal prices could not be saved." };
  }
  const keep = lines.map((l) => l.id);
  let del = sb.from("proposal_lines").delete().eq("proposal_id", id);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  await del;

  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return { ok: "Saved" };
}

export async function sendProposal(fd: FormData) {
  const { sb } = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const { data: p } = await sb.from("proposals").select("id, lead_id, status").eq("id", id).maybeSingle();
  if (!p) redirect("/proposals");
  if (p.status === "Draft") {
    await sb.from("proposals").update({ status: "Superseded" }).eq("lead_id", p.lead_id).eq("status", "Sent");
    await sb.from("proposals").update({ status: "Sent" }).eq("id", id);
    await sb.from("leads").update({ stage: "Proposal sent" }).eq("id", p.lead_id).in("stage", ["New", "Qualifying"]);
  }
  revalidatePath(`/proposals/${id}`);
  redirect(`/proposals/${id}?sent=1`);
}

/** Copies a proposal (days, services, internal prices) into a new Draft version. */
export async function newVersion(fd: FormData) {
  const { sb, user } = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const { data: p } = await sb.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!p) redirect("/proposals");
  const { data: last } = await sb.from("proposals").select("version").eq("lead_id", p.lead_id).order("version", { ascending: false }).limit(1).single();
  const { data: np, error } = await sb
    .from("proposals")
    .insert({
      lead_id: p.lead_id, version: (last?.version ?? p.version) + 1, quote_currency: p.quote_currency, pax: p.pax, foc_places: p.foc_places,
      single_supplement: p.single_supplement, valid_until: p.valid_until, fx: p.fx, intro: p.intro, created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !np) redirect(`/proposals/${id}`);
  const [{ data: days }, { data: lines }] = await Promise.all([
    sb.from("proposal_days").select("day_number, title").eq("proposal_id", id),
    sb.from("proposal_lines").select("*, proposal_line_costs(*)").eq("proposal_id", id),
  ]);
  if (days?.length) await sb.from("proposal_days").insert(days.map((d) => ({ ...d, proposal_id: np.id })));
  type Row = { day_number: number; sort: number; service: string; description: string | null; basis: string; units: number; sell_total_quote: number;
    proposal_line_costs: { supplier_id: string | null; supplier_text: string | null; net_unit: number; net_currency: string; margin_pct: number; is_estimate: boolean } | null };
  const rows = (lines ?? []) as Row[];
  if (rows.length) {
    const copies = rows.map((l) => ({ id: randomUUID(), l }));
    await sb.from("proposal_lines").insert(copies.map(({ id: nid, l }) => ({
      id: nid, proposal_id: np.id, day_number: l.day_number, sort: l.sort, service: l.service, description: l.description, basis: l.basis, units: l.units, sell_total_quote: l.sell_total_quote,
    })));
    await sb.from("proposal_line_costs").insert(copies.filter((c) => c.l.proposal_line_costs).map(({ id: nid, l }) => ({ line_id: nid, ...l.proposal_line_costs! })));
  }
  revalidatePath("/proposals");
  redirect(`/proposals/${np.id}`);
}
