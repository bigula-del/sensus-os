/**
 * Destination news from Google News (public RSS, no account needed), refreshed every 30 minutes.
 * Two feeds per country: tourism news in the local language, and travel alerts (strikes, airports,
 * weather, protests) that can affect operations.
 */
type Edition = { hl: string; gl: string; ceid: string };
const EN: Edition = { hl: "en-GB", gl: "GB", ceid: "GB:en" };
const ED: Record<string, { edition: Edition; tourism: string; alerts: string }> = {
  PT: { edition: { hl: "pt-PT", gl: "PT", ceid: "PT:pt-150" }, tourism: "turismo Portugal", alerts: "Portugal (greve OR aeroporto OR \"alerta meteorológico\" OR manifestação) viagens" },
  ES: { edition: { hl: "es", gl: "ES", ceid: "ES:es" }, tourism: "turismo España", alerts: "España (huelga OR aeropuerto OR \"alerta meteorológica\" OR manifestación) viajeros" },
  FR: { edition: { hl: "fr", gl: "FR", ceid: "FR:fr" }, tourism: "tourisme France", alerts: "France (grève OR aéroport OR \"vigilance météo\" OR manifestation) voyageurs" },
  IT: { edition: { hl: "it", gl: "IT", ceid: "IT:it" }, tourism: "turismo Italia", alerts: "Italia (sciopero OR aeroporto OR \"allerta meteo\" OR manifestazione) viaggiatori" },
  CV: { edition: { hl: "pt-PT", gl: "PT", ceid: "PT:pt-150" }, tourism: "\"Cabo Verde\" turismo", alerts: "\"Cabo Verde\" (voos OR aeroporto OR greve OR TACV OR \"Cabo Verde Airlines\")" },
  BR: { edition: { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" }, tourism: "turismo Brasil", alerts: "Brasil (greve OR aeroporto OR \"alerta\" OR temporal) viajantes" },
  AR: { edition: { hl: "es-419", gl: "AR", ceid: "AR:es-419" }, tourism: "turismo Argentina", alerts: "Argentina (paro OR aeropuerto OR \"alerta meteorológica\" OR huelga) vuelos" },
  CL: { edition: { hl: "es-419", gl: "CL", ceid: "CL:es-419" }, tourism: "turismo Chile", alerts: "Chile (paro OR aeropuerto OR alerta OR huelga) vuelos" },
  CO: { edition: { hl: "es-419", gl: "CO", ceid: "CO:es-419" }, tourism: "turismo Colombia", alerts: "Colombia (paro OR aeropuerto OR alerta OR huelga) vuelos" },
  MX: { edition: { hl: "es-419", gl: "MX", ceid: "MX:es-419" }, tourism: "turismo México", alerts: "México (huelga OR aeropuerto OR alerta OR huracán) vuelos" },
};
export const INDUSTRY = { edition: EN, query: "(MICE OR \"incentive travel\" OR \"business events\" OR \"destination management\")" };

export type NewsItem = { title: string; link: string; source: string; date: string };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
const tag = (xml: string, t: string) => decode(xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");

async function feed(query: string, ed: Edition, days = 7, max = 8): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&hl=${ed.hl}&gl=${ed.gl}&ceid=${ed.ceid}`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 SensusOS/1.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split("<item>").slice(1).map((chunk) => {
      const source = tag(chunk, "source");
      let title = tag(chunk, "title");
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const link = tag(chunk, "link");
      const d = new Date(tag(chunk, "pubDate"));
      return { title, link, source, date: isNaN(+d) ? "" : d.toISOString() };
    });
    const seen = new Set<string>();
    return items
      .filter((i) => i.title && /^https:\/\//.test(i.link) && !seen.has(i.title.toLowerCase()) && seen.add(i.title.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, max);
  } catch {
    return [];
  }
}

export async function destinationNews(country: string) {
  const c = ED[country] ?? ED.PT!;
  const [tourism, alerts] = await Promise.all([feed(c.tourism, c.edition), feed(c.alerts, c.edition, 3, 6)]);
  return { tourism, alerts };
}

export async function industryNews() {
  return feed(INDUSTRY.query, INDUSTRY.edition, 7, 6);
}
