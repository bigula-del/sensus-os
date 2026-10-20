import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { shortDate } from "@/lib/format";
import { countryOf } from "@/lib/holidays";
import { duplicateItinerary } from "./actions";
import { NewItineraryForm } from "./new-form";

export const metadata: Metadata = { title: "Itineraries" };
export const maxDuration = 120;

type Row = { id: string; title: string; client_name: string | null; start_date: string | null; pax: number | null; destinations: string[]; status: string; cover_url: string | null; updated_at: string;
  itinerary_days: { count: number }[]; leads: { number: number | null } | null; projects: { code: string } | null };

export default async function ItinerariesPage({ searchParams }: { searchParams: Promise<{ add?: string; show?: string }> }) {
  const sp = await searchParams;
  const { sb } = await requireStaff();
  let q = sb.from("itineraries").select("id, title, client_name, start_date, pax, destinations, status, cover_url, updated_at, itinerary_days(count), leads(number), projects(code)").order("updated_at", { ascending: false }).limit(200);
  q = sp.show === "archived" ? q.eq("status", "Archived") : q.neq("status", "Archived");
  const [{ data, error }, { data: props }, { data: leads }, { data: projects }] = await Promise.all([
    q.returns<Row[]>(),
    sp.add ? sb.from("proposals").select("id, version, status, leads(number, title)").in("status", ["Draft", "Sent", "Approved"]).order("updated_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] as never[] }),
    sp.add ? sb.from("leads").select("id, number, title").not("stage", "in", "(Lost)").order("created_at", { ascending: false }).limit(150) : Promise.resolve({ data: [] as never[] }),
    sp.add ? sb.from("projects").select("id, code, title").neq("status", "Cancelled").order("start_date", { ascending: false }).limit(150) : Promise.resolve({ data: [] as never[] }),
  ]);
  const rows = data ?? [];

  return (
    <>
      <div className="head">
        <div><h1>Itineraries</h1><p className="sub">Day-by-day travel programmes with photos, maps and contacts, shared with travellers as a branded page and PDF.</p></div>
        {!sp.add && <Link className="btn primary" href="/itineraries?add=1">+ New itinerary</Link>}
      </div>
      {sp.add && (
        <NewItineraryForm aiOn={aiEnabled()}
          proposals={(props ?? []).map((p: { id: string; version: number; status: string; leads: unknown }) => { const l = p.leads as { number: number | null; title: string } | null; return { id: p.id, label: `${l?.number ? `#${l.number} · ` : ""}${l?.title ?? "Proposal"} (v${p.version}, ${p.status})` }; })}
          leads={(leads ?? []).map((l: { id: string; number: number | null; title: string }) => ({ id: l.id, label: `${l.number ? `#${l.number} · ` : ""}${l.title}` }))}
          projects={(projects ?? []).map((p: { id: string; code: string; title: string }) => ({ id: p.id, label: `#${p.code} · ${p.title}` }))} />
      )}
      {error && <p className="err" style={{ marginBottom: 16 }}>Itineraries are waiting for their database step. See the instructions from Claude.</p>}
      <div className="row" style={{ marginBottom: 12, gap: 6 }}>
        <Link className="seg" href="/itineraries" aria-pressed={sp.show !== "archived"}>Active</Link>
        <Link className="seg" href="/itineraries?show=archived" aria-pressed={sp.show === "archived"}>Archived</Link>
      </div>
      {rows.length ? (
        <div className="grid3">
          {rows.map((r) => (
            <article key={r.id} className="panel" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Link href={`/itineraries/${r.id}`} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ height: 130, background: r.cover_url ? `center/cover url("${r.cover_url}")` : "var(--yellow)", display: "flex", alignItems: "flex-end", padding: 10 }}>
                  <span className={`chip ${r.status === "Shared" ? "good" : r.status === "Draft" ? "warn" : ""}`} style={{ background: "var(--panel)" }}>{r.status}</span>
                </div>
                <div style={{ padding: "12px 14px 6px" }}>
                  <b style={{ display: "block" }}>{r.title}</b>
                  <span className="note">{[r.client_name, r.start_date && shortDate(r.start_date, { day: "numeric", month: "short", year: "numeric" }), `${r.itinerary_days?.[0]?.count ?? 0} days`, r.pax && `${r.pax} pax`].filter(Boolean).join(" · ")}</span>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {r.destinations.map((c) => <span key={c} className="chip">{countryOf(c)?.flag} {c}</span>)}
                    {r.leads?.number && <span className="chip">Lead #{r.leads.number}</span>}
                    {r.projects?.code && <span className="chip">Project #{r.projects.code}</span>}
                  </div>
                </div>
              </Link>
              <div className="row" style={{ gap: 4, padding: "6px 10px 10px", marginTop: "auto" }}>
                <Link className="btn sm" href={`/itineraries/${r.id}`}>Open</Link>
                <form action={duplicateItinerary}><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost" title="Use as a template">Duplicate</button></form>
              </div>
            </article>
          ))}
        </div>
      ) : !error && (
        <div className="panel empty"><h2>{sp.show === "archived" ? "No archived itineraries" : "No itineraries yet"}</h2><p>Draft one with AI, start from a proposal, or build it day by day.</p></div>
      )}
    </>
  );
}
