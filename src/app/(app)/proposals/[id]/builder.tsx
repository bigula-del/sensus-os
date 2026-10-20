"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { CURRENCIES, DEFAULT_FX, lineNetEUR, lineSellQuote, proposalTotals, type Basis, type Fx, type LineInput } from "@/lib/proposals";
import { newVersion, saveProposal, sendProposal, type SavePayload } from "../actions";

type Supplier = { id: string; name: string; city: string | null };
const uuid = () => crypto.randomUUID();
const I = () => <span className="internal">Internal</span>;

export function Builder({ id, status, shareUrl, initial, suppliers }: { id: string; status: string; shareUrl: string | null; initial: SavePayload; suppliers: Supplier[] }) {
  const [s, setS] = useState<SavePayload>(() => ({
    ...initial,
    fx: { ...DEFAULT_FX, ...initial.fx },
    days: initial.days.length ? initial.days : [{ day_number: 1, title: "Arrival" }],
  }));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const locked = status !== "Draft";
  const [defaultMargin, setDefaultMargin] = useState(18);

  const settings = { pax: Number(s.pax) || 0, foc_places: Number(s.foc_places) || 0, quote_currency: s.quote_currency, fx: s.fx };
  const t = useMemo(() => proposalTotals(s.lines, settings), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = s.quote_currency;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (patch: Partial<SavePayload>) => { setS((x) => ({ ...x, ...patch })); setDirty(true); setMsg(null); };
  const setLine = (lid: string, patch: Partial<LineInput>) => update({ lines: s.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) });
  const addLine = (day: number, preset?: Partial<LineInput>) =>
    update({ lines: [...s.lines, { id: uuid(), day_number: day, sort: s.lines.length, service: "", description: "", basis: "pax", units: 1, supplier_id: null, supplier_text: "", net_unit: 0, net_currency: "EUR", margin_pct: defaultMargin, is_estimate: false, ...preset }] });
  const addMeal = (day: number) =>
    addLine(day, { service: "Dinner at a selected restaurant", description: "Three-course menu with one drink per person.", basis: "pax", units: 1, net_unit: 60, net_currency: "USD" });
  const addDay = () => update({ days: [...s.days, { day_number: Math.max(0, ...s.days.map((d) => d.day_number)) + 1, title: "" }] });
  const removeDay = (n: number) => {
    if (s.lines.some((l) => l.day_number === n)) { setMsg({ error: "Move or remove this day's services first." }); return; }
    update({ days: s.days.filter((d) => d.day_number !== n) });
  };

  const save = (then?: () => void) =>
    start(async () => {
      const r = await saveProposal(id, s);
      setMsg(r);
      if (r.ok) { setDirty(false); then?.(); }
    });
  const send = () =>
    save(() => {
      const fd = new FormData();
      fd.set("id", id);
      start(() => sendProposal(fd));
    });

  const numIn = (v: number, on: (n: number) => void, w = 70, label = "", step = "any") => (
    <input className="in" type="number" step={step} value={Number.isFinite(v) ? v : 0} style={{ width: w, textAlign: "right" }} aria-label={label} disabled={locked}
      onChange={(e) => on(e.target.value === "" ? 0 : Number(e.target.value))} />
  );

  return (
    <div className="stack">
      {locked && (
        <div className="panel pad spread">
          <div><b>Version sent to the client.</b> <span className="note">It can no longer be changed, so the client always sees what was sent.</span>
            {shareUrl && <div className="note" style={{ marginTop: 4 }}>Client link: <b style={{ userSelect: "all" }}>{shareUrl}</b></div>}</div>
          <form action={newVersion}><input type="hidden" name="id" value={id} /><button className="btn primary">Create new version to edit</button></form>
        </div>
      )}

      <section className="panel summary" aria-label="Proposal summary">
        <div className="blk"><div className="note">Price per paying person</div><div className="big">{money(t.perPayingPerson, q)}</div>
          <div className="note">{s.pax} paying{s.foc_places ? ` + ${s.foc_places} free` : ""} · sharing a double</div></div>
        <div className="blk"><div className="note">Total to client</div><div className="big" style={{ fontSize: 22 }}>{money(t.sell, q)}</div>
          <div className="note">Net cost {money(t.net, q)}<I /></div></div>
        <div className="blk"><div className="note">Sensus margin<I /></div><div className="big" style={{ fontSize: 22 }}>{money(t.margin, q)}</div>
          <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, t.marginPct * 2.5))}%` }} /></div>
          <div className="note" style={{ marginTop: 4 }}>{t.marginPct.toFixed(1)}% of the selling price</div></div>
        <div className="blk"><div className="note">Status</div><div style={{ fontWeight: 600, marginTop: 4 }}>{status}{dirty ? " · unsaved changes" : ""}</div>
          <div className="row" style={{ marginTop: 8 }}>
            {!locked && <button className="btn" disabled={pending || !dirty} onClick={() => save()}>{pending ? "Saving…" : "Save"}</button>}
            {!locked && <button className="btn primary" disabled={pending || s.lines.length === 0} onClick={send}>Send to client</button>}
          </div>
          {msg?.error && <div className="note" style={{ color: "var(--bad)", marginTop: 6 }}>{msg.error}</div>}
          {msg?.ok && !dirty && <div className="note" style={{ color: "var(--good)", marginTop: 6 }}>Saved</div>}
        </div>
      </section>

      <div className="panel">
        <div className="settings">
          <label className="f">Paying travellers{numIn(s.pax, (n) => update({ pax: Math.max(1, Math.round(n)) }), 90, "Paying travellers", "1")}</label>
          <label className="f">Free places (FOC){numIn(s.foc_places, (n) => update({ foc_places: Math.max(0, Math.round(n)) }), 90, "Free places", "1")}</label>
          <label className="f">Quote currency
            <select className="in" value={q} disabled={locked} onChange={(e) => update({ quote_currency: e.target.value })} style={{ width: 100 }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="f">Single supplement ({q}){numIn(s.single_supplement ?? 0, (n) => update({ single_supplement: n || null }), 110, "Single supplement")}</label>
          <label className="f">Valid until<input className="in" type="date" value={s.valid_until ?? ""} disabled={locked} onChange={(e) => update({ valid_until: e.target.value || null })} style={{ width: 150 }} /></label>
          <label className="f">Margin for new services %{numIn(defaultMargin, setDefaultMargin, 80, "Default margin")}</label>
        </div>
        <div className="settings" style={{ display: "block" }}>
          <label className="f">Introduction for the client (optional)
            <textarea className="in" rows={2} value={s.intro} disabled={locked} onChange={(e) => update({ intro: e.target.value })} placeholder="A short personal note that opens the proposal." /></label>
        </div>
        {s.foc_places > 0 && <p className="note" style={{ padding: "0 16px" }}>Per-person services are costed for {s.pax + s.foc_places} people; the price is divided over the {s.pax} paying travellers.</p>}

        <div className="tablewrap">
          <table className="lines" style={{ minWidth: 1080 }}>
            <thead><tr>
              <th>Service, shown to the client</th><th>Supplier<I /></th><th>Priced per</th><th className="num">Units</th>
              <th className="num">Net unit<I /></th><th>Cur.</th><th className="num">Net total ({q})<I /></th><th className="num">Margin %<I /></th><th className="num">Sell ({q})</th><th />
            </tr></thead>
            {s.days.map((d) => {
              const ls = s.lines.filter((l) => l.day_number === d.day_number);
              return (
                <tbody key={d.day_number}>
                  <tr className="day"><td colSpan={10}>
                    <div className="spread">
                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>Day {d.day_number}
                        <input className="in" value={d.title} disabled={locked} placeholder="Day title, e.g. Arrival in Lisbon" aria-label={`Day ${d.day_number} title`}
                          onChange={(e) => update({ days: s.days.map((x) => (x.day_number === d.day_number ? { ...x, title: e.target.value } : x)) })} /></label>
                      {!locked && <span className="row">
                        <button className="btn sm" onClick={() => addLine(d.day_number)}>+ Service</button>
                        <button className="btn sm" onClick={() => addMeal(d.day_number)} title="US$60 per person with one drink">+ Standard meal</button>
                        {s.days.length > 1 && <button className="btn sm ghost" onClick={() => removeDay(d.day_number)}>Remove day</button>}
                      </span>}
                    </div>
                  </td></tr>
                  {ls.map((l) => (
                    <tr key={l.id}>
                      <td><div className="svc" style={{ gap: 4 }}>
                        <input className="in" value={l.service} disabled={locked} placeholder="Service name" aria-label="Service" onChange={(e) => setLine(l.id, { service: e.target.value })} />
                        <input className="in" value={l.description} disabled={locked} placeholder="Description for the client" aria-label="Description" style={{ fontSize: 12.5 }} onChange={(e) => setLine(l.id, { description: e.target.value })} />
                        {s.days.length > 1 && !locked && <select className="in" value={l.day_number} style={{ fontSize: 12, width: 110 }} aria-label="Move to day" onChange={(e) => setLine(l.id, { day_number: Number(e.target.value) })}>
                          {s.days.map((x) => <option key={x.day_number} value={x.day_number}>Day {x.day_number}</option>)}</select>}
                      </div></td>
                      <td className="netcell"><div className="svc" style={{ gap: 4 }}>
                        <select className="in" value={l.supplier_id ?? ""} disabled={locked} aria-label="Supplier" style={{ width: 170 }}
                          onChange={(e) => setLine(l.id, { supplier_id: e.target.value || null })}>
                          <option value="">Other / to confirm</option>
                          {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ""}</option>)}
                        </select>
                        {!l.supplier_id && <input className="in" value={l.supplier_text} disabled={locked} placeholder="Supplier name" aria-label="Supplier name" style={{ width: 170, fontSize: 12.5 }} onChange={(e) => setLine(l.id, { supplier_text: e.target.value })} />}
                      </div></td>
                      <td><select className="in" value={l.basis} disabled={locked} style={{ width: 96 }} aria-label="Priced per" onChange={(e) => setLine(l.id, { basis: e.target.value as Basis })}>
                        <option value="pax">Person</option><option value="group">Group</option><option value="room">Room</option></select></td>
                      <td className="num">{numIn(l.units, (n) => setLine(l.id, { units: n }), 62, "Units")}</td>
                      <td className="num netcell">{numIn(l.net_unit, (n) => setLine(l.id, { net_unit: n, is_estimate: false }), 86, "Net unit price")}
                        {l.is_estimate && <div className="note" style={{ color: "var(--warn)", fontSize: 11 }}>estimate</div>}</td>
                      <td><select className="in" value={l.net_currency} disabled={locked} style={{ width: 78 }} aria-label="Net currency" onChange={(e) => setLine(l.id, { net_currency: e.target.value })}>
                        {CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td className="num netcell">{money(lineNetEUR(l, settings) * (s.fx[q] || 1), q)}</td>
                      <td className="num netcell">{numIn(l.margin_pct, (n) => setLine(l.id, { margin_pct: n }), 64, "Margin percent")}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{money(lineSellQuote(l, settings), q)}</td>
                      <td>{!locked && <button className="x" aria-label={`Remove ${l.service || "service"}`} onClick={() => update({ lines: s.lines.filter((x) => x.id !== l.id) })}>✕</button>}</td>
                    </tr>
                  ))}
                  {!ls.length && <tr><td colSpan={10} className="note" style={{ padding: "10px 8px" }}>No services on this day yet.</td></tr>}
                </tbody>
              );
            })}
          </table>
        </div>
        {!locked && <div className="addbar"><button className="btn" onClick={addDay}>+ Add day</button></div>}
        <details className="fxbox">
          <summary>Exchange rates locked on this version (1 EUR =)</summary>
          <div className="fx">
            {CURRENCIES.filter((c) => c !== "EUR").map((c) => (
              <label key={c}>{c}{numIn(s.fx[c] ?? DEFAULT_FX[c], (n) => update({ fx: { ...s.fx, [c]: n } as Fx }), 90, `${c} rate`)}</label>
            ))}
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>USD, BRL, GBP and MXN came from the European Central Bank when this proposal was created. Check ARS, CLP, COP before quoting in them.</p>
        </details>
      </div>
    </div>
  );
}
