import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { connectedEmail } from "@/lib/microsoft";
import { EmailLinkForm } from "@/components/email-link";
import { shortDate } from "@/lib/format";
import { deleteRequest, markSent } from "./actions";
import { NewRequestForm } from "./new-request";

export const metadata: Metadata = { title: "E-signature" };

type R = { id: string; name: string; signer_name: string; signer_email: string; status: string; token: string; sent_at: string | null; signed_at: string | null;
  created_at: string; signed_name: string | null; signature_png: string | null; document_sha256: string | null; message: string | null; file_path: string | null;
  audit: { at: string; event: string; ip?: string; browser?: string; name?: string; reason?: string }[]; projects: { code: string } | null; proposal_id: string | null };

const STEPS = ["Draft", "Sent", "Viewed", "Signed"];
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });

export default async function SignaturesPage({ searchParams }: { searchParams: Promise<{ add?: string; r?: string }> }) {
  const sp = await searchParams;
  const { sb, user } = await requireStaff();
  const [{ data }, { data: props }, { data: projects }] = await Promise.all([
    sb.from("signature_requests").select("*, projects(code)").order("created_at", { ascending: false }).limit(200).returns<R[]>(),
    sb.from("proposals").select("id, version, status, leads(number, title)").in("status", ["Sent", "Approved"]).order("updated_at", { ascending: false }).limit(100),
    sb.from("projects").select("id, code, title").neq("status", "Cancelled").order("start_date", { ascending: false }),
  ]);
  const rows = data ?? [];
  const sel = rows.find((r) => r.id === sp.r);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const mailbox = sel && ["Sent", "Viewed"].includes(sel.status) ? await connectedEmail(user.id) : null;

  return (
    <>
      <div className="head">
        <div><h1>E-signature</h1><p className="sub">Send proposals and contracts for signature, and follow every step.</p></div>
        {!sp.add && <Link className="btn primary" href="/signatures?add=1">+ New request</Link>}
      </div>
      {sp.add && (
        <NewRequestForm
          proposals={(props ?? []).map((p) => { const l = p.leads as unknown as { number: number | null; title: string } | null; return { id: p.id, label: `${l?.number ? `#${l.number} · ` : ""}${l?.title ?? "Proposal"} (v${p.version})` }; })}
          projects={(projects ?? []).map((p) => ({ id: p.id, label: `#${p.code} · ${p.title}` }))} />
      )}

      {sel && (
        <section className="panel pad stack" style={{ marginBottom: 16 }}>
          <div className="spread"><h2>{sel.name}</h2><Link className="btn ghost sm" href="/signatures">Close</Link></div>
          <div className="steps">{STEPS.map((s, i) => <span key={s} className={i <= STEPS.indexOf(sel.status) ? "done" : ""}>{s}</span>)}{sel.status === "Declined" && <span className="chip bad">Declined</span>}</div>
          <dl className="kv">
            <dt>Signer</dt><dd>{sel.signer_name} · {sel.signer_email}</dd>
            {sel.document_sha256 && <><dt>Fingerprint</dt><dd className="note" style={{ wordBreak: "break-all" }}>SHA-256 {sel.document_sha256}</dd></>}
          </dl>
          {sel.status === "Draft" ? (
            <div className="row">
              <form action={markSent}><input type="hidden" name="id" value={sel.id} /><button className="btn primary">Mark as sent and get the link</button></form>
              <form action={deleteRequest}><input type="hidden" name="id" value={sel.id} /><button className="btn ghost">Delete draft</button></form>
            </div>
          ) : (
            <div className="okmsg">Signer link (send it by email or WhatsApp): <b style={{ userSelect: "all", wordBreak: "break-all" }}>{origin}/sign/{sel.token}</b></div>
          )}
          {["Sent", "Viewed"].includes(sel.status) && (
            <EmailLinkForm
              connected={!!mailbox}
              title="Send the signing link by email"
              to={sel.signer_email}
              subject={`Signature requested: ${sel.name}`}
              message={`Dear ${sel.signer_name.split(" ")[0]},\n\n${sel.message ? sel.message + "\n\n" : ""}Please review and sign “${sel.name}” at the link below. It takes less than a minute.\n\nKind regards,`}
              href={`${origin}/sign/${sel.token}`}
              label="Review and sign"
            />
          )}
          {sel.status === "Signed" && sel.signature_png && (
            <div className="row" style={{ alignItems: "flex-end" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sel.signature_png} alt={`Signature of ${sel.signed_name}`} style={{ height: 80, background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: 4 }} />
              <div><b>{sel.signed_name}</b><div className="note">Signed {sel.signed_at ? fmt(sel.signed_at) : ""}</div></div>
            </div>
          )}
          <div>
            <h3 style={{ marginBottom: 6 }}>Audit trail</h3>
            <table className="t"><tbody>
              {(sel.audit ?? []).map((a, i) => (
                <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{fmt(a.at)}</td><td style={{ textTransform: "capitalize" }}><b>{a.event}</b>{a.name ? ` by ${a.name}` : ""}{a.reason ? `: ${a.reason}` : ""}</td>
                  <td className="note">{a.ip ?? ""}</td><td className="note" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.browser ?? ""}</td></tr>
              ))}
            </tbody></table>
          </div>
          <p className="note" style={{ margin: 0 }}>Simple electronic signature with audit trail. For contracts that legally require a qualified signature, use a certified provider.</p>
        </section>
      )}

      {!rows.length ? (
        <div className="panel empty"><h2>No signature requests yet</h2><p>Send a proposal or a PDF contract for signature.</p></div>
      ) : (
        <div className="panel tablewrap">
          <table className="t" style={{ minWidth: 760 }}>
            <thead><tr><th>Document</th><th>Signer</th><th>Progress</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/signatures?r=${r.id}`}><b>{r.name}</b></Link><div className="note">{r.projects ? `#${r.projects.code}` : r.proposal_id ? "Proposal" : "PDF"}</div></td>
                  <td>{r.signer_name}<div className="note">{r.signer_email}</div></td>
                  <td><div className="steps">{STEPS.map((s, i) => <span key={s} className={i <= STEPS.indexOf(r.status) ? "done" : ""}>{s}</span>)}</div></td>
                  <td><span className={`chip ${r.status === "Signed" ? "good" : r.status === "Declined" ? "bad" : r.status === "Draft" ? "" : "info"}`}>{r.status}</span></td>
                  <td>{shortDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
