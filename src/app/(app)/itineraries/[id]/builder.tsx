"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { COUNTRIES } from "@/lib/holidays";
import { dayDate, KINDS, kindOf, type ItDay, type ItHeader, type ItItem, type ItPayload, type Kind } from "@/lib/itineraries";
import type { Photo } from "@/lib/web-content";
import {
  aiDescribe, aiDraftDays, deleteFromLibrary, findPhotos, saveItinerary, saveToLibrary, searchLibrary, setItineraryStatus, wikiFill, type LibItem,
} from "../actions";

const uuid = () => crypto.randomUUID();
const I = () => <span className="internal">Internal</span>;
const blankItem = (day: number, sort: number, kind: Kind = "activity"): ItItem => ({
  id: uuid(), day_number: day, sort, kind, title: "", start_time: "", end_time: "", location: "", address: "", description: "",
  photo_url: "", photo_credit: "", link_url: "", booking_ref: "", internal_notes: "",
});

async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85))) ?? file;
  } catch {
    return file;
  }
}

type PhotoTarget = { kind: "cover" } | { kind: "day"; day: number } | { kind: "item"; id: string };

export function ItineraryBuilder({ id, status, shareUrl, initial, aiOn }: { id: string; status: string; shareUrl: string; initial: ItPayload; aiOn: boolean }) {
  const [h, setH] = useState<ItHeader>(initial.header);
  const [days, setDays] = useState<ItDay[]>(initial.days);
  const [items, setItems] = useState<ItItem[]>(initial.items.map((x) => ({ ...x, id: x.id || uuid() })));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [lang, setLang] = useState("en");
  const [photoFor, setPhotoFor] = useState<PhotoTarget | null>(null);
  const [libFor, setLibFor] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => { setDirty(true); setMsg(null); };
  const upH = (p: Partial<ItHeader>) => { setH((x) => ({ ...x, ...p })); touch(); };
  const upDay = (n: number, p: Partial<ItDay>) => { setDays((ds) => ds.map((d) => (d.day_number === n ? { ...d, ...p } : d))); touch(); };
  const upItem = (iid: string, p: Partial<ItItem>) => { setItems((xs) => xs.map((x) => (x.id === iid ? { ...x, ...p } : x))); touch(); };
  const dayItems = (n: number) => items.filter((x) => x.day_number === n).sort((a, b) => a.sort - b.sort);
  const toggle = (iid: string) => setOpen((o) => { const s = new Set(o); if (s.has(iid)) s.delete(iid); else s.add(iid); return s; });

  const addItem = (day: number, kind: Kind, preset?: Partial<ItItem>) => {
    const list = dayItems(day);
    const it = { ...blankItem(day, (list.at(-1)?.sort ?? -1) + 1, kind), ...preset, id: uuid(), day_number: day };
    setItems((xs) => [...xs, it]);
    setOpen((o) => new Set(o).add(it.id));
    touch();
  };
  const moveItem = (iid: string, dir: -1 | 1) => {
    const it = items.find((x) => x.id === iid)!;
    const list = dayItems(it.day_number);
    const i = list.findIndex((x) => x.id === iid);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
    const sorts = new Map(reordered.map((x, k) => [x.id, k]));
    setItems((xs) => xs.map((x) => (sorts.has(x.id) ? { ...x, sort: sorts.get(x.id)! } : x)));
    touch();
  };
  const toDay = (iid: string, day: number) => { upItem(iid, { day_number: day, sort: (dayItems(day).at(-1)?.sort ?? -1) + 1 }); };
  const removeItem = (iid: string) => { setItems((xs) => xs.filter((x) => x.id !== iid)); touch(); };
  const dupItem = (iid: string) => { const it = items.find((x) => x.id === iid)!; addItem(it.day_number, it.kind, { ...it, title: `${it.title} (copy)` }); };

  const addDay = () => {
    const n = Math.max(0, ...days.map((d) => d.day_number)) + 1;
    if (n > 60) return;
    setDays((ds) => [...ds, { day_number: n, title: "", city: days.at(-1)?.city ?? "", description: "", photo_url: "", photo_credit: "" }]);
    touch();
  };
  const removeDay = (n: number) => {
    const count = dayItems(n).length;
    if (count && !window.confirm(`Remove day ${n} and its ${count} item(s)?`)) return;
    setDays((ds) => ds.filter((d) => d.day_number !== n).map((d) => (d.day_number > n ? { ...d, day_number: d.day_number - 1 } : d)));
    setItems((xs) => xs.filter((x) => x.day_number !== n).map((x) => (x.day_number > n ? { ...x, day_number: x.day_number - 1 } : x)));
    touch();
  };
  const swapDays = (a: number, b: number) => {
    if (!days.some((d) => d.day_number === b)) return;
    const sw = (n: number) => (n === a ? b : n === b ? a : n);
    setDays((ds) => ds.map((d) => ({ ...d, day_number: sw(d.day_number) })).sort((x, y) => x.day_number - y.day_number));
    setItems((xs) => xs.map((x) => ({ ...x, day_number: sw(x.day_number) })));
    touch();
  };

  const payload = (): ItPayload => ({ header: h, days, items });
  const save = (then?: () => void) =>
    start(async () => {
      const r = await saveItinerary(id, payload());
      setMsg(r);
      if (r.ok) { setDirty(false); then?.(); }
    });
  const setStatus = (s: string) =>
    save(() => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", s);
      start(async () => { await setItineraryStatus(fd); setMsg({ ok: s === "Shared" ? "Shared. The client link is active." : s === "Draft" ? "Back to draft: the client link is switched off." : "Archived." }); });
    });

  const cityOf = (day: number) => days.find((d) => d.day_number === day)?.city ?? "";
  const wiki = async (q: string, apply: (s: { extract: string; photo: string | null; credit: string | null }) => void) => {
    setBusy(`wiki:${q}`);
    const r = await wikiFill(q, lang);
    setBusy(null);
    if (!r.summary) { setMsg({ error: `Nothing found on Wikipedia for “${q}”. Try the exact name of the place.` }); return; }
    apply(r.summary);
  };
  const describe = async (key: string, input: { title: string; location: string; city: string; current: string }, apply: (t: string) => void) => {
    setBusy(key);
    const r = await aiDescribe({ ...input, lang });
    setBusy(null);
    if (r.error) setMsg({ error: r.error }); else if (r.text) apply(r.text);
  };

  const pickPhoto = (url: string, credit: string) => {
    if (!photoFor) return;
    if (photoFor.kind === "cover") upH({ cover_url: url, cover_credit: credit });
    else if (photoFor.kind === "day") upDay(photoFor.day, { photo_url: url, photo_credit: credit });
    else upItem(photoFor.id, { photo_url: url, photo_credit: credit });
    setPhotoFor(null);
  };
  const photoQuery = (t: PhotoTarget) =>
    t.kind === "cover" ? [days[0]?.city, h.title].filter(Boolean).join(" ")
    : t.kind === "day" ? (days.find((d) => d.day_number === t.day)?.city || days.find((d) => d.day_number === t.day)?.title || "")
    : (() => { const it = items.find((x) => x.id === t.id); return [it?.location || it?.title, cityOf(it?.day_number ?? 0)].filter(Boolean).join(" "); })();

  const shared = status === "Shared";

  return (
    <div className="stack">
      {/* trip details */}
      <section className="panel pad stack">
        <div className="spread"><h3>Trip details</h3>
          <label className="inline note">Content language
            <select className="in" value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: "auto" }}>
              <option value="en">English</option><option value="pt">Português</option><option value="es">Español</option><option value="fr">Français</option><option value="it">Italiano</option>
            </select></label>
        </div>
        <div className="formgrid">
          <label className="f">Title<input className="in" value={h.title} onChange={(e) => upH({ title: e.target.value })} maxLength={200} /></label>
          <label className="f">Subtitle<input className="in" value={h.subtitle} onChange={(e) => upH({ subtitle: e.target.value })} placeholder="e.g. An incentive journey through Lisbon and the Douro" /></label>
          <label className="f">Client / group name<input className="in" value={h.client_name} onChange={(e) => upH({ client_name: e.target.value })} /></label>
          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
            <label className="f" style={{ flex: 1 }}>Start date<input className="in" type="date" value={h.start_date} onChange={(e) => upH({ start_date: e.target.value })} /></label>
            <label className="f" style={{ width: 110 }}>Travellers<input className="in" type="number" min={1} value={h.pax ?? ""} onChange={(e) => upH({ pax: e.target.value ? Number(e.target.value) : null })} /></label>
          </div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="note" style={{ marginBottom: 6 }}>Countries</legend>
          <div className="row" style={{ gap: 6 }}>
            {COUNTRIES.map((c) => {
              const on = h.destinations.includes(c.code);
              return <button key={c.code} type="button" className="seg" aria-pressed={on} onClick={() => upH({ destinations: on ? h.destinations.filter((x) => x !== c.code) : [...h.destinations, c.code] })}>{c.flag} {c.name}</button>;
            })}
          </div>
        </fieldset>
        <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
          {h.cover_url ? <img src={h.cover_url} alt="Cover" className="ib-thumb" style={{ width: 200, height: 120 }} /> : <div className="ib-thumb" style={{ width: 200, height: 120, display: "grid", placeItems: "center" }}><span className="note">No cover photo</span></div>}
          <div className="stack" style={{ gap: 6 }}>
            <b>Cover photo</b>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm" onClick={() => setPhotoFor({ kind: "cover" })}>Find or upload photo</button>
              {h.cover_url && <button type="button" className="btn sm ghost" onClick={() => upH({ cover_url: "", cover_credit: "" })}>Remove</button>}
            </div>
            {h.cover_credit && <span className="note">{h.cover_credit}</span>}
          </div>
        </div>
        <label className="f">Welcome text<textarea className="in" rows={3} value={h.intro} onChange={(e) => upH({ intro: e.target.value })} placeholder="A few words to welcome the travellers." /></label>
        <label className="f">Contacts during the trip (shown to travellers)<textarea className="in" rows={3} value={h.contacts} onChange={(e) => upH({ contacts: e.target.value })} placeholder={"Sensus duty phone: +351 …\nYour guide: …\nEmergency: 112"} /></label>
        <label className="f netcell" style={{ padding: 8, borderRadius: 6 }}><span>Internal notes <I /></span><textarea className="in" rows={2} value={h.internal_notes} onChange={(e) => upH({ internal_notes: e.target.value })} placeholder="Only the Sensus team sees this." /></label>
      </section>

      {/* AI */}
      <section className="panel pad stack" style={{ gap: 10 }}>
        <div className="spread">
          <div><h3>✨ Build with AI</h3><span className="note">Claude drafts the days with real places and timings. Nothing is saved until you press Save.</span></div>
          <button type="button" className="btn sm" onClick={() => setAiOpen((v) => !v)} disabled={!aiOn}>{aiOpen ? "Close" : "Draft days"}</button>
        </div>
        {!aiOn && <p className="note">AI is switched off until the ANTHROPIC_API_KEY setting is added in Vercel. Everything else works without it.</p>}
        {aiOpen && aiOn && <AiPanel h={h} busy={busy === "ai"} onRun={async (brief, mode) => {
          setBusy("ai");
          const r = await aiDraftDays(brief);
          setBusy(null);
          if (r.error || !r.draft) { setMsg({ error: r.error ?? "AI failed." }); return; }
          const d = r.draft;
          const offset = mode === "append" ? Math.max(0, ...days.map((x) => x.day_number)) : 0;
          const newDays = d.days.map((x) => ({ ...x, day_number: x.day_number + offset }));
          const newItems = d.items.map((x) => ({ ...x, id: uuid(), day_number: x.day_number + offset }));
          if (mode === "replace") { setDays(newDays); setItems(newItems); if (!h.intro && d.intro) upH({ intro: d.intro }); if (!h.subtitle && d.subtitle) upH({ subtitle: d.subtitle }); }
          else { setDays((ds) => [...ds, ...newDays].slice(0, 60)); setItems((xs) => [...xs, ...newItems]); }
          touch();
          setAiOpen(false);
          setMsg({ ok: `${newDays.length} days drafted. Review them, add photos, then Save.` });
        }} />}
      </section>

      {/* days */}
      {days.map((d) => {
        const list = dayItems(d.day_number);
        return (
          <section className="ib-day" key={d.day_number}>
            <div className="ib-dayhead">
              <div className="ib-num"><small>Day</small>{d.day_number}</div>
              <div className="stack" style={{ gap: 8 }}>
                <div className="note">{dayDate(h.start_date, d.day_number, { weekday: "long", day: "numeric", month: "long" }) || "Set a start date to show the dates"}</div>
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <input className="in" value={d.title} onChange={(e) => upDay(d.day_number, { title: e.target.value })} placeholder="Day title, e.g. Arrival in Lisbon" aria-label={`Day ${d.day_number} title`} style={{ fontWeight: 600 }} />
                  <input className="in" value={d.city} onChange={(e) => upDay(d.day_number, { city: e.target.value })} placeholder="City" aria-label={`Day ${d.day_number} city`} style={{ width: 160 }} />
                </div>
                <textarea className="in" rows={2} value={d.description} onChange={(e) => upDay(d.day_number, { description: e.target.value })} placeholder="What the day is about (optional)" aria-label={`Day ${d.day_number} description`} style={{ minHeight: 54 }} />
                <div className="row" style={{ gap: 6 }}>
                  {d.photo_url && <img src={d.photo_url} alt="" className="ib-thumb" style={{ width: 96, height: 60 }} />}
                  <button type="button" className="btn sm" onClick={() => setPhotoFor({ kind: "day", day: d.day_number })}>{d.photo_url ? "Change photo" : "Day photo"}</button>
                  {d.photo_url && <button type="button" className="btn sm ghost" onClick={() => upDay(d.day_number, { photo_url: "", photo_credit: "" })}>Remove photo</button>}
                  {d.city && <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => wiki(d.city, (s) => upDay(d.day_number, { description: d.description || s.extract.split(/(?<=\.)\s/).slice(0, 2).join(" "), ...(!d.photo_url && s.photo ? { photo_url: s.photo, photo_credit: s.credit ?? "" } : {}) }))}>
                    {busy === `wiki:${d.city}` ? <span className="spin" /> : "Fill from Wikipedia"}</button>}
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className="btn sm ghost" onClick={() => swapDays(d.day_number, d.day_number - 1)} disabled={d.day_number === 1} aria-label="Move day up">↑</button>
                <button type="button" className="btn sm ghost" onClick={() => swapDays(d.day_number, d.day_number + 1)} disabled={d.day_number === days.length} aria-label="Move day down">↓</button>
                <button type="button" className="x" onClick={() => removeDay(d.day_number)} aria-label={`Remove day ${d.day_number}`}>✕</button>
              </div>
            </div>

            {list.map((x, idx) => {
              const k = kindOf(x.kind);
              const isOpen = open.has(x.id);
              return (
                <div className="ib-item" key={x.id}>
                  <button type="button" className="ib-sum" onClick={() => toggle(x.id)} aria-expanded={isOpen}>
                    <span className="tm">{x.start_time || "—"}{x.end_time && <><br /><span style={{ fontWeight: 400, fontSize: 11 }}>{x.end_time}</span></>}</span>
                    <span className="ib-ico" aria-hidden>{k.icon}</span>
                    <span style={{ minWidth: 0 }}><span className="t" style={{ display: "block" }}>{x.title || <span className="note">New {k.label.toLowerCase()}</span>}</span>
                      <span className="note" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[k.label, x.location, x.booking_ref && `Ref ${x.booking_ref}`].filter(Boolean).join(" · ")}</span></span>
                    <span className="act note">{isOpen ? "Close" : "Edit"}</span>
                  </button>
                  {isOpen && (
                    <div className="ib-edit">
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <select className="in" value={x.kind} onChange={(e) => upItem(x.id, { kind: e.target.value as Kind })} aria-label="Type" style={{ width: 130 }}>
                          {KINDS.map((kk) => <option key={kk.id} value={kk.id}>{kk.icon} {kk.label}</option>)}
                        </select>
                        <input className="in" value={x.title} onChange={(e) => upItem(x.id, { title: e.target.value })} placeholder={x.kind === "flight" ? "e.g. TAP TP101 São Paulo → Lisbon" : x.kind === "hotel" ? "e.g. Check-in at Pestana Palace" : "Title"} aria-label="Title" autoFocus={!x.title} />
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <label className="f" style={{ width: 110 }}>Starts<input className="in" type="time" value={x.start_time} onChange={(e) => upItem(x.id, { start_time: e.target.value })} /></label>
                        <label className="f" style={{ width: 110 }}>Ends<input className="in" type="time" value={x.end_time} onChange={(e) => upItem(x.id, { end_time: e.target.value })} /></label>
                        <label className="f" style={{ flex: "1 1 180px" }}>Place<input className="in" value={x.location} onChange={(e) => upItem(x.id, { location: e.target.value })} placeholder="e.g. Jerónimos Monastery" /></label>
                        <label className="f" style={{ flex: "1 1 200px" }}>Address<input className="in" value={x.address} onChange={(e) => upItem(x.id, { address: e.target.value })} placeholder="Opens in Google Maps for travellers" /></label>
                      </div>
                      <label className="f">Description<textarea className="in" rows={3} value={x.description} onChange={(e) => upItem(x.id, { description: e.target.value })} /></label>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn sm" disabled={!!busy || !(x.location || x.title)} onClick={() => wiki(x.location || x.title, (s) => upItem(x.id, { description: x.description && !window.confirm("Replace the current description with the Wikipedia text?") ? x.description : s.extract.split(/(?<=\.)\s/).slice(0, 3).join(" "), ...(!x.photo_url && s.photo ? { photo_url: s.photo, photo_credit: s.credit ?? "" } : {}) }))}>
                          {busy === `wiki:${x.location || x.title}` ? <span className="spin" /> : "Fill from Wikipedia"}</button>
                        {aiOn && <button type="button" className="btn sm" disabled={!!busy || !x.title} onClick={() => describe(`ai:${x.id}`, { title: x.title, location: x.location, city: cityOf(x.day_number), current: x.description }, (t) => upItem(x.id, { description: t }))}>
                          {busy === `ai:${x.id}` ? <span className="spin" /> : x.description ? "✨ Polish with AI" : "✨ Write with AI"}</button>}
                        <button type="button" className="btn sm" onClick={() => setPhotoFor({ kind: "item", id: x.id })}>{x.photo_url ? "Change photo" : "Add photo"}</button>
                        {x.photo_url && <button type="button" className="btn sm ghost" onClick={() => upItem(x.id, { photo_url: "", photo_credit: "" })}>Remove photo</button>}
                      </div>
                      {x.photo_url && <div><img src={x.photo_url} alt="" className="ib-thumb" />{x.photo_credit && <span className="note">{x.photo_credit}</span>}</div>}
                      <div className="row" style={{ gap: 8 }}>
                        <label className="f" style={{ flex: "1 1 160px" }}>{x.kind === "flight" ? "Flight number / booking ref" : "Confirmation (shown to travellers)"}<input className="in" value={x.booking_ref} onChange={(e) => upItem(x.id, { booking_ref: e.target.value })} /></label>
                        <label className="f" style={{ flex: "2 1 240px" }}>Link (website, menu, tickets)<input className="in" type="url" value={x.link_url} onChange={(e) => upItem(x.id, { link_url: e.target.value })} placeholder="https://" /></label>
                      </div>
                      <label className="f netcell" style={{ padding: 8, borderRadius: 6 }}><span>Internal notes <I /></span><input className="in" value={x.internal_notes} onChange={(e) => upItem(x.id, { internal_notes: e.target.value })} placeholder="Supplier contact, payment, special requests…" /></label>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn sm ghost" onClick={() => moveItem(x.id, -1)} disabled={idx === 0}>↑ Up</button>
                        <button type="button" className="btn sm ghost" onClick={() => moveItem(x.id, 1)} disabled={idx === list.length - 1}>↓ Down</button>
                        <select className="in" value={x.day_number} onChange={(e) => toDay(x.id, Number(e.target.value))} aria-label="Move to day" style={{ width: "auto" }}>
                          {days.map((dd) => <option key={dd.day_number} value={dd.day_number}>Day {dd.day_number}</option>)}
                        </select>
                        <button type="button" className="btn sm ghost" onClick={() => dupItem(x.id)}>Duplicate</button>
                        <button type="button" className="btn sm ghost" onClick={async () => { const r = await saveToLibrary({ ...x, city: cityOf(x.day_number), country: h.destinations[0] }); setMsg(r.ok ? { ok: `“${x.title}” saved to the library.` } : { error: r.error }); }}>Save to library</button>
                        <button type="button" className="btn sm ghost" style={{ color: "var(--bad)", marginLeft: "auto" }} onClick={() => removeItem(x.id)}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="ib-tools">
              {KINDS.map((kk) => <button key={kk.id} type="button" className="btn sm" onClick={() => addItem(d.day_number, kk.id)}>+ {kk.icon} {kk.label}</button>)}
              <button type="button" className="btn sm" onClick={() => setLibFor(d.day_number)}>+ From library</button>
            </div>
          </section>
        );
      })}
      <div><button type="button" className="btn" onClick={addDay} disabled={days.length >= 60}>+ Add day</button></div>

      <div className="savebar no-print">
        <div className="row" style={{ gap: 8 }}>
          <span className={`chip ${shared ? "good" : status === "Archived" ? "" : "warn"}`}>{status}</span>
          {msg?.ok && <span className="okmsg">{msg.ok}</span>}
          {msg?.error && <span className="err">{msg.error}</span>}
          {!msg && dirty && <span className="note">Unsaved changes</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn" href={`/itineraries/${id}/preview`} target="_blank" rel="noreferrer" onClick={(e) => { if (dirty) { e.preventDefault(); save(() => window.open(`/itineraries/${id}/preview`, "_blank")); } }}>Preview</a>
          {shared ? (
            <>
              <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(shareUrl); setMsg({ ok: "Client link copied." }); }}>Copy client link</button>
              <button type="button" className="btn ghost" onClick={() => setStatus("Draft")} disabled={pending}>Stop sharing</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setStatus("Shared")} disabled={pending}>Share with client</button>
          )}
          <button type="button" className="btn primary" onClick={() => save()} disabled={pending}>{pending ? <><span className="spin" /> Saving…</> : "Save"}</button>
        </div>
      </div>

      {photoFor && <PhotoPicker itineraryId={id} initialQuery={photoQuery(photoFor)} onPick={pickPhoto} onClose={() => setPhotoFor(null)} />}
      {libFor !== null && <LibraryPicker onClose={() => setLibFor(null)} onPick={(l) => {
        addItem(libFor, (KINDS.some((k) => k.id === l.kind) ? l.kind : "activity") as Kind, {
          title: l.title, location: l.location ?? "", address: l.address ?? "", description: l.description ?? "", photo_url: l.photo_url ?? "", photo_credit: l.photo_credit ?? "", link_url: l.link_url ?? "",
        });
        setLibFor(null);
      }} />}
    </div>
  );
}

