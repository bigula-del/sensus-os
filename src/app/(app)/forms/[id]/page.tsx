import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { cleanFields } from "@/lib/forms";
import { deleteForm } from "../actions";
import { FormBuilder } from "./builder";

export const metadata: Metadata = { title: "Form" };

export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await requireStaff();
  const { data: f } = await sb.from("forms").select("id, name, project_id, is_open, fields, public_token").eq("id", id).maybeSingle();
  if (!f) notFound();
  const [{ data: answers }, { data: projects }] = await Promise.all([
    sb.from("form_responses").select("id, answers, submitted_at").eq("form_id", id).order("submitted_at", { ascending: false }).limit(500),
    sb.from("projects").select("id, code, title").neq("status", "Cancelled").order("start_date", { ascending: false }),
  ]);
  const fields = cleanFields(f.fields);
  const h = await headers();
  const link = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}/f/${f.public_token}`;
  const cols = Array.from(new Set([...(fields.map((x) => x.label)), ...(answers ?? []).flatMap((a) => Object.keys(a.answers as Record<string, string>))]));

  return (
    <>
      <div className="head">
        <div><h1>{f.name}</h1><p className="sub">{answers?.length ?? 0} answers. Send the link by email or WhatsApp; people fill it in on their phone.</p></div>
        <div className="row"><Link className="btn" href="/forms">All forms</Link>
          <form action={deleteForm}><input type="hidden" name="id" value={f.id} /><button className="btn ghost">Delete form</button></form></div>
      </div>
      <FormBuilder id={f.id} link={link} projects={(projects ?? []).map((p) => ({ id: p.id, label: `#${p.code} · ${p.title}` }))}
        initial={{ name: f.name, project_id: f.project_id, is_open: f.is_open, fields }} />
      <section className="panel" style={{ marginTop: 16 }}>
        <header><h3>Answers</h3></header>
        {answers?.length ? (
          <div className="tablewrap">
            <table className="t" style={{ minWidth: Math.max(600, cols.length * 160) }}>
              <thead><tr><th>Received</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {answers.map((a) => {
                  const v = a.answers as Record<string, string>;
                  return <tr key={a.id}><td>{new Date(a.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>{cols.map((c) => <td key={c}>{v[c] ?? ""}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">No answers yet.</div>}
      </section>
    </>
  );
}
