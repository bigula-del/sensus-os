export const money = (v: number | null | undefined, cur = "EUR", digits = 0) => {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(Number(v ?? 0));
  } catch {
    return `${cur} ${Math.round(Number(v ?? 0))}`;
  }
};

export const shortDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return isNaN(+d) ? iso : d.toLocaleDateString("en-GB", opts);
};

export const STAGES = ["New", "Qualifying", "Proposal sent", "Negotiation", "Won"] as const;
export const ALL_STAGES = [...STAGES, "Lost"] as const;
export type Stage = (typeof ALL_STAGES)[number];

export const SUPPLIER_CATEGORIES = ["Hotel", "Venue", "Transport", "Activity", "Guides", "Restaurant", "Other"] as const;

/** Read a trimmed string from a form, or null when empty. */
export const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

/** Days from now until an ISO date (negative when past). */
export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  return (new Date(iso + "T12:00:00").getTime() - Date.now()) / 864e5;
}
