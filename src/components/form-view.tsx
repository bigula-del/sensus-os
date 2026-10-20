"use client";

import { useState } from "react";
import type { FormField } from "@/lib/forms";

/** The branded form as clients see it. With `onSubmit` it is live; without, it is a preview. */
export function FormView({ name, fields, onSubmit }: { name: string; fields: FormField[]; onSubmit?: (answers: Record<string, string>) => Promise<{ error?: string }> }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <div className="formprev" style={{ maxWidth: 620, margin: "0 auto" }}>
        <div className="fh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-black.png" alt="sensus" style={{ width: 130 }} />
        </div>
        <div className="fb"><h2 style={{ margin: 0, color: "#111" }}>Thank you</h2><p style={{ margin: 0, color: "#333" }}>Your answers were sent to Sensus Travel DMC.</p></div>
      </div>
    );
  }

  return (
    <form
      className="formprev"
      style={{ maxWidth: 620, margin: "0 auto" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!onSubmit) return;
        const fd = new FormData(e.currentTarget);
        const answers: Record<string, string> = {};
        for (const f of fields) answers[f.label] = String(fd.get(f.id) ?? "").trim();
        setBusy(true);
        const r = await onSubmit(answers);
        setBusy(false);
        if (r.error) setErr(r.error); else setDone(true);
      }}
    >
      <div className="fh">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-black.png" alt="sensus" style={{ width: 130 }} />
        <div style={{ font: "700 22px/1.2 var(--display)", marginTop: 14 }}>{name}</div>
      </div>
      <div className="fb">
        {fields.map((f) => (
          <label key={f.id} htmlFor={`fv-${f.id}`}>
            {f.label}{f.required ? " *" : ""}
            {f.type === "long" ? <textarea id={`fv-${f.id}`} name={f.id} rows={3} required={f.required} maxLength={4000} />
              : f.type === "choice" ? (
                <select id={`fv-${f.id}`} name={f.id} required={f.required} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>)
              : f.type === "rating" ? (
                <select id={`fv-${f.id}`} name={f.id} required={f.required} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {"★".repeat(n)}</option>)}
                </select>)
              : <input id={`fv-${f.id}`} name={f.id} required={f.required} maxLength={500}
                  type={f.type === "email" ? "email" : f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} />}
          </label>
        ))}
        {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
        <button className="btn primary" type="submit" disabled={busy || !onSubmit} style={{ alignSelf: "flex-start" }}>{busy ? "Sending…" : "Send"}</button>
        <p style={{ margin: 0, fontSize: 11.5, color: "#666" }}>Sensus Travel DMC · SENSO VIAJANTE - VIAGENS UNIPESSOAL LDA · Your answers are used only to organise your programme.</p>
      </div>
    </form>
  );
}
