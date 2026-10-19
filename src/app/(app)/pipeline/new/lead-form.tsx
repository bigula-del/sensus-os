"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createLead } from "../actions";

export function LeadForm() {
  const [state, action, pending] = useActionState<{ error?: string } | null, FormData>(createLead, null);
  return (
    <form action={action} className="panel pad formcard stack">
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <div className="formgrid">
        <label className="f" htmlFor="client">Client *<input className="in" id="client" name="client" required placeholder="e.g. Agenzia Lumen" /></label>
        <label className="f" htmlFor="client_kind">Client type<select className="in" id="client_kind" name="client_kind"><option value="corporate">Company</option><option value="agency">Agency</option><option value="direct">Private client</option></select></label>
        <label className="f" htmlFor="contact">Contact person<input className="in" id="contact" name="contact" /></label>
        <label className="f" htmlFor="contact_email">Contact email<input className="in" id="contact_email" name="contact_email" type="email" /></label>
      </div>
      <label className="f" htmlFor="title">Title *<input className="in" id="title" name="title" required placeholder="e.g. Congress social programme · Madrid" /></label>
      <div className="formgrid">
        <label className="f" htmlFor="kind">Type<select className="in" id="kind" name="kind"><option>MICE</option><option>Leisure</option></select></label>
        <label className="f" htmlFor="destinations">Destination countries<input className="in" id="destinations" name="destinations" placeholder="PT, ES" /></label>
        <label className="f" htmlFor="dates">Dates as the client wrote them<input className="in" id="dates" name="dates" placeholder="3–6 Mar 2027" /></label>
        <label className="f" htmlFor="pax">Participants<input className="in" id="pax" name="pax" type="number" min="1" /></label>
        <label className="f" htmlFor="start_date">Start date<input className="in" id="start_date" name="start_date" type="date" /></label>
        <label className="f" htmlFor="end_date">End date<input className="in" id="end_date" name="end_date" type="date" /></label>
        <label className="f" htmlFor="market">Client market<input className="in" id="market" name="market" placeholder="Italy, Brazil…" /></label>
        <label className="f" htmlFor="value">Estimated value (EUR)<input className="in" id="value" name="value" type="number" min="0" step="100" /></label>
        <label className="f" htmlFor="source">Source<select className="in" id="source" name="source"><option value="">—</option><option>Email</option><option>Website</option><option>LinkedIn</option><option>Referral</option><option>Trade fair</option><option>Repeat client</option></select></label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save lead"}</button>
        <Link className="btn ghost" href="/pipeline">Cancel</Link>
      </div>
    </form>
  );
}
