"use client";

import { useState, useTransition } from "react";
import { FIELD_TYPES, type FieldType, type FormField } from "@/lib/forms";
import { FormView } from "@/components/form-view";
import { saveForm } from "../actions";

export function FormBuilder({ id, initial, projects, link }: {
  id: string; link: string; projects: { id: string; label: string }[];
  initial: { name: string; project_id: string | null; is_open: boolean; fields: FormField[] };
}) {
  const [s, setS] = useState(initial);
  const [tab, setTab] = useState<"build" | "preview">("build");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const upd = (p: Partial<typeof s>) => { setS((x) => ({ ...x, ...p })); setMsg(""); };
  const setField = (i: number, p: Partial<FormField>) => upd({ fields: s.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const move = (i: number, d: number) => {
    const f = [...s.fields]; const j = i + d;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j], f[i]]; upd({ fields: f });
  };

  return (
    <div className="stack">
      <div className="panel pad stack">
        <div className="formgrid">
          <label className="f">Form name<input className="in" value={s.name} onChange={(e) => upd({ name: e.target.value })} /></label>
          <label className="f">Project<select className="in" value={s.project_id ?? ""} onChange={(e) => upd({ project_id: e.target.value || null })}>
            <option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        </div>
        <div className="row">
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={s.is_open} onChange={(e) => upd({ is_open: e.target.checked })} /> Open for answers</label>
          <span className="note" style={{ userSelect: "all" }}>{link}</span>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy link"}</button>
          <span style={{ marginLeft: "auto" }} className="row">
            {msg && <span className="note">{msg}</span>}
            <button className="btn primary" disabled={pending} onClick={() => start(async () => { const r = await saveForm(id, s); setMsg(r.error ?? "Saved"); })}>{pending ? "Saving…" : "Save"}</button>
          </span>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "build"} onClick={() => setTab("build")}>Questions</button>
        <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Client preview</button>
      </div>
      {tab === "build" ? (
        <div className="panel">
          {s.fields.map((f, i) => (
            <div key={f.id} className="fieldrow" style={{ gridTemplateColumns: "minmax(0,1fr) 130px 90px auto" }}>
              <div className="stack" style={{ gap: 6 }}>
                <input className="in" value={f.label} aria-label="Question" onChange={(e) => setField(i, { label: e.target.value })} />
                {f.type === "choice" && <input className="in" value={f.options.join(", ")} aria-label="Options" placeholder="Options, separated by commas" style={{ fontSize: 12.5 }}
                  onChange={(e) => setField(i, { options: e.target.value.split(",").map((x) => x.trim()) })} />}
              </div>
              <select className="in" value={f.type} aria-label="Answer type" onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              <label className="row req" style={{ gap: 4, fontSize: 12.5 }}><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
              <span className="row" style={{ gap: 2 }}>
                <button className="x" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                <button className="x" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                <button className="x" aria-label="Remove question" onClick={() => upd({ fields: s.fields.filter((_, j) => j !== i) })}>✕</button>
              </span>
            </div>
          ))}
          <div className="addbar">
            <button className="btn" onClick={() => upd({ fields: [...s.fields, { id: crypto.randomUUID().slice(0, 8), label: "", type: "short", required: false, options: [] }] })}>+ Add question</button>
          </div>
        </div>
      ) : (
        <FormView name={s.name} fields={s.fields} />
      )}
    </div>
  );
}
