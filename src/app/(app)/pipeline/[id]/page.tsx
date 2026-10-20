import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ALL_STAGES, money, shortDate } from "@/lib/format";
import { moveLead } from "../actions";
import { createProposal } from "../../proposals/actions";

export const metadata: Metadata = { title: "Lead" };

type Lead = {
  id: string; title: string; kind: string; stage: string; destinations: string[]; dates_text: string | null; start_date: string | null; end_date: string | null;
  pax: number | null; market: string | null; source: string | null; estimated_value_eur: number | null; lost_reason: string | null; created_at: string;
  clients: { name: string; kind: string } | null; contacts: { full_name: string; email: string | null } | null; profiles: { full_name: string } | null;
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await requireStaff();
  const { data: l } = await sb
    .from("leads")
    .select("*, clients(name, kind), contacts(full_name, email), profiles!leads_owner_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle<Lead>();
  if (!l) notFound();
  const { data: proposals } = await sb.from("proposals").select("id, version, status, quote_currency, proposal_lines(sell_total_quote)").eq("lead_id", id).order("version", { ascending: false });

  return (
    <>
      <div className="head">
        <div>
          <div className="chips"><span className={`chip ${l.kind === "MICE" ? "mice" : ""}`}>{l.kind}</span><span className="chip">{l.stage}</span></div>
          <h1 style={{ marginTop: 8 }}>{l.title}</h1>
          <p className="sub">{l.clients?.name}{l.contacts ? ` · ${l.contacts.full_name}` : ""}</p>
        </div>
        <Link className="btn" href="/pipeline">← Pipeline</Link>
      </div>
      <div className="grid2">
        <section className="panel pad">
          <dl className="kv">
            <dt>Client</dt><dd>{l.clients?.name} <span className="note">({l.clients?.kind})</span></dd>
            <dt>Contact</dt><dd>{l.contacts ? <>{l.contacts.full_name}{l.contacts.email && <div className="note">{l.contacts.email}</div>}</> : "—"}</dd>
            <dt>Destinations</dt><dd>{l.destinations.length ? l.destinations.join(", ") : "—"}</dd>
            <dt>Dates</dt><dd>{l.dates_text || (l.start_date ? `${shortDate(l.start_date)} – ${shortDate(l.end_date)}` : "—")}</dd>
            <dt>Participants</dt><dd>{l.pax ?? "—"}</dd>
            <dt>Market</dt><dd>{l.market ?? "—"}</dd>
            <dt>Source</dt><dd>{l.source ?? "—"}</dd>
            <dt>Estimated value</dt><dd>{money(l.estimated_value_eur)}</dd>
            <dt>Owner</dt><dd>{l.profiles?.full_name ?? "—"}</dd>
            <dt>Created</dt><dd>{shortDate(l.created_at, { day: "numeric", month: "short", year: "numeric" })}</dd>
          </dl>
        </section>
        <section className="panel pad stack">
          <h3>Move this lead</h3>
          <form action={moveLead} className="stack">
            <input type="hidden" name="id" value={l.id} />
            <label className="f" htmlFor="stage">Stage
              <select className="in" id="stage" name="stage" defaultValue={l.stage}>{ALL_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
            </label>
            <label className="f" htmlFor="lost_reason">If lost, why?<input className="in" id="lost_reason" name="lost_reason" defaultValue={l.lost_reason ?? ""} placeholder="Price, dates, chose another DMC…" /></label>
            <div><button className="btn primary">Save stage</button></div>
          </form>
        </section>
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <header><h3>Proposals</h3>
            <form action={createProposal}><input type="hidden" name="lead_id" value={l.id} />
              <button className="btn primary sm">{proposals?.length ? "+ New proposal" : "Start proposal"}</button></form></header>
          {proposals?.length ? proposals.map((p) => (
            <div className="alert" key={p.id} style={{ alignItems: "center" }}>
              <div style={{ flex: 1 }}><Link href={`/proposals/${p.id}`}><b>Version {p.version}</b></Link>
                <div className="note">{money((p.proposal_lines as { sell_total_quote: number }[]).reduce((a, x) => a + Number(x.sell_total_quote), 0), p.quote_currency)} to the client</div></div>
              <span className={`chip ${p.status === "Sent" ? "info" : p.status === "Approved" ? "good" : p.status === "Draft" ? "warn" : ""}`}>{p.status}</span>
              <Link className="btn sm" href={`/proposals/${p.id}`}>Open</Link>
            </div>
          )) : <div className="empty">No proposal yet. Start one to build the programme and price it.</div>}
        </section>
      </div>
    </>
  );
}
