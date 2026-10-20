import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import type { Basis, Fx, LineInput } from "@/lib/proposals";
import { Builder } from "./builder";

export const metadata: Metadata = { title: "Proposal" };

type LineRow = {
  id: string; day_number: number; sort: number; service: string; description: string | null; basis: Basis; units: number;
  proposal_line_costs: { supplier_id: string | null; supplier_text: string | null; net_unit: number; net_currency: string; margin_pct: number; is_estimate: boolean } | null;
};

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id } = await params;
  const { sent } = await searchParams;
  const { sb } = await requireStaff();
  const { data: p } = await sb
    .from("proposals")
    .select("id, version, status, quote_currency, pax, foc_places, single_supplement, valid_until, fx, intro, share_token, lead_id, leads(id, title, kind, dates_text, clients(name), contacts(full_name))")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: days }, { data: lines }, { data: suppliers }, { data: versions }] = await Promise.all([
    sb.from("proposal_days").select("day_number, title").eq("proposal_id", id).order("day_number"),
    sb.from("proposal_lines").select("id, day_number, sort, service, description, basis, units, proposal_line_costs(*)").eq("proposal_id", id).order("day_number").order("sort").returns<LineRow[]>(),
    sb.from("suppliers").select("id, name, city").order("name"),
    sb.from("proposals").select("id, version, status").eq("lead_id", p.lead_id).order("version"),
  ]);
  const lead = p.leads as unknown as { id: string; title: string; kind: string; dates_text: string | null; clients: { name: string } | null; contacts: { full_name: string } | null };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;

  const initLines: LineInput[] = (lines ?? []).map((l) => ({
    id: l.id, day_number: l.day_number, sort: l.sort, service: l.service, description: l.description ?? "", basis: l.basis, units: Number(l.units),
    supplier_id: l.proposal_line_costs?.supplier_id ?? null, supplier_text: l.proposal_line_costs?.supplier_text ?? "",
    net_unit: Number(l.proposal_line_costs?.net_unit ?? 0), net_currency: l.proposal_line_costs?.net_currency ?? "EUR",
    margin_pct: Number(l.proposal_line_costs?.margin_pct ?? 18), is_estimate: !!l.proposal_line_costs?.is_estimate,
  }));

  return (
    <>
      <div className="head">
        <div>
          <div className="chips">
            <span className={`chip ${lead.kind === "MICE" ? "mice" : ""}`}>{lead.kind}</span>
            <span className="chip">Version {p.version}</span>
            <span className={`chip ${p.status === "Sent" ? "info" : p.status === "Approved" ? "good" : p.status === "Draft" ? "warn" : ""}`}>{p.status}</span>
          </div>
          <h1 style={{ marginTop: 8 }}>{lead.title}</h1>
          <p className="sub">{lead.clients?.name}{lead.dates_text ? ` · ${lead.dates_text}` : ""}{lead.contacts ? ` · contact ${lead.contacts.full_name}` : ""}</p>
        </div>
        <div className="row">
          <Link className="btn" href={`/pipeline/${lead.id}`}>Lead</Link>
          <Link className="btn" href={`/proposals/${id}/preview`}>Preview client proposal</Link>
        </div>
      </div>
      {(versions?.length ?? 0) > 1 && (
        <div className="tabs" role="tablist">
          {versions!.map((v) => (
            <Link key={v.id} role="tab" aria-selected={v.id === id} href={`/proposals/${v.id}`} style={{ padding: "9px 12px", fontWeight: 600, textDecoration: "none", borderBottom: v.id === id ? "2px solid var(--ink)" : "2px solid transparent", color: v.id === id ? "var(--ink)" : "var(--muted)" }}>
              v{v.version} · {v.status}
            </Link>
          ))}
        </div>
      )}
      {sent && p.status === "Sent" && (
        <div className="okmsg" style={{ marginBottom: 14 }}>
          Sent. Share this link with the client: <b style={{ userSelect: "all" }}>{`${origin}/p/${p.share_token}`}</b>
        </div>
      )}
      <Builder
        id={id}
        status={p.status}
        shareUrl={p.status === "Sent" || p.status === "Approved" ? `${origin}/p/${p.share_token}` : null}
        initial={{
          pax: p.pax, foc_places: p.foc_places, quote_currency: p.quote_currency, single_supplement: p.single_supplement,
          valid_until: p.valid_until, intro: p.intro ?? "", fx: p.fx as Fx,
          days: (days ?? []).map((d) => ({ day_number: d.day_number, title: d.title })),
          lines: initLines,
        }}
        suppliers={suppliers ?? []}
      />
    </>
  );
}
