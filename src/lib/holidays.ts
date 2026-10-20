import Holidays from "date-holidays";

/** The ten countries Sensus works in, in the order shown across the app. */
export const COUNTRIES = [
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "CV", name: "Cape Verde", flag: "🇨🇻" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
] as const;
export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const countryOf = (code: string) => COUNTRIES.find((c) => c.code === code);

export type Holiday = { date: string; country: CountryCode; flag: string; name: string; local: string; kind: "public" | "bank" };

const cache = new Map<string, Holiday[]>();

/** National public holidays (plus bank holidays such as Brazil's Carnival) of one year, for all ten countries. */
function year(y: number): Holiday[] {
  const key = String(y);
  const hit = cache.get(key);
  if (hit) return hit;
  const out: Holiday[] = [];
  for (const c of COUNTRIES) {
    const local = new Holidays(c.code);
    const en = new Holidays(c.code, { languages: ["en"] });
    const enList = en.getHolidays(y, "en") || [];
    for (const h of local.getHolidays(y) || []) {
      if (h.type !== "public" && h.type !== "bank") continue;
      const date = h.date.slice(0, 10);
      if (out.some((o) => o.country === c.code && o.date === date)) continue;
      const enName = enList.find((e) => e.date === h.date && e.rule === h.rule)?.name ?? h.name;
      out.push({ date, country: c.code, flag: c.flag, name: enName, local: h.name, kind: h.type });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || COUNTRIES.findIndex((c) => c.code === a.country) - COUNTRIES.findIndex((c) => c.code === b.country));
  cache.set(key, out);
  return out;
}

/** Holidays between two ISO dates (inclusive). */
export function holidaysBetween(from: string, to: string, countries?: string[]): Holiday[] {
  const ys = new Set<number>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) ys.add(y);
  return [...ys].flatMap(year).filter((h) => h.date >= from && h.date <= to && (!countries?.length || countries.includes(h.country)));
}
