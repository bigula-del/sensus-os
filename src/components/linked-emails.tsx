import { unlinkEmail } from "@/app/(app)/inbox/actions";

export type LinkedEmail = { message_id: string; subject: string | null; sender: string | null; recipients: string | null; received_at: string | null; body_text: string | null; created_at: string };

/** Emails linked to a lead or project. A copy of the text is kept so the whole team can read them. */
export function LinkedEmails({ rows, from }: { rows: LinkedEmail[]; from: string }) {
  return (
    <section className="panel pad stack" style={{ marginTop: 16 }}>
      <div className="spread"><h3>Emails</h3><a className="btn sm" href="/inbox">Open inbox</a></div>
      {rows.length ? rows.map((e) => (
        <details key={e.message_id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <summary style={{ cursor: "pointer" }}>
            <b>{e.subject || "(no subject)"}</b>
            <span className="note"> · {e.sender}{e.received_at ? ` · ${new Date(e.received_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })}` : ""}</span>
          </summary>
          {e.recipients && <p className="note" style={{ marginTop: 6 }}>To: {e.recipients}</p>}
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0", maxHeight: 420, overflow: "auto" }}>{e.body_text}</div>
          <form action={unlinkEmail}>
            <input type="hidden" name="message_id" value={e.message_id} /><input type="hidden" name="from" value={from} />
            <button className="btn ghost sm">Unlink</button>
          </form>
        </details>
      )) : <p className="note">No emails linked yet. In the Inbox, open an email and link it here, or create a lead straight from an email.</p>}
    </section>
  );
}
