import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";

export default async function TodayPage() {
  const { sb, profile } = await requireStaff();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("id, stage, estimated_value_eur"),
    sb.from("events").select("id, starts_on, starts_at, title, kind").gte("starts_on", today).eq("done", false).order("starts_on").limit(8),
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
        <header><h3>Coming up</h3></header>
        {events?.length ? (
          <ul className="agenda">
            {events.map((e) => (
              <li key={e.id}><span className="tm">{shortDate(e.starts_on)}</span><span>{e.title}</span><span className="chip">{e.kind}</span></li>
            ))}
          </ul>
        ) : (
          <div className="empty">Nothing scheduled yet. The calendar arrives in the next build step.</div>
        )}
      </section>
    </>
  );
}
