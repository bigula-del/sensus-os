"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { quickNote, quickReminder } from "./home-actions";
import { setDone } from "./calendar/actions";

type Note = { id: string; title: string; body: string; updated_at: string };
type Rem = { id: string; title: string; starts_on: string; starts_at: string | null };

const day = (iso: string, today: string) => {
  if (iso === today) return "Today";
  const d = new Date(iso + "T12:00:00");
  const diff = Math.round((d.getTime() - new Date(today + "T12:00:00").getTime()) / 864e5);
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${-diff}d late`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** The quick-access window on the home page: jot a note or set a reminder without leaving. */
export function QuickPanel({ notes, reminders, today }: { notes: Note[]; reminders: Rem[]; today: string }) {
  const [tab, setTab] = useState<"notes" | "reminders">("reminders");
  const [noteState, noteAction, notePending] = useActionState(quickNote, {});
  const [remState, remAction, remPending] = useActionState(quickReminder, {});
  const noteForm = useRef<HTMLFormElement>(null);
  const remForm = useRef<HTMLFormElement>(null);
  useEffect(() => { if (noteState.ok) noteForm.current?.reset(); }, [noteState.ok]);
  useEffect(() => { if (remState.ok) remForm.current?.reset(); }, [remState.ok]);

  return (
    <section className="panel">
      <header><h3>Notes &amp; reminders</h3><Link className="btn sm ghost" href={tab === "notes" ? "/notes" : "/calendar"}>Open all</Link></header>
      <div className="qtabs">
        <button type="button" className="seg" aria-pressed={tab === "reminders"} onClick={() => setTab("reminders")}>Reminders{reminders.length ? ` · ${reminders.length}` : ""}</button>
        <button type="button" className="seg" aria-pressed={tab === "notes"} onClick={() => setTab("notes")}>Notes</button>
      </div>

      {tab === "reminders" ? (
        <>
          <form ref={remForm} action={remAction} className="stack" style={{ padding: "12px 16px", gap: 8 }}>
            <input className="in" name="title" placeholder="Remind me to…" aria-label="Reminder" required maxLength={200} />
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <input className="in" type="date" name="date" defaultValue={today} aria-label="Date" required style={{ flex: 1, minWidth: 0 }} />
              <input className="in" type="time" name="time" aria-label="Time (optional)" style={{ width: 96, flex: "none" }} />
              <button className="btn primary" disabled={remPending}>{remPending ? <span className="spin" /> : "Add"}</button>
            </div>
            {remState.error && <p className="err">{remState.error}</p>}
          </form>
          {reminders.length ? (
            <ul className="agenda" style={{ borderTop: "1px solid var(--line)" }}>
              {reminders.map((r) => (
                <li key={r.id} style={{ gridTemplateColumns: "auto 1fr auto", padding: "8px 16px" }}>
                  <form action={setDone}><input type="hidden" name="id" value={r.id} />
                    <button className="btn sm" title="Mark done" aria-label={`Mark "${r.title}" done`} style={{ width: 28, padding: "4px 0" }}>✓</button></form>
                  <Link href={`/calendar?m=${r.starts_on.slice(0, 7)}&ev=${r.id}`} style={{ textDecoration: "none", minWidth: 0, overflowWrap: "anywhere" }}>{r.title}</Link>
                  <span className="note" style={{ whiteSpace: "nowrap", color: r.starts_on < today ? "var(--bad)" : undefined }}>{day(r.starts_on, today)}{r.starts_at ? ` ${r.starts_at.slice(0, 5)}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <div className="empty" style={{ borderTop: "1px solid var(--line)" }}>No open reminders.</div>}
        </>
      ) : (
        <>
          <form ref={noteForm} action={noteAction} className="stack" style={{ padding: "12px 16px", gap: 8 }}>
            <textarea className="in" name="text" rows={4} placeholder={"Quick note…\nThe first line becomes the title."} aria-label="Quick note" required />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="note">Private to you. Share it from Notes.</span>
              <button className="btn primary" disabled={notePending}>{notePending ? <span className="spin" /> : "Save note"}</button>
            </div>
            {noteState.error && <p className="err">{noteState.error}</p>}
          </form>
          {notes.length ? (
            <ul className="agenda" style={{ borderTop: "1px solid var(--line)" }}>
              {notes.map((n) => (
                <li key={n.id} style={{ gridTemplateColumns: "1fr auto", padding: "8px 16px" }}>
                  <Link href={`/notes?n=${n.id}`} style={{ textDecoration: "none", minWidth: 0 }}>
                    <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title || "Untitled"}</b>
                    {n.body && <span className="note" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</span>}
                  </Link>
                  <span className="note">{new Date(n.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          ) : <div className="empty" style={{ borderTop: "1px solid var(--line)" }}>No notes yet.</div>}
        </>
      )}
    </section>
  );
}
