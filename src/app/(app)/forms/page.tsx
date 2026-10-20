import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { TEMPLATES } from "@/lib/forms";
import { createForm } from "./actions";

export const metadata: Metadata = { title: "Forms" };

type F = { id: string; name: string; is_open: boolean; updated_at: string; projects: { code: string; title: string } | null; form_responses: { count: number }[] };

export default async function FormsPage() {
  const { sb } = await requireStaff();
  const [{ data }, { data: projects }] = await Promise.all([
    sb.from("forms").select("id, name, is_open, updated_at, projects(code, title), form_responses(count)").order("updated_at", { ascending: false }).returns<F[]>(),
    sb.from("projects").select("id, code, title").in("status", ["Confirmed", "In operation"]).order("start_date"),
  ]);
  return (
    <>
      <div className="head"><div><h1>Forms</h1><p className="sub">Sensus-branded forms for clients and participants. Send the link; answers arrive here.</p></div></div>
      <form action={createForm} className="panel pad row" style={{ marginBottom: 16 }}>
        <label className="f" style={{ flex: "1 1 220px" }}>Start from
          <select className="in" name="template" defaultValue="registration">
            {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{k === "blank" ? "Blank form" : t.name}</option>)}
          </select></label>
        <label className="f" style={{ flex: "1 1 240px" }}>For project (optional)
          <select className="in" name="project_id"><option value="">None</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>#{p.code} · {p.title}</option>)}</select></label>
        <button className="btn primary" style={{ alignSelf: "flex-end" }}>+ Create form</button>
      </form>
      {!data?.length ? (
        <div className="panel empty"><h2>No forms yet</h2><p>Start from a template above: registration, dietary needs, feedback or a leisure brief.</p></div>
      ) : (
        <div className="panel tablewrap">
          <table className="t" style={{ minWidth: 620 }}>
            <thead><tr><th>Form</th><th>Project</th><th className="num">Answers</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/forms/${x.id}`}><b>{x.name}</b></Link></td>
                  <td>{x.projects ? `#${x.projects.code} · ${x.projects.title}` : <span className="note">—</span>}</td>
                  <td className="num">{x.form_responses?.[0]?.count ?? 0}</td>
                  <td><span className={`chip ${x.is_open ? "good" : ""}`}>{x.is_open ? "Open" : "Closed"}</span></td>
                  <td>{shortDate(x.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
