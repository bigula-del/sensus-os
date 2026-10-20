"use client";

import { useActionState } from "react";
import { createEvent } from "./actions";

type Opt = { id: string; label: string };

export function EventForm({ date, projects, leads, people, me, presetProject, presetLead, back }: {
  date: string; projects: Opt[]; leads: Opt[]; people: Opt[]; me: string; presetProject?: string; presetLead?: string; back?: string;
}) {
  const [state, action, pending] = useActionState<{ error?: string } | null, FormData>(createEvent, null);
  return (
    <form action={action} className="panel pad stack" style={{ marginBottom: 16 }}>
      <h3>New event or reminder</h3>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <input type="hidden" name="back" value={back ?? ""} />
      <label className="f">What<input className="in" name="title" required placeholder="e.g. Send rooming list to the hotel" /></label>
      <div className="formgrid">
        <label className="f">Type<select className="in" name="kind" defaultValue="reminder"><option value="reminder">Reminder</option><option value="meeting">Meeting</option><option value="project">Project service</option></select></label>
        <label className="f">For<select className="in" name="owner_id" defaultValue={me}>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="f">Date<input className="in" type="date" name="date" defaultValue={date} required /></label>
        <label className="f">Time (optional)<input className="in" type="time" name="time" /></label>
        <label className="f">Project<select className="in" name="project_id" defaultValue={presetProject ?? ""}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="f">Lead<select className="in" name="lead_id" defaultValue={presetLead ?? ""}><option value="">None</option>{leads.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      </div>
      <div className="row"><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
    </form>
  );
}
