import { DEFAULT_FX, type Fx } from "@/lib/proposals";

/**
 * Exchange rates (1 EUR = x) from the European Central Bank via frankfurter.app,
 * for today or a given date. Currencies the ECB does not publish (CVE, ARS, CLP, COP)
 * keep the editable defaults; CVE is pegged to the euro.
 */
export async function ecbRates(date?: string): Promise<Fx> {
  const fx: Fx = { ...DEFAULT_FX };
  const when = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= new Date().toISOString().slice(0, 10) ? date : "latest";
  try {
    const res = await fetch(`https://api.frankfurter.app/${when}?from=EUR&to=USD,BRL,GBP,MXN`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as { rates?: Record<string, number> };
      for (const [k, v] of Object.entries(j.rates ?? {})) if (v > 0) fx[k] = Math.round(v * 10000) / 10000;
    }
  } catch {
    // fall back to defaults
  }
  return fx;
}