function AiPanel({ h, busy, onRun }: { h: ItHeader; busy: boolean; onRun: (brief: { destinations: string; days: number; pax: number | null; start_date: string | null; style: string; notes: string; kind: string }, mode: "replace" | "append") => void }) {
  const [dest, setDest] = useState(h.destinations.map((c) => COUNTRIES.find((x) => x.code === c)?.name ?? c).join(", "));
  const [n, setN] = useState(4);
  const [kind, setKind] = useState("leisure");
  const [style, setStyle] = useState("");
  const [notes, setNotes] = useState("");
  const run = (mode: "replace" | "append") => onRun({ destinations: dest, days: n, pax: h.pax, start_date: h.start_date || null, style, notes, kind }, mode);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <label className="f" style={{ flex: "2 1 220px" }}>Where<input className="in" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="e.g. Lisbon, Sintra and the Douro Valley" /></label>
        <label className="f" style={{ width: 90 }}>Days<input className="in" type="number" min={1} max={30} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
        <label className="f" style={{ width: 150 }}>Type<select className="in" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="leisure">Leisure</option><option value="incentive (MICE)">Incentive (MICE)</option><option value="corporate meeting / congress (MICE)">Meeting / congress</option><option value="honeymoon">Honeymoon</option><option value="family">Family</option></select></label>
      </div>
      <label className="f">Style and interests<input className="in" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. luxury, gastronomy and wine, slow pace, art, team-building" /></label>
      <label className="f">Client notes (optional)<textarea className="in" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste the client's brief or email here." /></label>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary" disabled={busy || !dest} onClick={() => run("replace")}>{busy ? <><span className="spin" /> Drafting… (up to a minute)</> : "Draft and replace all days"}</button>
        <button type="button" className="btn" disabled={busy || !dest} onClick={() => run("append")}>Add after the last day</button>
      </div>
    </div>
  );
}

