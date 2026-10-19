import type { Metadata } from "next";
import { requireAdmin, initialsOf } from "@/lib/auth";
import { setRole } from "./actions";
import { headers } from "next/headers";
import { InviteForm, ResetPasswordButton } from "./invite-form";

export const metadata: Metadata = { title: "Team & access" };

const WHAT: Record<string, string> = {
  admin: "Everything, including People (HR) and team settings",
  sales: "Pipeline, proposals, projects, suppliers, calendar; adds expenses for review",
  operations: "Same as sales; focused on projects and operations",
  finance: "Same as sales, plus approving expenses",
};

export default async function TeamPage() {
  const { sb, user } = await requireAdmin();
  const { data: people } = await sb.from("profiles").select("id, full_name, role, active").neq("role", "client").order("created_at");
  const h = await headers();
  const siteUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  return (
    <>
      <div className="head"><div><div className="chips"><span className="chip bad">Admin only</span></div><h1 style={{ marginTop: 8 }}>Team & access</h1>
        <p className="sub">Who can sign in to Sensus OS, and what each person can see.</p></div></div>
      <div className="grid2">
        <section className="panel">
          <header><h3>Team</h3></header>
          {(people ?? []).map((p) => (
            <div key={p.id} className="alert" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <form action={setRole} style={{ display: "contents" }}>
              <input type="hidden" name="id" value={p.id} />
              <span className="avatar sm alt">{initialsOf(p.full_name)}</span>
              <div style={{ flex: 1, minWidth: 140 }}><b>{p.full_name}</b>{p.id === user.id && <span className="note"> (you)</span>}<div className="note">{WHAT[p.role]}</div></div>
              <select className="in" name="role" defaultValue={p.role} style={{ width: 130 }} disabled={p.id === user.id} aria-label={`Role for ${p.full_name}`}>
                <option value="admin">Admin</option><option value="sales">Sales</option><option value="operations">Operations</option><option value="finance">Finance</option>
              </select>
              <select className="in" name="active" defaultValue={String(p.active)} style={{ width: 120 }} disabled={p.id === user.id} aria-label={`Access for ${p.full_name}`}>
                <option value="true">Active</option><option value="false">Blocked</option>
              </select>
              {p.id !== user.id && <button className="btn sm">Save</button>}
            </form>
            {p.id !== user.id && <ResetPasswordButton id={p.id} name={p.full_name} />}
            </div>
          ))}
        </section>
        <InviteForm siteUrl={siteUrl} />
      </div>
    </>
  );
}
