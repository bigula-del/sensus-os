/** Itinerary types, item kinds and input cleaning shared by the builder, the server and the client page. */

export const KINDS = [
  { id: "flight", label: "Flight", icon: "✈" },
  { id: "transfer", label: "Transfer", icon: "🚐" },
  { id: "hotel", label: "Hotel", icon: "🏨" },
  { id: "activity", label: "Activity", icon: "★" },
  { id: "meal", label: "Meal", icon: "🍽" },
  { id: "meeting", label: "Meeting", icon: "◆" },
  { id: "free", label: "Free time", icon: "☀" },
  { id: "note", label: "Note", icon: "ℹ" },
] as const;
export type Kind = (typeof KINDS)[number]["id"];
export const kindOf = (k: string) => KINDS.find((x) => x.id === k) ?? KINDS[3];

export type ItDay = { day_number: number; title: string; city: string; description: string; photo_url: string; photo_credit: string };
export type ItItem = {
  id: string; day_number: number; sort: number; kind: Kind; title: string; start_time: string; end_time: string;
  location: string; address: string; description: string; photo_url: string; photo_credit: string; link_url: string; booking_ref: string; internal_notes: string;
};
export type ItHeader = {
  title: string; subtitle: string; client_name: string; start_date: string; pax: number | null; destinations: string[];
  cover_url: string; cover_credit: string; intro: string; contacts: string; internal_notes: string;
};
export type ItPayload = { header: ItHeader; days: ItDay[]; items: ItItem[] };

/** What a traveller sees (output of client_itinerary). No internal notes, no prices. */
export type ClientItinerary = {
  title: string; subtitle: string | null; client: string | null; start_date: string | null; pax: number | null; destinations: string[];
  cover_url: string | null; cover_credit: string | null; intro: string | null; contacts: string | null; ref: number | null;
  days: { day: number; title: string; city: string | null; description: string | null; photo_url: string | null; photo_credit: string | null;
    items: { kind: string; title: string; start_time: string | null; end_time: string | null; location: string | null; address: string | null; description: string | null;
      photo_url: string | null; photo_credit: string | null; link_url: string | null; booking_ref: string | null }[] }[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const url = (v: unknown) => { const s = str(v, 1000); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ""; };
const time = (v: unknown) => { const s = str(v, 8); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.slice(0, 5)) ? s.slice(0, 5) : ""; };
const nullIfEmpty = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

/** Cleans what the browser sends before it reaches the database. */
export function cleanPayload(p: ItPayload) {
  const h = p.header ?? ({} as ItHeader);
  const pax = Number(h.pax);
  const header = nullIfEmpty({
    title: str(h.title, 200) || "Untitled itinerary", subtitle: str(h.subtitle, 300), client_name: str(h.client_name, 200),
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(str(h.start_date, 10)) ? str(h.start_date, 10) : "",
    cover_url: url(h.cover_url), cover_credit: str(h.cover_credit, 300), intro: str(h.intro, 5000), contacts: str(h.contacts, 3000), internal_notes: str(h.internal_notes, 5000),
  });
  Object.assign(header, {
    pax: Number.isFinite(pax) && pax > 0 ? Math.min(Math.round(pax), 100000) : null,
    destinations: (Array.isArray(h.destinations) ? h.destinations : []).map((d) => str(d, 2).toUpperCase()).filter((d) => /^[A-Z]{2}$/.test(d)).slice(0, 12),
  });
  const seen = new Set<number>();
  const days = (Array.isArray(p.days) ? p.days : [])
    .map((d) => ({ ...d, day_number: Math.round(Number(d.day_number)) }))
    .filter((d) => d.day_number >= 1 && d.day_number <= 60 && !seen.has(d.day_number) && seen.add(d.day_number))
    .slice(0, 60)
    .map((d) => nullIfEmpty({ day_number: d.day_number, title: str(d.title, 200), city: str(d.city, 120), description: str(d.description, 5000), photo_url: url(d.photo_url), photo_credit: str(d.photo_credit, 300) }));
  const valid = new Set(days.map((d) => d.day_number as number));
  const items = (Array.isArray(p.items) ? p.items : [])
    .filter((i) => valid.has(Math.round(Number(i.day_number))))
    .slice(0, 800)
    .map((i, n) => nullIfEmpty({
      day_number: Math.round(Number(i.day_number)), sort: Number.isFinite(Number(i.sort)) ? Math.round(Number(i.sort)) : n,
      kind: KINDS.some((k) => k.id === i.kind) ? i.kind : "activity", title: str(i.title, 300), start_time: time(i.start_time), end_time: time(i.end_time),
      location: str(i.location, 300), address: str(i.address, 500), description: str(i.description, 8000), photo_url: url(i.photo_url), photo_credit: str(i.photo_credit, 300),
      link_url: url(i.link_url), booking_ref: str(i.booking_ref, 120), internal_notes: str(i.internal_notes, 3000),
    }));
  // titles must not be null in the database
  for (const d of days) d.title ??= "";
  for (const i of items) i.title ??= "";
  return { header, days, items };
}

/** Guesses the item type from a proposal service name. */
export function guessKind(service: string): Kind {
  const s = service.toLowerCase();
  if (/flight|voo|vuelo|vol |airline/.test(s)) return "flight";
  if (/transfer|coach|bus|van|driver|pick-?up|drop-?off|train|boat|ferry/.test(s)) return "transfer";
  if (/hotel|room|night|accommodation|pousada|resort|check-?in/.test(s)) return "hotel";
  if (/dinner|lunch|breakfast|meal|restaurant|cocktail|wine|tasting|gala/.test(s)) return "meal";
  if (/meeting|conference|congress|plenary|room hire|venue/.test(s)) return "meeting";
  return "activity";
}

/** Date of a day of the trip, e.g. "Tue 12 May". */
export function dayDate(start: string | null | undefined, day: number, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  const d = new Date(start + "T12:00:00");
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString("en-GB", opts);
}

export const mapsLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