function PhotoPicker({ itineraryId, initialQuery, onPick, onClose }: { itineraryId: string; initialQuery: string; onPick: (url: string, credit: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(initialQuery);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [loading, setLoading] = useState(!!initialQuery);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const search = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true); setErr(null);
    const r = await findPhotos(query);
    setPhotos(r.photos);
    setLoading(false);
  };
  useEffect(() => {
    if (!initialQuery) return;
    let on = true;
    findPhotos(initialQuery).then((r) => { if (on) { setPhotos(r.photos); setLoading(false); } });
    return () => { on = false; };
  }, [initialQuery]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic)$/.test(file.type)) { setErr("Choose a JPG, PNG or WebP photo."); return; }
    setLoading(true); setErr(null);
    const blob = await shrink(file);
    const path = `${itineraryId}/${uuid()}.jpg`;
    const sb = supabaseBrowser();
    const { error } = await sb.storage.from("itinerary-media").upload(path, blob, { contentType: "image/jpeg" });
    setLoading(false);
    if (error) { setErr("Upload failed. Has the itinerary database step been run?"); return; }
    onPick(sb.storage.from("itinerary-media").getPublicUrl(path).data.publicUrl, "");
  };
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Choose a photo" style={{ width: "min(860px,100%)" }}>
        <div className="spread"><h3>Choose a photo</h3><button type="button" className="x" onClick={onClose} aria-label="Close">✕</button></div>
        <form className="row" style={{ gap: 8, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); void search(q); }}>
          <input className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search free photos, e.g. Douro Valley vineyards" aria-label="Search photos" autoFocus />
          <button className="btn primary">Search</button>
        </form>
        <p className="note">Free-to-use photos from Wikimedia Commons. The photographer&apos;s credit is shown under the photo in the client&apos;s itinerary.</p>
        {loading && <div className="empty"><span className="spin" /> Loading…</div>}
        {err && <p className="err">{err}</p>}
        {photos && !loading && (photos.length ? (
          <div className="photogrid">
            {photos.map((p) => <button key={p.url} type="button" onClick={() => onPick(p.url, p.credit)} title={p.credit}><img src={p.thumb} alt="" loading="lazy" /><span>{p.credit}</span></button>)}
          </div>
        ) : <p className="note">No photos found. Try a broader search, e.g. the city name.</p>)}
        <div className="row" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <label className="btn">Upload from this device<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} /></label>
          <span className="note">or paste a link:</span>
          <input className="in" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…jpg" style={{ flex: 1, minWidth: 160 }} aria-label="Photo link" />
          <button type="button" className="btn" disabled={!/^https:\/\//.test(url)} onClick={() => onPick(url, "")}>Use link</button>
        </div>
      </div>
    </div>
  );
}

