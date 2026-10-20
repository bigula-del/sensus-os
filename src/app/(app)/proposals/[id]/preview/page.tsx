import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ProposalDoc, type ClientProposal } from "@/components/proposal-doc";

export const metadata: Metadata = { title: "Client preview" };

/** Staff preview of exactly what the client will see. Built from client-facing fields only. */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await requireStaff();
  const { data: p } = await sb
    .from("proposals")
    .select("id, version, status, quote_currency, pax, single_supplement, valid_until, intro, leads(*, clients(name))")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: days }, { data: lines }] = await Promise.all([
    sb.from("proposal_days").select("day_number, title").eq("proposal_id", id).order("day_number"),
    sb.from("proposal_lines").select("day_number, sort, service, description, sell_total_quote").eq("proposal_id", id).order("sort"),
  ]);
  const lead = p.leads as unknown as { number?: number | null; title: string; dates_text: string | null; clients: { name: string } | null };
  const doc: ClientProposal = {
    ref: lead.number ?? null,
    title: lead.title,
    client: lead.clients?.name ?? null,
    dates: lead.dates_text,
    pax: p.pax,
    version: p.version,
    currency: p.quote_currency,
    valid_until: p.valid_until,
    single_supplement: p.single_supplement,
    intro: p.intro,
    total: (lines ?? []).reduce((a, l) => a + Number(l.sell_total_quote), 0),
    days: (days ?? []).map((d) => ({
      day: d.day_number,
      title: d.title,
      items: (lines ?? []).filter((l) => l.day_number === d.day_number).map((l) => ({ service: l.service, description: l.description })),
    })),
  };
  return (
    <>
      <div className="approvebar">
        <Link className="btn" href={`/proposals/${id}`}>← Back to editing</Link>
        <span className="note">What the client sees, as last saved. Net prices, margins and suppliers never appear here.</span>
      </div>
      <ProposalDoc p={doc} />
    </>
  );
}
