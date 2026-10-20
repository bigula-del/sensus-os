import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { holidaysBetween } from "@/lib/holidays";
import { deleteEvent, setDone } from "./actions";
import { EventForm } from "./event-form";

export const metadata: Metadata = { title: "Calendar" };

type Ev = { id: string; starts_on: string; starts_at: string | null; title: string; kind: string; done: boolean; project_id: string | null; lead_id: string | null;
  projects: { code: string; title: string } | null; leads: { number: number | null; title: string } | null; profiles: { full_name: string } | null };
type Pr = { id: string; code: string; title: string; start_date: string | null; end_date: string | null; status: string };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; add?: string; date?: string; ev?: string; mine?: string; project?: string }> }) {
  const sp = await searchParams;
  const { sb, user } = await requireStaff();
  const now = new Date();
  const today = iso(now);
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const from = iso(cells[0]), to = iso(cells[41]);
  const prev = iso(new Date(y, m - 2, 1)).slice(0, 7), next = iso(new Date(y, m, 1)).slice(0, 7);

  let evq = sb.from("events").select("id, starts_on, starts_at, title, kind, done, project_id, lead_id, projects(code, title), leads(number, title), profiles!events_owner_id_fkey(full_name)")
    .gte("starts_on", from).lte("starts_on", to).order("starts_on").order("starts_at", { nullsFirst: true });
  if (sp.mine) evq = evq.eq("owner_id", user.id);
  const [{ data: evs }, { data: projs }, { data: upcoming }, { data: allProjects }, { data: leads }, { data: people }] = await Promise.all([
    evq.returns<Ev[]>(),
    sb.from("projects").select("id, code, title, start_date, end_date, status").neq("status", "Cancelled").lte("start_date", to).gte("end_date", from).returns<Pr[]>(),
    sb.from("events").select("id, starts_on, starts_at, title, kind").gte("starts_on", today).eq("done", false).order("starts_on").order("starts_at", { nullsFirst: true }).limit(10),
    sb.from("projects").select("id, code, title").in("status", ["Confirmed", "In operation"]).order("start_date"),
    sb.from("leads").select("id, number, title").not("stage", "in", "(Won,Lost)").order("created_at", { ascending: false }).limit(100),
    sb.from("profiles").select("id, full_name").neq("role", "client").eq("active", true).order("full_name"),
  ]);
  const events = evs ?? [];
  const hols = holidaysBetween(from, to);
  const sel = sp.ev ? events.find((e) => e.id === sp.ev) : null;
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const href = (q: Record<string, string>) => `/calendar?${new URLSearchParams({ m: month, ...(sp.mine ? { mine: "1" } : {}), ...q })}`;

  return (
    <>
      <div className="head">
        <div><h1>Calendar</h1><p className="sub">Meetings, reminders and every project&apos;s days in one place.</p></div>
        <div className="row">
          <Link className="btn" href={`/calendar?m=${prev}${sp.mine ? "&mine=1" : ""}`} aria-label="Previous month">←</Link>
          <b style={{ minWidth: 130, textAlign: "center" }}>{title}</b>
          <Link className="btn" href={`/calendar?m=${next}${sp.mine ? "&mine=1" : ""}`} aria-label="Next month">→</Link>
          {month !== today.slice(0, 7) && <Link className="btn ghost" href="/calendar">Today</Link>}
          <Link className="btn primary" href={href({ add: "1", date: today >= from && today <= to && month === today.slice(0, 7) ? today : `${month}-01` })}>+ Event or reminder</Link>
        </div>
      </div>

      {sp.add && (
        <EventForm date={sp.date || today} me={user.id} presetProject={sp.project}
          projects={(allProjects ?? []).map((p) => ({ id: p.id, label: `#${p.code} · ${p.title}` }))}
          leads={(leads ?? []).map((l) => ({ id: l.id, label: `${l.number ? `#${l.number} · ` : ""}${l.title}` }))}
          people={(people ?? []).map((p) => ({ id: p.id, label: p.id === user.id ? `${p.full_name} (me)` : p.full_name }))} />
      )}

      {sel && (
        <section className="panel pad stack" style={{ marginBottom: 16 }}>
          <div className="spread"><div className="chips"><span className={`chip ${sel.kind === "meeting" ? "info" : sel.kind === "reminder" ? "warn" : ""}`}>{sel.kind}</span>{sel.done && <span className="chip good">Done</span>}</div>
            <Link className="btn ghost sm" href={href({})}>Close</Link></div>
          <h2>{sel.title}</h2>
          <dl className="kv">
            <dt>When</dt><dd>{shortDate(sel.starts_on, { weekday: "long", day: "numeric", month: "long" })}{sel.starts_at ? `, ${sel.starts_at.slice(0, 5)}` : ""}</dd>
            {sel.profiles && <><dt>For</dt><dd>{sel.profiles.full_name}</dd></>}
            {sel.projects && <><dt>Project</dt><dd><Link href={`/projects/${sel.project_id}`}>#{sel.projects.code} · {sel.projects.title}</Link></dd></>}
            {sel.leads && <><dt>Lead</dt><dd><Link href={`/pipeline/${sel.lead_id}`}>{sel.leads.number ? `#${sel.leads.number} · ` : ""}{sel.leads.title}</Link></dd></>}
          </dl>
          <div className="row">
            <form action={setDone}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="done" value={sel.done ? "false" : "true"} /><button className="btn">{sel.done ? "Mark not done" : "Mark done"}</button></form>
            <form action={deleteEvent}><input type="hidden" name="id" value={sel.id} /><button className="btn ghost">Delete</button></form>
          </div>
        </section>
      )}

      <div className="legend" style={{ marginBottom: 10 }}>
        <span style={{ "--c": "var(--ink)" } as React.CSSProperties}>Project</span>
        <span style={{ "--c": "var(--info)" } as React.CSSProperties}>Meeting</span>
        <span style={{ "--c": "var(--warn)" } as React.CSSProperties}>Reminder</span>
        <span style={{ "--c": "var(--good)" } as React.CSSProperties}>Public holiday (10 countries)</span>
        <Link className="seg" href={sp.mine ? `/calendar?m=${month}` : `/calendar?m=${month}&mine=1`} aria-pressed={!!sp.mine} style={{ marginLeft: "auto" }}>Only mine</Link>
      </div>
      <div className="side side-r">
        <div className="panel" style={{ overflow: "hidden" }}>
          <div className="cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div className="dow" key={d}>{d}</div>)}
            {cells.map((d) => {
              const k = iso(d);
              const dayEvs = events.filter((e) => e.starts_on === k);
              const dayProjects = (projs ?? []).filter((p) => p.start_date && p.end_date && p.start_date <= k && p.end_date >= k);
              return (
                <div key={k} className={`cell ${d.getMonth() !== m - 1 ? "out" : ""} ${k === today ? "today" : ""}`}>
                  <Link className="dn" href={href({ add: "1", date: k })} title="Add on this day" style={{ textDecoration: "none" }}>{d.getDate()}</Link>
                  {Object.entries(hols.filter((h) => h.date === k).reduce<Record<string, string[]>>((a, h) => ((a[h.name] ??= []).push(h.flag), a), {})).map(([name, flags]) => (
                    <span key={name} className="ev holiday" title={`Public holiday: ${name}`}>{flags.join("")} {name}</span>
                  ))}
                  {dayProjects.map((p) => <Link key={p.id} className="ev project" href={`/projects/${p.id}`} title={`#${p.code} ${p.title}`}>#{p.code} {p.title}</Link>)}
                  {dayEvs.map((e) => (
                    <Link key={e.id} className={`ev ${e.kind}`} href={href({ ev: e.id })} title={e.title} style={e.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                      {e.starts_at ? `${e.starts_at.slice(0, 5)} ` : ""}{e.title}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <section className="panel">
          <header><h3>Coming up</h3></header>
          {upcoming?.length ? (
            <ul className="agenda">
              {upcoming.map((e) => (
                <li key={e.id} style={{ gridTemplateColumns: "60px 1fr" }}>
                  <span className="tm">{shortDate(e.starts_on)}<div className="note">{e.starts_at ? e.starts_at.slice(0, 5) : "All day"}</div></span>
                  <Link className={`ev ${e.kind}`} href={`/calendar?m=${e.starts_on.slice(0, 7)}&ev=${e.id}`} style={{ whiteSpace: "normal" }}>{e.title}</Link>
                </li>
              ))}
            </ul>
          ) : <div className="empty">Nothing coming up. Add a reminder with the button above.</div>}
        </section>
      </div>
      <p className="note">Click a day number to add something on that day. Reminders appear on Today. Public holidays are shown for Portugal, Spain, France, Italy, Cape Verde, Brazil, Argentina, Chile, Colombia and Mexico.</p>
    </>
  );
}