function LibraryPicker({ onPick, onClose }: { onPick: (l: LibItem) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<LibItem[] | null>(null);
  const load = async (s: string) => setList((await searchLibrary(s)).items);
  useEffect(() => {
    let on = true;
    searchLibrary("").then((r) => { if (on) setList(r.items); });
    return () => { on = false; };
  }, []);
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Library" style={{ width: "min(640px,100%)" }}>
        <div className="spread"><h3>Content library</h3><button type="button" className="x" onClick={onClose} aria-label="Close">✕</button></div>
        <form className="row" style={{ gap: 8, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); void load(q); }}>
          <input className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hotels, restaurants, visits…" aria-label="Search library" autoFocus />
          <button className="btn primary">Search</button>
        </form>
        {list === null ? <div className="empty"><span className="spin" /></div> : list.length ? (
          <ul className="agenda">
            {list.map((l) => (
              <li key={l.id} style={{ gridTemplateColumns: "32px 1fr auto auto" }}>
                <span className="ib-ico">{kindOf(l.kind).icon}</span>
                <div style={{ minWidth: 0 }}><b>{l.title}</b><div className="note">{[l.location, l.city].filter(Boolean).join(" · ")}</div></div>
                <button type="button" className="btn sm primary" onClick={() => onPick(l)}>Add</button>
                <button type="button" className="x" aria-label={`Delete ${l.title} from library`} onClick={async () => { if (window.confirm(`Delete “${l.title}” from the library?`)) { await deleteFromLibrary(l.id); void load(q); } }}>✕</button>
              </li>
            ))}
          </ul>
        ) : <p className="note">Nothing in the library yet. Open an item in any itinerary and press “Save to library” to reuse it later.</p>}
      </div>
    </div>
  );
}
