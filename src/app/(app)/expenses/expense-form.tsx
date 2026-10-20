"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { CURRENCIES } from "@/lib/proposals";
import { EXPENSE_CATEGORIES } from "@/lib/projects";
import { createExpense, readReceipt, type ExpenseDraft } from "./actions";

type Project = { id: string; code: string; title: string; services: { id: string; service: string }[] };

/** Shrinks large photos on the device before upload (max 2000 px, JPEG). PDFs and other files go as they are. */
async function shrink(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { blob: file, type: file.type || "application/octet-stream", ext };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6) return { blob: file, type: file.type, ext };
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? { blob, type: "image/jpeg", ext: "jpg" } : { blob: file, type: file.type, ext };
  } catch {
    return { blob: file, type: file.type, ext };
  }
}

export function ExpenseForm({ projects, presetProject, aiEnabled }: { projects: Project[]; presetProject?: string; aiEnabled: boolean }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [d, setD] = useState<ExpenseDraft>({ spent_on: today, supplier_name: "", description: "", amount: 0, currency: "EUR", category: "Supplier invoice", project_id: presetProject ?? "", service_id: "", receipt_path: "", read_by_ai: false });
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "busy" | "ok" | "err" | "info"; text: string } | null>(null);
  const [why, setWhy] = useState("");
  const [pending, start] = useTransition();
  const set = (p: Partial<ExpenseDraft>) => setD((x) => ({ ...x, ...p }));
  const services = projects.find((p) => p.id === d.project_id)?.services ?? [];

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 15e6) { setStatus({ kind: "err", text: "That file is over 15 MB. Take a smaller photo or a PDF." }); return; }
    setStatus({ kind: "busy", text: "Uploading…" });
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    const { blob, type, ext } = await shrink(file);
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from("receipts").upload(path, blob, { contentType: type });
    if (error) { setStatus({ kind: "err", text: "The receipt could not be uploaded. Try again." }); return; }
    set({ receipt_path: path });
    if (!aiEnabled) { setStatus({ kind: "info", text: "Receipt attached. Fill in the details below." }); return; }
    setStatus({ kind: "busy", text: "AI is reading the receipt…" });
    const r = await readReceipt(path);
    if (r.error || !r.data) { setStatus({ kind: "info", text: r.error ?? "Fill in the details below." }); return; }
    const x = r.data;
    const proj = projects.find((p) => p.id === x.project_id);
    set({
      supplier_name: x.supplier_name ?? "",
      spent_on: x.spent_on && /^\d{4}-\d{2}-\d{2}$/.test(x.spent_on) ? x.spent_on : today,
      amount: Number(x.amount) || 0,
      currency: x.currency && (CURRENCIES as readonly string[]).includes(x.currency) ? x.currency : "EUR",
      description: x.description ?? "",
      category: x.category && (EXPENSE_CATEGORIES as readonly string[]).includes(x.category) ? x.category : "Other",
      project_id: proj ? proj.id : d.project_id,
      service_id: proj && proj.services.some((s) => s.id === x.service_id) ? (x.service_id as string) : "",
      read_by_ai: true,
    });
    setWhy(x.why ?? "");
    setStatus({ kind: "ok", text: "Read by AI. Check the details before saving." });
  }

  const save = () =>
    start(async () => {
      const r = await createExpense(d);
      if (r.error) { setStatus({ kind: "err", text: r.error }); return; }
      router.push(d.project_id ? `/projects/${d.project_id}` : "/expenses");
      router.refresh();
    });

  return (
    <section className="panel pad stack" style={{ marginBottom: 18 }}>
      <div className="spread"><h3>New expense</h3><Link className="btn ghost sm" href="/expenses">Close</Link></div>
      <label className="drop" htmlFor="receipt" style={{ cursor: "pointer" }}>
        <div className="row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img className="thumb" src={preview} alt="Receipt" />}
          <div><b>{d.receipt_path ? "Receipt attached" : "Add a photo or PDF of the receipt"}</b>
            <div className="note">{aiEnabled ? "AI reads it and fills in the form for you." : "Take a photo with your phone or choose a file."}</div></div>
        </div>
        <span className="btn primary">{d.receipt_path ? "Replace" : "Choose file"}</span>
        <input id="receipt" type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {status && <p className={status.kind === "err" ? "err" : status.kind === "ok" ? "okmsg" : "note"} role="status" style={{ margin: 0 }}>{status.kind === "busy" && <span className="spin" />} {status.text}</p>}
      <div className="formgrid">
        <label className="f">Supplier *<input className="in" value={d.supplier_name} onChange={(e) => set({ supplier_name: e.target.value })} /></label>
        <label className="f">Date<input className="in" type="date" value={d.spent_on} onChange={(e) => set({ spent_on: e.target.value })} /></label>
        <label className="f">Amount *<input className="in" type="number" step="0.01" min="0" value={d.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} /></label>
        <label className="f">Currency<select className="in" value={d.currency} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Description<input className="in" value={d.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <label className="f">Category<select className="in" value={d.category} onChange={(e) => set({ category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Project<select className="in" value={d.project_id} onChange={(e) => set({ project_id: e.target.value, service_id: "" })}>
          <option value="">Company expense (no project)</option>
          {projects.map((p) => <option key={p.id} value={p.id}>#{p.code} · {p.title}</option>)}</select></label>
        <label className="f">Service in the project<select className="in" value={d.service_id} disabled={!d.project_id} onChange={(e) => set({ service_id: e.target.value })}>
          <option value="">Extra, not in the proposal</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.service}</option>)}</select></label>
      </div>
      {why && <p className="note" style={{ margin: 0 }}><b>Why this project:</b> {why}</p>}
      <p className="note" style={{ margin: 0 }}>Other currencies are converted to euros at the European Central Bank rate of the expense date.</p>
      <div className="row"><button className="btn primary" disabled={pending || status?.kind === "busy"} onClick={save}>{pending ? "Saving…" : "Save expense"}</button></div>
    </section>
  );
}
