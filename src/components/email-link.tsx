"use client";

import { useState, useTransition } from "react";
import { emailClientLink } from "@/app/(app)/inbox/actions";

/** "Send by email" for a client link (proposal, signature, form), sent from the person's own Outlook. */
export function EmailLinkForm({ connected, to, subject, message, href, label, title = "Send by email" }: {
  connected: boolean; to: string; subject: string; message: string; href: string; label: string; title?: string;
}) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; ok?: boolean } | null>(null);
  if (!connected) {
    return <p className="note">To email this link from Sensus OS, <a href="/inbox">connect your Outlook</a> first. You can still copy the link above.</p>;
  }
  return (
    <details className="panel pad" style={{ background: "var(--panel)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{title}</summary>
      <form
        className="stack"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setResult(null);
          start(async () => setResult(await emailClientLink({ to: String(fd.get("to")), subject: String(fd.get("subject")), message: String(fd.get("message")), href, label })));
        }}
      >
        <label className="f">To<input className="in" name="to" defaultValue={to} required placeholder="client@company.com" /></label>
        <label className="f">Subject<input className="in" name="subject" defaultValue={subject} required maxLength={300} /></label>
        <label className="f">Message<textarea className="in" name="message" rows={5} defaultValue={message} /></label>
        <p className="note">A yellow “{label}” button with the link and your Sensus signature are added below your message. It goes from your own mailbox.</p>
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? <><span className="spin" /> Sending…</> : "Send email"}</button>
          {result?.ok && <span className="okmsg">Sent.</span>}
          {result?.error && <span className="err">{result.error}</span>}
        </div>
      </form>
    </details>
  );
}
