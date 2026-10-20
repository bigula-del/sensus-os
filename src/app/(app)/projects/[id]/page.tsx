import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { PROJECT_STATUSES, projectFinance, type ServiceRow } from "@/lib/projects";
import { setProjectStatus } from "../actions";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Project" };

type Svc = { id: string; service: string; sell_eur: number; sort: number; project_service_costs: { net_eur: number; suppliers: { name: string } | null } | null };
type Exp = { id: string; spent_on: string; supplier_name: string; description: string | null; amount: number; currency: string; amount_eur: number; category: string; service_id: string | null; status: string; receipt_path: string | null };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await requireStaff();
  const { data: p } = await sb.from("projects").select("*, clients(name), leads(id, number), proposals(id, version)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: svcs }, { data: exps }, { data: pays }] = await Promise.all([
    sb.from("project_services").select("id, service, sell_eur, sort, project_service_costs(net_eur, suppliers(name))").eq("project_id", id).order("sort").returns<Svc[]>(),
    sb.from("expenses").select("id, spent_on, supplier_name, description, amount, currency, amount_eur, category, service_id, status, receipt_path").eq("project_id", id).order("spent_on", { ascending: false }).returns<Exp[]>(),
    sb.from("client_payments").select("id, received_on, amount_eur, reference").eq("project_id", id).order("received_on"),
  ]);
  const services: ServiceRow[] = (svcs ?? []).map((s) => ({ id: s.id, service: s.service, sell_eur: Number(s.sell_eur), net_eur: Number(s.project_service_costs?.net_eur ?? 0), supplier: s.project_service_costs?.suppliers?.name ?? null }));
  const expenses = exps ?? [];
  const received = (pays ?? []).reduce((a, x) => a + Number(x.amount_eur), 0);
  const done = p.status === "Completed";
  const f = projectFinance(services, expenses, done, received);
  const extras = expenses.filter((e) => !e.service_id && e.status !== "Rejected");
  const I = <span className="internal">Internal</span>;
  const client = p.clients as { name: string } | null;
  const prop = p.proposals as { id: string; version: number } | null;

  return (
    <>
      <div className="head">
        <div>
          <div className="chips"><span className="chip mice">{p.kind}</span><span className="chip">#{p.code}</span>
            <span className={`chip ${done ? "good" : p.status === "In operation" ? "warn" : p.status === "Cancelled" ? "bad" : "info"}`}>{p.status}</span></div>
          <h1 style={{ marginTop: 8 }}>{p.title}</h1>
          <p className="sub">{client?.name}{p.start_date ? ` · ${shortDate(p.start_date)} – ${shortDate(p.end_date, { day: "numeric", month: "short", year: "numeric" })}` : ""}{p.pax ? ` · ${p.pax} pax` : ""}</p>
        </div>
        <div className="row">
          {prop && <Link className="btn" href={`/proposals/${prop.id}`}>Proposal v{prop.version}</Link>}
          <Link className="btn primary" href={`/expenses?add=1&project=${p.id}`}>+ Add expense</Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="l">Client price</div><div className="v">{money(f.sell)}</div><div className="n">{money(received)} received</div>
          <div className="bar"><i style={{ width: `${f.sell ? Math.min(100, (received / f.sell) * 100) : 0}%` }} /></div></div>
        <div className="kpi"><div className="l">Planned margin{I}</div><div className="v">{money(f.planned)}</div><div className="n">{f.plannedPct.toFixed(1)}% at net prices</div></div>
        <div className="kpi"><div className="l">Costs recorded{I}</div><div className="v">{money(f.actual)}</div><div className="n">{expenses.length} expenses linked</div>
          <div className="bar"><i className={f.actual > f.net ? "over" : ""} style={{ width: `${f.net ? Math.min(100, (f.actual / f.net) * 100) : 0}%` }} /></div></div>
        <div className="kpi"><div className="l">{done ? "Final margin" : "Projected margin"}{I}</div><div className={`v ${f.variance < -0.5 ? "bad" : "good"}`}>{money(f.margin)}</div>
          <div className="n">{f.marginPct.toFixed(1)}% · {f.variance < -0.5 ? `${money(-f.variance)} below plan` : "on plan"}</div></div>
      </div>

      <section className="panel tablewrap">
        <table className="t" style={{ minWidth: 860 }}>
          <thead><tr><th>Service</th><th>Supplier{I}</th><th className="num">Net planned{I}</th><th className="num">Actual cost{I}</th><th className="num">Client price</th><th className="num">Margin{I}</th></tr></thead>
          <tbody>
            {services.map((s) => {
              const a = f.actualBy.get(s.id) ?? 0;
              const cost = done ? a : Math.max(s.net_eur, a);
              return (
                <tr key={s.id}>
                  <td><b>{s.service}</b></td>
                  <td className="netcell">{s.supplier ?? <span className="note">—</span>}</td>
                  <td className="num netcell">{money(s.net_eur)}</td>
                  <td className="num netcell">{a ? money(a) : <span className="note">not yet</span>} {a > s.net_eur + 0.5 && <span className="chip bad">+{money(a - s.net_eur)}</span>}</td>
                  <td className="num">{money(s.sell_eur)}</td>
                  <td className="num netcell"><b>{money(s.sell_eur - cost)}</b></td>
                </tr>
              );
            })}
            {extras.map((e) => (
              <tr key={e.id}>
                <td>{e.description || e.supplier_name} <span className="chip warn">Extra, not in proposal</span></td>
                <td className="netcell">{e.supplier_name}</td><td className="num netcell">–</td><td className="num netcell">{money(e.amount_eur)}</td><td className="num">–</td>
                <td className="num netcell"><b>{money(-e.amount_eur)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>Total</td><td className="num">{money(f.net)}</td><td className="num">{money(f.actual)}</td><td className="num">{money(f.sell)}</td><td className="num">{money(f.margin)}</td></tr></tfoot>
        </table>
      </section>
      <p className="note">{done ? "Final margin = client price minus every expense linked to this project." : "Projected margin counts each service at the higher of its planned net and what was actually spent, plus extras. It becomes final when the project is marked Completed."}</p>

      <div className="grid2" style={{ marginTop: 16 }}>
        <section className="panel">
          <header><h3>Expenses{I}</h3><Link className="btn sm" href={`/expenses?add=1&project=${p.id}`}>+ Add</Link></header>
          {expenses.length ? expenses.map((e) => (
            <div className="alert" key={e.id} style={{ alignItems: "center" }}>
              <div style={{ flex: 1 }}><b>{e.supplier_name}</b> <span className="note">· {shortDate(e.spent_on)} · {e.category}</span><div className="note">{e.description}</div></div>
              <div style={{ textAlign: "right" }}><b>{money(e.amount, e.currency, 2)}</b>{e.currency !== "EUR" && <div className="note">{money(e.amount_eur, "EUR", 2)}</div>}</div>
              <span className={`chip ${e.status === "Approved" ? "good" : e.status === "Rejected" ? "bad" : "warn"}`}>{e.status}</span>
            </div>
          )) : <div className="empty">No expenses linked yet.</div>}
        </section>
        <section className="panel">
          <header><h3>Payments received</h3></header>
          {(pays ?? []).map((x) => (
            <div className="alert" key={x.id}><div style={{ flex: 1 }}><b>{money(x.amount_eur, "EUR", 2)}</b><div className="note">{shortDate(x.received_on, { day: "numeric", month: "short", year: "numeric" })}{x.reference ? ` · ${x.reference}` : ""}</div></div></div>
          ))}
          <PaymentForm projectId={p.id} balance={Math.max(0, f.sell - received)} />
        </section>
      </div>

      <section className="panel pad" style={{ marginTop: 16 }}>
        <form action={setProjectStatus} className="row">
          <input type="hidden" name="id" value={p.id} />
          <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>Project status
            <select className="in" name="status" defaultValue={p.status} style={{ width: 170 }}>{PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <button className="btn">Save status</button>
          <span className="note">Mark it Completed when every invoice is in: the margin then becomes final.</span>
        </form>
      </section>
    </>
  );
}
