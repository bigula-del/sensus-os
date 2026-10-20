import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Proposals" };

type Row = {
  id: string; version: number; status: string; quote_currency: string; pax: number; updated_at: string;
  leads: { id: string; title: string; clients: { name: string } | null } | null;
  proposal_lines: { sell_total_quote: number }[];
};

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "Open" } = await searchParams;
  const { sb } = await requireStaff();
  let q = sb
    .from("proposals")
    .select("id, version, status, quote_currency, pax, updated_at, leads(id, title, clients(name)), proposal_lines(sell_total_quote)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status === "Open") q = q.in("status", ["Draft", "Sent"]);
  else if (status !== "All") q = q.eq("status", status);
  const { data } = await q.returns<Row[]>();
  const rows = data ?? [];
  return (
    <>
      <div className="head">
        <div><h1>Proposals</h1><p className="sub">Start a proposal from a lead in the pipeline. Every version is kept.</p></div>
        <Link className="btn primary" href="/pipeline">Choose a lead</Link>
      </div>
      <div className="filters" role="group" aria-label="Filter by status">
        {["Open", "Draft", "Sent", "Approved", "Superseded", "All"].map((s) => (
          <Link key={s} className="seg" href={`/proposals?status=${s}`} aria-pressed={s === status}>{s}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="panel empty"><h2>No proposals here yet</h2><p>Open a lead in the pipeline and click Start proposal.</p></div>
      ) : (
        <div className="panel tablewrap">
          <table className="t" style={{ minWidth: 720 }}>
            <thead><tr><th>Programme</th><th>Client</th><th>Version</th><th>Status</th><th className="num">Total to client</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/proposals/${r.id}`}><b>{r.leads?.title}</b></Link></td>
                  <td>{r.leads?.clients?.name}</td>
                  <td>v{r.version}</td>
                  <td><span className={`chip ${r.status === "Sent" ? "info" : r.status === "Approved" ? "good" : r.status === "Draft" ? "warn" : ""}`}>{r.status}</span></td>
                  <td className="num">{money(r.proposal_lines.reduce((a, l) => a + Number(l.sell_total_quote), 0), r.quote_currency)}</td>
                  <td>{shortDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
