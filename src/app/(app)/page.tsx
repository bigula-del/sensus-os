import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { holidaysBetween, type Holiday } from "@/lib/holidays";
import { setDone } from "./calendar/actions";
import { NewsPanel, NewsSkeleton } from "./news-panel";
import { QuickPanel } from "./quick-panel";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lisbonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });

type Ev = { id: string; starts_on: string; starts_at: string | null; title: string; kind: string; owner_id: string | null };
type Pr = { id: string; code: string; title: string; start_date: string | null; end_date: string | null };

/** Groups holidays that fall on the same day with the same name (e.g. Christmas in ten countries). */
function grouped(list: Holiday[]) {
  const out: { date: string; name: string; flags: string; countries: string[]; local: string[] }[] = [];
  for (const h of list) {
    const g = out.find((o) => o.date === h.date && o.name === h.name);
    if (g) { g.flags += h.flag; g.countries.push(h.country); if (h.local !== h.name && !g.local.includes(h.local)) g.local.push(h.local); }
    else out.push({ date: h.date, name: h.name, flags: h.flag, countries: [h.country], local: h.local !== h.name ? [h.local] : [] });
  }
  return out;
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ cm?: string; news?: string }> }) {
  const sp = await searchParams;
  const { sb, user, profile } = await requireStaff();
  const today = lisbonToday();
  const month = sp.cm && /^\d{4}-\d{2}$/.test(sp.cm) ? sp.cm : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const from = iso(cells[0]!), to = iso(cells[41]!);
  const prev = iso(new Date(y, m - 2, 1)).slice(0, 7), next = iso(new Date(y, m, 1)).slice(0, 7);
  const in30 = iso(new Date(new Date(today + "T12:00:00").getTime() + 30 * 864e5));
  const in60 = iso(new Date(new Date(today + "T12:00:00").getTime() + 60 * 864e5));
  const lo = from < today ? from : today, hi = to > in30 ? to : in30;

  const [{ data: leads }, { data: evs }, { data: projs }, { data: notes }, { data: reminders }] = await Promise.all([
    sb.from("leads").select("id, stage, estimated_value_eur"),
    sb.from("events").select("id, starts_on, starts_at, title, kind, owner_id").gte("starts_on", lo).lte("starts_on", hi).eq("done", false).order("starts_on").order("starts_at", { nullsFirst: true }).returns<Ev[]>(),
    sb.from("projects").select("id, code, title, start_date, end_date").neq("status", "Cancelled").lte("start_date", hi).gte("end_date", lo).returns<Pr[]>(),
    sb.from("notes").select("id, title, body, updated_at").eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(6),
    sb.from("events").select("id, title, starts_on, starts_at").eq("kind", "reminder").eq("done", false).eq("owner_id", user.id).lte("starts_on", in60).order("starts_on").order("starts_at", { nullsFirst: true }).limit(12),
  ]);
  const events = evs ?? [];
  const projects = projs ?? [];
  const open = (leads ?? []).filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const won = (leads ?? []).filter((l) => l.stage === "Won");
  const sum = (xs: { estimated_value_eur: number | null }[]) => xs.reduce((a, l) => a + Number(l.estimated_value_eur ?? 0), 0);
  const first_name = profile.full_name.split(" ")[0];
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Lisbon" }));

  const monthHolidays = holidaysBetween(from, to);
  const nextHolidays = grouped(holidaysBetween(today, in60));
  const coming = [
    ...events.filter((e) => e.starts_on >= today && e.starts_on <= in30).map((e) => ({ key: e.id, date: e.starts_on, time: e.starts_at?.slice(0, 5) ?? "", title: e.title, kind: e.kind, href: `/calendar?m=${e.starts_on.slice(0, 7)}&ev=${e.id}`, done: e.id })),
    ...projects.filter((p) => p.start_date && p.start_date >= today && p.start_date <= in30).map((p) => ({ key: `p${p.id}`, date: p.start_date!, time: "", title: `#${p.code} ${p.title} starts`, kind: "project", href: `/projects/${p.id}`, done: "" })),
    ...projects.filter((p) => p.end_date && p.end_date >= today && p.end_date <= in30 && p.end_date !== p.start_date).map((p) => ({ key: `e${p.id}`, date: p.end_date!, time: "", title: `#${p.code} ${p.title} ends`, kind: "project", href: `/projects/${p.id}`, done: "" })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 14);
  const inOperation = projects.filter((p) => p.start_date && p.end_date && p.start_date <= today && p.end_date >= today);
  const monthTitle = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const keep = sp.news ? `&news=${sp.news}` : "";

  return (
    <>
      <div className="head">
        <div>
          <h1>{hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening"}, {first_name}</h1>
          <p className="sub">{new Date(today + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Lisbon</p>
        </div>
        <div className="row">
          <Link className="btn" href="/itineraries">Itineraries</Link>
          <Link className="btn primary" href="/pipeline/new">+ New lead</Link>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">Open pipeline</div><div className="v">{money(sum(open))}</div><div className="n">{open.length} leads</div></div>
        <div className="kpi"><div className="l">Won</div><div className="v">{money(sum(won))}</div><div className="n">{won.length} programmes</div></div>
        <div className="kpi"><div className="l">Awaiting client</div><div className="v">{open.filter((l) => l.stage === "Proposal sent" || l.stage === "Negotiation").length}</div><div className="n">proposals sent or in negotiation</div></div>
        <div className="kpi"><div className="l">In operation</div><div className="v">{inOperation.length}</div><div className="n">{inOperation.length ? inOperation.map((p) => `#${p.code}`).join(", ") : "no group on the ground today"}</div></div>
      </div>

      <div className="home">
        <div>
          <section className="panel">
            <header>
              <h3>{monthTitle}</h3>
              <div className="row" style={{ gap: 6 }}>
                <Link className="btn sm" href={`/?cm=${prev}${keep}`} scroll={false} aria-label="Previous month">←</Link>
                {month !== today.slice(0, 7) && <Link className="btn sm ghost" href={`/?${keep.slice(1)}`} scroll={false}>Today</Link>}
                <Link className="btn sm" href={`/?cm=${next}${keep}`} scroll={false} aria-label="Next month">→</Link>
                <Link className="btn sm" href={`/calendar?m=${month}`}>Full calendar</Link>
              </div>
            </header>
            <div className="minical">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div className="dow" key={d}>{d}</div>)}
              {cells.map((d) => {
                const k = iso(d);
                const dayEvs = events.filter((e) => e.starts_on === k);
                const dayPr = projects.filter((p) => p.start_date && p.end_date && p.start_date <= k && p.end_date >= k);
                const dayHol = monthHolidays.filter((h) => h.date === k);
                const tip = [...dayPr.map((p) => `#${p.code} ${p.title}`), ...dayEvs.map((e) => `${e.starts_at ? e.starts_at.slice(0, 5) + " " : ""}${e.title}`), ...dayHol.map((h) => `${h.flag} ${h.name}`)].join("\n");
                return (
                  <Link key={k} href={`/calendar?m=${k.slice(0, 7)}&add=1&date=${k}`} className={`${d.getMonth() !== m - 1 ? "out" : ""} ${k === today ? "today" : ""}`} title={tip || "Add on this day"}>
                    <span className="n">{d.getDate()}</span>
                    {(dayPr.length > 0 || dayEvs.length > 0) && (
                      <span className="dots" aria-hidden>
                        {dayPr.slice(0, 3).map((p) => <i key={p.id} style={{ "--c": "var(--ink)" } as React.CSSProperties} />)}
                        {dayEvs.slice(0, 4).map((e) => <i key={e.id} style={{ "--c": e.kind === "meeting" ? "var(--info)" : e.kind === "reminder" ? "var(--warn)" : "var(--ink)" } as React.CSSProperties} />)}
                      </span>
                    )}
                    {dayHol.length > 0 && <span className="flags" aria-label={`Holiday in ${dayHol.map((h) => h.country).join(", ")}`}>{[...new Set(dayHol.map((h) => h.flag))].slice(0, 4).join("")}{dayHol.length > 4 ? "+" : ""}</span>}
                  </Link>
                );
              })}
            </div>
            <div className="legend" style={{ padding: "0 16px 12px" }}>
              <span style={{ "--c": "var(--ink)" } as React.CSSProperties}>Project</span>
              <span style={{ "--c": "var(--info)" } as React.CSSProperties}>Meeting</span>
              <span style={{ "--c": "var(--warn)" } as React.CSSProperties}>Reminder</span>
              <span className="note" style={{ marginLeft: "auto" }}>Flags = public holiday. Hover a day for details.</span>
            </div>
          </section>

          <section className="panel">
            <header><h3>Coming up · next 30 days</h3><Link className="btn sm" href="/calendar?add=1">+ Event</Link></header>
            {coming.length ? (
              <ul className="agenda">
                {coming.map((e) => (
                  <li key={e.key}>
                    <span className="tm">{e.date === today ? "Today" : shortDate(e.date, { weekday: "short", day: "numeric", month: "short" })}<div className="note">{e.time}</div></span>
                    <Link href={e.href} style={{ textDecoration: "none" }}>{e.title} <span className={`chip ${e.kind === "meeting" ? "info" : e.kind === "reminder" ? "warn" : ""}`}>{e.kind}</span></Link>
                    {e.done ? <form action={setDone}><input type="hidden" name="id" value={e.done} /><button className="btn sm">Done</button></form> : <span />}
                  </li>
                ))}
              </ul>
            ) : <div className="empty">Nothing in the next 30 days. <Link href="/calendar?add=1">Add an event</Link></div>}
          </section>
        </div>

        <div>
          <QuickPanel notes={notes ?? []} reminders={reminders ?? []} today={today} />
          <section className="panel">
            <header><h3>Public holidays · next 60 days</h3></header>
            {nextHolidays.length ? (
              <ul className="hol">
                {nextHolidays.map((h) => (
                  <li key={h.date + h.name}>
                    <span className="tm" style={{ fontWeight: 600 }}>{shortDate(h.date)}<div className="note">{new Date(h.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" })}</div></span>
                    <div>
                      <div>{h.name}</div>
                      <div className="flags" title={h.countries.join(", ")}>{h.flags} <span className="note" style={{ letterSpacing: 0 }}>{h.countries.length > 2 ? `${h.countries.length} countries` : h.countries.join(", ")}{h.local.length ? ` · ${h.local.join(" / ")}` : ""}</span></div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <div className="empty">No public holidays in the next 60 days.</div>}
          </section>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Suspense key={sp.news ?? "PT"} fallback={<NewsSkeleton />}>
          <NewsPanel country={sp.news ?? "PT"} />
        </Suspense>
      </div>
    </>
  );
}
