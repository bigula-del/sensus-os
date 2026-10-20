import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { setDone } from "./calendar/actions";

export default async function TodayPage() {
  const { sb, profile } = await requireStaff();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("id, stage, estimated_value_eur"),
    sb.from("events").select("id, starts_on, starts_at, title, kind").gte("starts_on", today).eq("done", false).order("starts_on").order("starts_at", { nullsFirst: true }).limit(10),
  ]);
  const open = (leads ?? []).filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const won = (leads ?? []).filter((l) => l.stage === "Won");
  const sum = (xs: { estimated_value_eur: number | null }[]) => xs.reduce((a, l) => a + Number(l.estimated_value_eur ?? 0), 0);
  const first = profile.full_name.split(" ")[0];
  const hour = new Date().getHours();

  return (
    <>
      <div className="head">
        <div>
          <h1>{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, {first}</h1>
          <p className="sub">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Link className="btn primary" href="/pipeline/new">+ New lead</Link>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">Open pipeline</div><div className="v">{money(sum(open))}</div><div className="n">{open.length} leads</div></div>
        <div className="kpi"><div className="l">Won</div><div className="v">{money(sum(won))}</div><div className="n">{won.length} programmes</div></div>
        <div className="kpi"><div className="l">Awaiting client</div><div className="v">{open.filter((l) => l.stage === "Proposal sent" || l.stage === "Negotiation").length}</div><div className="n">proposals sent or in negotiation</div></div>
        <div className="kpi"><div className="l">Coming up</div><div className="v">{events?.length ?? 0}</div><div className="n">reminders and events</div></div>
      </div>
      <section className="panel">
        <header><h3>Coming up</h3><Link className="btn sm" href="/calendar?add=1">+ Reminder</Link></header>
        {events?.length ? (
          <ul className="agenda">
            {events.map((e) => (
              <li key={e.id}>
                <span className="tm">{e.starts_on === today ? "Today" : shortDate(e.starts_on)}<div className="note">{e.starts_at ? e.starts_at.slice(0, 5) : ""}</div></span>
                <Link href={`/calendar?m=${e.starts_on.slice(0, 7)}&ev=${e.id}`} style={{ textDecoration: "none" }}>{e.title} <span className={`chip ${e.kind === "meeting" ? "info" : e.kind === "reminder" ? "warn" : ""}`}>{e.kind}</span></Link>
                <form action={setDone}><input type="hidden" name="id" value={e.id} /><button className="btn sm">Done</button></form>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">Nothing coming up. <Link href="/calendar?add=1">Add a reminder</Link></div>
        )}
      </section>
    </>
  );
}
