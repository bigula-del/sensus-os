import Link from "next/link";
import { COUNTRIES, countryOf } from "@/lib/holidays";
import { destinationNews, industryNews, type NewsItem } from "@/lib/news";

const ago = (iso: string) => {
  if (!iso) return "";
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5));
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

function List({ items, empty }: { items: NewsItem[]; empty: string }) {
  if (!items.length) return <p className="note" style={{ padding: "8px 16px 14px" }}>{empty}</p>;
  return (
    <ul>
      {items.map((n) => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noreferrer noopener">{n.title}<span className="note">{n.source}{n.date ? ` · ${ago(n.date)}` : ""}</span></a>
        </li>
      ))}
    </ul>
  );
}

/** Destination news window: tourism news and travel alerts per country, plus MICE industry news. */
export async function NewsPanel({ country }: { country: string }) {
  const c = countryOf(country) ?? COUNTRIES[0];
  const [{ tourism, alerts }, industry] = await Promise.all([destinationNews(c.code), industryNews()]);
  return (
    <section className="panel">
      <header><h3>Destination news</h3><span className="note">Google News · refreshed every 30 min</span></header>
      <nav className="ctabs" aria-label="Country">
        {COUNTRIES.map((x) => (
          <Link key={x.code} className="seg" href={`/?news=${x.code}`} scroll={false} aria-pressed={x.code === c.code} title={x.name}>{x.flag} {x.code}</Link>
        ))}
      </nav>
      <div className="news">
        <div>
          <h4>{c.flag} Tourism in {c.name}</h4>
          <List items={tourism} empty="No tourism news this week, or the news service could not be reached." />
        </div>
        <div>
          <h4>⚠ Travel alerts · last 3 days</h4>
          <List items={alerts} empty="No strikes, airport or weather alerts found." />
          <h4>MICE &amp; events industry</h4>
          <List items={industry} empty="No industry news right now." />
        </div>
      </div>
    </section>
  );
}

export function NewsSkeleton() {
  return (
    <section className="panel">
      <header><h3>Destination news</h3></header>
      <div className="empty"><span className="spin" /> Loading news…</div>
    </section>
  );
}
