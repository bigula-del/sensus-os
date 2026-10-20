/**
 * Proposal maths, shared by the builder (live totals) and the server (what gets saved).
 * The server always recalculates; it never trusts totals sent by the browser.
 *
 * Rules (from Matheus):
 * - Per-person price = one person sharing a double room. Single supplement is shown separately.
 * - FOC: services priced per person are costed for the FULL group (paying + free places);
 *   the client price is then divided over the PAYING travellers only.
 * - fx holds "1 EUR = x" for every currency used.
 */

export const CURRENCIES = ["EUR", "USD", "BRL", "GBP", "CVE", "ARS", "CLP", "COP", "MXN"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Basis = "pax" | "group" | "room";
export type Fx = Record<string, number>;

/** Fallback rates (1 EUR = x) used only if live rates cannot be fetched. Always editable per proposal. */
export const DEFAULT_FX: Fx = { EUR: 1, USD: 1.17, BRL: 6.3, GBP: 0.87, CVE: 110.265, ARS: 1450, CLP: 1110, COP: 4600, MXN: 21.5 };

export type LineInput = {
  id: string;
  day_number: number;
  sort: number;
  service: string;
  description: string;
  basis: Basis;
  units: number;
  supplier_id: string | null;
  supplier_text: string;
  net_unit: number;
  net_currency: string;
  margin_pct: number;
  is_estimate: boolean;
};

export type ProposalSettings = { pax: number; foc_places: number; quote_currency: string; fx: Fx };

export const groupSize = (s: Pick<ProposalSettings, "pax" | "foc_places">) => Math.max(0, s.pax) + Math.max(0, s.foc_places);

/** Net cost of one line in EUR (internal). */
export function lineNetEUR(l: Pick<LineInput, "net_unit" | "units" | "basis" | "net_currency">, s: ProposalSettings) {
  const rate = s.fx[l.net_currency] || 1;
  const qty = l.basis === "pax" ? groupSize(s) : 1;
  return (Number(l.net_unit) || 0) * (Number(l.units) || 0) * qty / rate;
}

/** What the client pays for one line, in the quote currency. */
export function lineSellQuote(l: Pick<LineInput, "net_unit" | "units" | "basis" | "net_currency" | "margin_pct">, s: ProposalSettings) {
  return lineNetEUR(l, s) * (1 + (Number(l.margin_pct) || 0) / 100) * (s.fx[s.quote_currency] || 1);
}

export function proposalTotals(lines: LineInput[], s: ProposalSettings) {
  const q = s.fx[s.quote_currency] || 1;
  let netEUR = 0;
  let sellQ = 0;
  for (const l of lines) {
    netEUR += lineNetEUR(l, s);
    sellQ += lineSellQuote(l, s);
  }
  const netQ = netEUR * q;
  return {
    net: netQ,
    sell: sellQ,
    margin: sellQ - netQ,
    marginPct: sellQ ? ((sellQ - netQ) / sellQ) * 100 : 0,
    perPayingPerson: s.pax > 0 ? sellQ / s.pax : 0,
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
