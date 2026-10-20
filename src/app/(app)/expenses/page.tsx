import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { setExpenseStatus } from "./actions";
import { ExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Expenses" };

type Exp = { id: string; spent_on: string; supplier_name: string; description: string | null; amount: number; currency: string; amount_eur: number; category: string; status: string;
  receipt_path: string | null; read_by_ai: boolean; project_id: string | null; projects: { code: string; title: string } | null; profiles: { full_name: string } | null };
type Proj = { id: string; code: string; title: string; project_services: { id: string; service: string; sort: number }[] };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ f?: string; add?: string; project?: string }> }) {
  const { f = "All", add, project } = await searchParams;
  const { sb, profile } = await requireStaff();
  let q = sb.from("expenses")
    .select("id, spent_on, supplier_name, description, amount, currency, amount_eur, category, status, receipt_path, read_by_ai, project_id, projects(code, title), profiles!expenses_created_by_fkey(full_name)")
    .order("spent_on", { ascending: false }).limit(300);
  if (f === "To review") q = q.eq("status", "To review");
  else if (f === "Company") q = q.is("project_id", null);
  else if (f === "Projects") q = q.not("project_id", "is", null);
  const [{ data: exps }, { data: projs }] = await Promise.all([
    q.returns<Exp[]>(),
    sb.from("projects").select("id, code, title, project_services(id, service, sort)").in("status", ["Confirmed", "In operation", "Completed"]).order("start_date", { ascending: false }).returns<Proj[]>(),
  ]);
  const rows = exps ?? [];
  const approver = profile.role === "admin" || profile.role === "finance";
  const month = new Date().toISOString().slice(0, 7);
  const monthTotal = rows.filter((e) => e.spent_on.startsWith(month) && e.status !== "Rejected").reduce((a, e) => a + Number(e.amount_eur), 0);
  const projects = (projs ?? []).map((p) => ({ id: p.id, code: p.code, title: p.title, services: [...p.project_services].sort((a, b) => a.sort - b.sort).map((s) => ({ id: s.id, service: s.service })) }));

  return (
    <>
      <div className="head">
        <div><h1>Expenses</h1><p className="sub">Every cost, with its receipt. Linked to a project, it counts in that project&apos;s final margin.</p></div>
        {!add && <Link className="btn primary" href="/expenses?add=1">+ New expense</Link>}
      </div>
      {add && <ExpenseForm projects={projects} presetProject={project} aiEnabled={!!process.env.ANTHROPIC_API_KEY?.trim()} />}
      <div className="kpis">
        <div className="kpi"><div className="l">This month</div><div className="v">{money(monthTotal)}</div><div className="n">all expenses, in euros</div></div>
        <div className="kpi"><div className="l">To review</div><div className="v">{rows.filter((e) => e.status === "To review").length}</div><div className="n">{approver ? "waiting for your approval" : "waiting for approval"}</div></div>
        <div className="kpi"><div className="l">Linked to projects</div><div className="v">{rows.filter((e) => e.project_id).length}</div><div className="n">count in project margins</div></div>
        <div className="kpi"><div className="l">Company costs</div><div className="v">{money(rows.filter((e) => !e.project_id && e.status !== "Rejected").reduce((a, e) => a + Number(e.amount_eur), 0))}</div><div className="n">overheads, not in projects</div></div>
      </div>
      <div className="filters" role="group" aria-label="Filter expenses">
        {["All", "To review", "Projects", "Company"].map((x) => <Link key={x} className="seg" href={`/expenses?f=${encodeURIComponent(x)}`} aria-pressed={x === f}>{x}</Link>)}
      </div>
      {rows.length === 0 ? (
        <div className="panel empty"><h2>No expenses here</h2><p>Add the first one with a photo of the receipt.</p></div>
      ) : (
        <div className="panel tablewrap">
          <table className="t" style={{ minWidth: 900 }}>
            <thead><tr><th>Date</th><th>Supplier and description</th><th>Project</th><th>Category</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{shortDate(e.spent_on)}</td>
                  <td><b>{e.supplier_name}</b>{e.read_by_ai && <> <span className="chip y">Read by AI</span></>}
                    <div className="note">{e.description}{e.profiles ? ` · by ${e.profiles.full_name}` : ""}{e.receipt_path ? <> · <a href={`/expenses/receipt/${e.id}`} target="_blank" rel="noreferrer">receipt</a></> : " · no receipt"}</div></td>
                  <td>{e.projects ? <Link className="btn sm" href={`/projects/${e.project_id}`}>#{e.projects.code}</Link> : <span className="note">Company</span>}</td>
                  <td>{e.category}</td>
                  <td className="num"><b>{money(e.amount, e.currency, 2)}</b>{e.currency !== "EUR" && <div className="note">{money(e.amount_eur, "EUR", 2)}</div>}</td>
                  <td><span className={`chip ${e.status === "Approved" ? "good" : e.status === "Rejected" ? "bad" : "warn"}`}>{e.status}</span></td>
                  <td className="num">{approver && e.status === "To review" && (
                    <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <form action={setExpenseStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="Rejected" /><button className="btn sm ghost">Reject</button></form>
                      <form action={setExpenseStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="Approved" /><button className="btn sm primary">Approve</button></form>
                    </span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
