/**
 * Content from the internet for itineraries: descriptions from Wikipedia and freely licensed photos
 * from Wikimedia Commons (with the photographer's credit). No account or key needed.
 */
const UA = { "user-agent": "SensusOS/1.0 (https://sensus-os.vercel.app) itinerary builder", "api-user-agent": "SensusOS/1.0 (https://sensus-os.vercel.app)" };
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

export type Photo = { url: string; thumb: string; credit: string; page: string; width: number; height: number };
export type WikiSummary = { title: string; extract: string; photo: string | null; credit: string | null; page: string };

async function getJson<T>(u: string): Promise<T | null> {
  try {
    const res = await fetch(u, { headers: UA, next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Photos for a place or experience, landscape first, at most 12. */
export async function searchPhotos(q: string): Promise<Photo[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "24",
    prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "1600", iiextmetadatafilter: "Artist|LicenseShortName",
  }).toString();
  type Page = { title: string; index?: number; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; width: number; height: number; extmetadata?: { Artist?: { value: string }; LicenseShortName?: { value: string } } }[] };
  const j = await getJson<{ query?: { pages?: Record<string, Page> } }>(u.toString());
  const pages = Object.values(j?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: Photo[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.width < 900 || !/\.(jpe?g|png|webp)$/i.test(ii.url)) continue;
    const artist = strip(ii.extmetadata?.Artist?.value ?? "").slice(0, 120) || "Unknown author";
    const lic = strip(ii.extmetadata?.LicenseShortName?.value ?? "");
    out.push({ url: ii.thumburl || ii.url, thumb: (ii.thumburl || ii.url).replace(/\/(\d+)px-/, "/480px-"), credit: `${artist}${lic ? `, ${lic}` : ""}, via Wikimedia Commons`, page: ii.descriptionurl, width: ii.width, height: ii.height });
  }
  return out.sort((a, b) => Number(b.width >= b.height) - Number(a.width >= a.height)).slice(0, 12);
}

/** Short description (and main photo) of a place from Wikipedia, in the given language. */
export async function wikiSummary(q: string, lang = "en"): Promise<WikiSummary | null> {
  const l = ["en", "pt", "es", "fr", "it"].includes(lang) ? lang : "en";
  const query = q.trim().slice(0, 150);
  if (query.length < 2) return null;
  const s = await getJson<{ query?: { search?: { title: string }[] } }>(`https://${l}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: query, srlimit: "1" })}`);
  const title = s?.query?.search?.[0]?.title;
  if (!title) return null;
  const sum = await getJson<{ title: string; extract?: string; originalimage?: { source: string; width: number }; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }>(
    `https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  if (!sum?.extract) return null;
  const img = sum.originalimage?.source ?? sum.thumbnail?.source ?? null;
  const page = sum.content_urls?.desktop?.page ?? `https://${l}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  return { title: sum.title, extract: sum.extract, photo: img, credit: img ? `Photo via Wikipedia (${sum.title})` : null, page };
}
