"use client";

import { useActionState } from "react";
import { addPayment } from "../actions";

export function PaymentForm({ projectId, balance }: { projectId: string; balance: number }) {
  const [state, action, pending] = useActionState<{ error?: string; ok?: string } | null, FormData>(addPayment, null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="addbar" style={{ borderTop: "1px solid var(--line)" }}>
      <input type="hidden" name="project_id" value={projectId} />
      <label className="f">Date<input className="in" type="date" name="date" defaultValue={today} required style={{ width: 150 }} /></label>
      <label className="f">Amount (EUR)<input className="in" type="number" name="amount" step="0.01" min="0" defaultValue={balance ? balance.toFixed(2) : ""} required style={{ width: 130 }} /></label>
      <label className="f" style={{ flex: "1 1 140px" }}>Reference<input className="in" name="reference" placeholder="Bank transfer, invoice no." /></label>
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Record payment"}</button>
      {state?.error && <span className="note" style={{ color: "var(--bad)" }}>{state.error}</span>}
      {state?.ok && <span className="note" style={{ color: "var(--good)" }}>{state.ok}</span>}
    </form>
  );
}
