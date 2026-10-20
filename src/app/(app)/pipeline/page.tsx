import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { money, STAGES } from "@/lib/format";

export const metadata: Metadata = { title: "Pipeline" };

type LeadRow = {
  number?: number | null; id: string; title: string; kind: string; stage: string; destinations: string[]; dates_text: string | null;
  pax: number | null; market: string | null; estimated_value_eur: number | null; clients: { name: string } | null;
};

export default async function PipelinePage() {
  const { sb } = await requireStaff();
  const { data } = await sb
    .from("leads")
    .select("*, clients(name)")
    .neq("stage", "Lost")
    .order("created_at", { ascending: false })
    .returns<LeadRow[]>();
  const leads = data ?? [];
  const val = (l: LeadRow) => Number(l.estimated_value_eur ?? 0);
  const open = leads.filter((l) => l.stage !== "Won");

  return (
    <>
      <div className="head">
        <div><h1>Pipeline</h1><p className="sub">Every request from first contact to confirmed programme.</p></div>
        <Link className="btn primary" href="/pipeline/new">+ New lead</Link>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">Open pipeline</div><div className="v">{money(open.reduce((a, l) => a + val(l), 0))}</div><div className="n">{open.length} leads</div></div>
        <div className="kpi"><div className="l">Won</div><div className="v">{money(leads.filter((l) => l.stage === "Won").reduce((a, l) => a + val(l), 0))}</div><div className="n">{leads.filter((l) => l.stage === "Won").length} programmes</div></div>
        <div className="kpi"><div className="l">Awaiting client</div><div className="v">{open.filter((l) => l.stage === "Proposal sent" || l.stage === "Negotiation").length}</div><div className="n">proposals sent or in negotiation</div></div>
        <div className="kpi"><div className="l">New this stage</div><div className="v">{open.filter((l) => l.stage === "New").length}</div><div className="n">waiting for a first reply</div></div>
      </div>
      {leads.length === 0 ? (
        <div className="panel empty">
          <h2>No leads yet</h2>
          <p>Add your first request to start the pipeline.</p>
          <Link className="btn primary" href="/pipeline/new">+ New lead</Link>
        </div>
      ) : (
        <div className="boardwrap">
          <div className="board">
            {STAGES.map((st) => {
              const ls = leads.filter((l) => l.stage === st);
              return (
                <section className="col" key={st} aria-label={st}>
                  <div className="colhead"><h3>{st} · {ls.length}</h3><span>{money(ls.reduce((a, l) => a + val(l), 0))}</span></div>
                  {ls.map((l) => (
                    <Link className="card" key={l.id} href={`/pipeline/${l.id}`}>
                      <div className="chips">
                        <span className={`chip ${l.kind === "MICE" ? "mice" : ""}`}>{l.kind}</span>
                        {l.destinations.map((c) => <span key={c} className="cc">{c}</span>)}
                      </div>
                      <div>{l.number && <div className="note" style={{ fontWeight: 600 }}>#{l.number}</div>}<div className="t1">{l.title}</div><div className="c">{l.clients?.name}{l.market ? ` · from ${l.market}` : ""}</div></div>
                      <div className="meta"><span className="c">{[l.dates_text, l.pax ? `${l.pax} pax` : null].filter(Boolean).join(" · ")}</span><b>{money(val(l))}</b></div>
                    </Link>
                  ))}
                  {!ls.length && <div className="note" style={{ padding: "8px 4px" }}>No leads at this stage</div>}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
