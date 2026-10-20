"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { createRequest, type NewRequest } from "./actions";

type Opt = { id: string; label: string };

export function NewRequestForm({ proposals, projects }: { proposals: Opt[]; projects: Opt[] }) {
  const router = useRouter();
  const [d, setD] = useState<NewRequest>({ name: "", signer_name: "", signer_email: "", message: "", source: proposals.length ? "proposal" : "pdf", file_path: "", proposal_id: "", project_id: "", lead_id: "" });
  const [status, setStatus] = useState<{ kind: "busy" | "err" | "ok"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<NewRequest>) => setD((x) => ({ ...x, ...p }));

  async function upload(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf") { setStatus({ kind: "err", text: "Choose a PDF file." }); return; }
    if (f.size > 20e6) { setStatus({ kind: "err", text: "The PDF is over 20 MB." }); return; }
    setStatus({ kind: "busy", text: "Uploading…" });
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabaseBrowser().storage.from("documents").upload(path, f, { contentType: "application/pdf" });
    if (error) { setStatus({ kind: "err", text: "The PDF could not be uploaded." }); return; }
    set({ file_path: path, name: d.name || f.name.replace(/\.pdf$/i, "") });
    setStatus({ kind: "ok", text: `${f.name} uploaded.` });
  }

  const save = () => start(async () => {
    const r = await createRequest(d);
    if (r.error) { setStatus({ kind: "err", text: r.error }); return; }
    router.push(`/signatures?r=${r.id}`);
    router.refresh();
  });

  return (
    <section className="panel pad stack" style={{ marginBottom: 16 }}>
      <div className="spread"><h3>New signature request</h3><Link className="btn ghost sm" href="/signatures">Close</Link></div>
      <div className="row">
        <label className="row" style={{ gap: 6 }}><input type="radio" checked={d.source === "proposal"} onChange={() => set({ source: "proposal" })} disabled={!proposals.length} /> A proposal sent to the client</label>
        <label className="row" style={{ gap: 6 }}><input type="radio" checked={d.source === "pdf"} onChange={() => set({ source: "pdf" })} /> A PDF (contract, agreement)</label>
      </div>
      {d.source === "proposal" ? (
        <label className="f">Proposal<select className="in" value={d.proposal_id} onChange={(e) => set({ proposal_id: e.target.value, name: d.name || `Acceptance of ${proposals.find((p) => p.id === e.target.value)?.label ?? "proposal"}` })}>
          <option value="">Choose…</option>{proposals.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      ) : (
        <label className="drop" htmlFor="pdf" style={{ cursor: "pointer" }}>
          <div><b>{d.file_path ? "PDF attached" : "Upload the PDF to be signed"}</b><div className="note">The signer reads it before signing. Its fingerprint is recorded so changes can be detected.</div></div>
          <span className="btn primary">{d.file_path ? "Replace" : "Choose PDF"}</span>
          <input id="pdf" type="file" accept="application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
      {status && <p className={status.kind === "err" ? "err" : status.kind === "ok" ? "okmsg" : "note"} style={{ margin: 0 }}>{status.kind === "busy" && <span className="spin" />} {status.text}</p>}
      <div className="formgrid">
        <label className="f">Document name *<input className="in" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Service agreement, Energia Sul" /></label>
        <label className="f">Project (optional)<select className="in" value={d.project_id} onChange={(e) => set({ project_id: e.target.value })}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="f">Signer name *<input className="in" value={d.signer_name} onChange={(e) => set({ signer_name: e.target.value })} /></label>
        <label className="f">Signer email *<input className="in" type="email" value={d.signer_email} onChange={(e) => set({ signer_email: e.target.value })} /></label>
      </div>
      <label className="f">Message to the signer (optional)<textarea className="in" rows={2} value={d.message} onChange={(e) => set({ message: e.target.value })} /></label>
      <div className="row"><button className="btn primary" disabled={pending || status?.kind === "busy"} onClick={save}>{pending ? "Saving…" : "Create request"}</button></div>
    </section>
  );
}
