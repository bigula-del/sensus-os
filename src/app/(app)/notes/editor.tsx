"use client";

import { useEffect, useRef, useState } from "react";
import { deleteNote, saveNote } from "./actions";

type Note = { id: string; title: string; body: string; project_id: string | null; shared: boolean };

/** Notepad editor that saves by itself one second after you stop typing. */
export function NoteEditor({ note, projects, mine }: { note: Note; projects: { id: string; label: string }[]; mine: boolean }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [state, setState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const queue = (patch: { title?: string; body?: string }) => {
    setState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      const r = await saveNote(note.id, patch);
      setState(r.error ? "error" : "saved");
    }, 900);
  };

  return (
    <div className="reader">
      <input className="ttl" value={title} readOnly={!mine} placeholder="Title" aria-label="Note title"
        onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value, body }); }} />
      <div className="row">
        <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>Project
          <select className="in" defaultValue={note.project_id ?? ""} disabled={!mine} style={{ width: 240 }}
            onChange={async (e) => { setState("saving"); const r = await saveNote(note.id, { project_id: e.target.value || null }); setState(r.error ? "error" : "saved"); }}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
        <label className="row" style={{ gap: 6, fontSize: 13 }}>
          <input type="checkbox" defaultChecked={note.shared} disabled={!mine}
            onChange={async (e) => { setState("saving"); const r = await saveNote(note.id, { shared: e.target.checked }); setState(r.error ? "error" : "saved"); }} />
          Share with the team
        </label>
        <span className="note" role="status" style={{ marginLeft: "auto" }}>
          {state === "saving" ? "Saving…" : state === "unsaved" ? "Typing…" : state === "error" ? "Not saved, check your connection" : mine ? "Saved" : "Shared by a colleague (read only)"}
        </span>
        {mine && <form action={deleteNote}><input type="hidden" name="id" value={note.id} /><button className="btn sm ghost">Delete</button></form>}
      </div>
      <textarea value={body} readOnly={!mine} aria-label="Note text" placeholder="Write here. It saves by itself."
        onChange={(e) => { setBody(e.target.value); queue({ title, body: e.target.value }); }} />
    </div>
  );
}
