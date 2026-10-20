"use client";

import { useActionState, useState } from "react";
import { COUNTRIES } from "@/lib/holidays";
import { createItinerary } from "./actions";

type Opt = { id: string; label: string };

export function NewItineraryForm({ proposals, leads, projects, aiOn }: { proposals: Opt[]; leads: Opt[]; projects: Opt[]; aiOn: boolean }) {
  const [state, action, pending] = useActionState(createItinerary, {});
  const [mode, setMode] = useState<"blank" | "proposal" | "ai">(aiOn ? "ai" : "blank");
  const [dest, setDest] = useState<string[]>([]);
  return (
    <form action={action} className="panel pad stack" style={{ marginBottom: 16 }}>
      <h3>New itinerary</h3>
      <div className="row" role="radiogroup" aria-label="How to start" style={{ gap: 6 }}>
        <button type="button" className="seg" aria-pressed={mode === "ai"} onClick={() => setMode("ai")} disabled={!aiOn} title={aiOn ? "" : "Needs the AI key in Vercel"}>✨ Draft with AI</button>
        <button type="button" className="seg" aria-pressed={mode === "proposal"} onClick={() => setMode("proposal")}>From a proposal</button>
        <button type="button" className="seg" aria-pressed={mode === "blank"} onClick={() => setMode("blank")}>Blank</button>
      </div>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="destinations" value={dest.join(",")} />
      {mode === "proposal" && (
        <label className="f">Proposal (days and services are copied, without prices)
          <select className="in" name="proposal_id" required defaultValue=""><option value="" disabled>Choose…</option>{proposals.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      )}
      <div className="formgrid">
        <label className="f">Title{mode === "blank" ? "" : " (optional)"}<input className="in" name="title" required={mode === "blank"} placeholder="e.g. Lisbon & Douro Incentive" /></label>
        <label className="f">Client / group name (optional)<input className="in" name="client_name" /></label>
        <label className="f">Start date (optional)<input className="in" type="date" name="start_date" /></label>
        <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          {mode !== "proposal" && <label className="f" style={{ flex: 1 }}>Days<input className="in" type="number" name="days" min={1} max={30} defaultValue={mode === "ai" ? 5 : 3} /></label>}
          <label className="f" style={{ flex: 1 }}>Travellers<input className="in" type="number" name="pax" min={1} /></label>
        </div>
      </div>
      {mode !== "proposal" && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="note" style={{ marginBottom: 6 }}>Countries</legend>
          <div className="row" style={{ gap: 6 }}>
            {COUNTRIES.map((c) => { const on = dest.includes(c.code); return <button key={c.code} type="button" className="seg" aria-pressed={on} onClick={() => setDest(on ? dest.filter((x) => x !== c.code) : [...dest, c.code])}>{c.flag} {c.name}</button>; })}
          </div>
        </fieldset>
      )}
      {mode === "ai" && (
        <>
          <div className="formgrid">
            <label className="f">Cities and regions<input className="in" name="cities" placeholder="e.g. Lisbon, Sintra, Douro Valley" /></label>
            <label className="f">Type<select className="in" name="kind" defaultValue="leisure"><option value="leisure">Leisure</option><option value="incentive (MICE)">Incentive (MICE)</option><option value="corporate meeting / congress (MICE)">Meeting / congress</option><option value="honeymoon">Honeymoon</option><option value="family">Family</option></select></label>
          </div>
          <label className="f">Style and interests<input className="in" name="style" placeholder="e.g. luxury, gastronomy and wine, art, slow pace" /></label>
          <label className="f">Client brief (optional)<textarea className="in" name="notes" rows={3} placeholder="Paste the client's request here." /></label>
        </>
      )}
      <details className="note"><summary style={{ cursor: "pointer" }}>Link to a lead or project (optional)</summary>
        <div className="formgrid" style={{ marginTop: 8 }}>
          <label className="f">Lead<select className="in" name="lead_id" defaultValue=""><option value="">None</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
          <label className="f">Project<select className="in" name="project_id" defaultValue=""><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        </div>
      </details>
      {state.error && <p className="err">{state.error}</p>}
      <div className="row"><button className="btn primary" disabled={pending}>{pending ? <><span className="spin" /> {mode === "ai" ? "Drafting with AI… (up to a minute)" : "Creating…"}</> : "Create itinerary"}</button></div>
    </form>
  );
}
