import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

type P = { id: string; code: string; title: string; status: string; start_date: string | null; end_date: string | null; pax: number | null; clients: { name: string } | null };
type F = { project_id: string; sell_eur: number; net_eur: number; actual_eur: number; received_eur: number };

export default async function ProjectsPage() {
  const { sb } = await requireStaff();
  const [{ data: projects }, { data: fin }] = await Promise.all([
    sb.from("projects").select("id, code, title, status, start_date, end_date, pax, clients(name)").order("start_date", { ascending: false, nullsFirst: true }).returns<P[]>(),
    sb.from("project_finance").select("*").returns<F[]>(),
  ]);
  const byId = new Map((fin ?? []).map((f) => [f.project_id, f]));
  const I = <span className="internal">Internal</span>;
  return (
    <>
      <div className="head"><div><h1>Projects</h1><p className="sub">Confirmed programmes. A project is created when the client approves a proposal.</p></div></div>
      {!projects?.length ? (
        <div className="panel empty"><h2>No projects yet</h2><p>Open a sent proposal and click &ldquo;Client approved: create project&rdquo;.</p><Link className="btn" href="/proposals">Proposals</Link></div>
      ) : (
        <div className="panel tablewrap">
          <table className="t" style={{ minWidth: 860 }}>
            <thead><tr><th>Project</th><th>Client</th><th>Dates</th><th>Status</th><th className="num">Client price</th><th className="num">Received</th><th className="num">Costs recorded{I}</th><th className="num">Planned margin{I}</th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const f = byId.get(p.id);
                const sell = Number(f?.sell_eur ?? 0), net = Number(f?.net_eur ?? 0);
                return (
                  <tr key={p.id}>
                    <td><Link href={`/projects/${p.id}`}><b>{p.title}</b></Link><div className="note">#{p.code}</div></td>
                    <td>{p.clients?.name}</td>
                    <td>{p.start_date ? `${shortDate(p.start_date)} – ${shortDate(p.end_date, { day: "numeric", month: "short", year: "numeric" })}` : "—"}</td>
                    <td><span className={`chip ${p.status === "Completed" ? "good" : p.status === "In operation" ? "warn" : p.status === "Cancelled" ? "bad" : "info"}`}>{p.status}</span></td>
                    <td className="num">{money(sell)}</td>
                    <td className="num">{money(f?.received_eur)}</td>
                    <td className="num netcell">{money(f?.actual_eur)}</td>
                    <td className="num netcell">{sell ? `${(((sell - net) / sell) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
