/** Project finance. All amounts in EUR. Everything except `sell` is internal. */
export type ServiceRow = { id: string; service: string; sell_eur: number; net_eur: number; supplier: string | null };
export type ExpenseRow = { id: string; service_id: string | null; amount_eur: number; status: string };

export function projectFinance(services: ServiceRow[], expenses: ExpenseRow[], completed: boolean, received: number) {
  const counted = expenses.filter((e) => e.status !== "Rejected");
  const actualBy = new Map<string, number>();
  let extras = 0;
  for (const e of counted) {
    if (e.service_id) actualBy.set(e.service_id, (actualBy.get(e.service_id) ?? 0) + Number(e.amount_eur));
    else extras += Number(e.amount_eur);
  }
  const sell = services.reduce((a, s) => a + Number(s.sell_eur), 0);
  const net = services.reduce((a, s) => a + Number(s.net_eur), 0);
  const actual = counted.reduce((a, e) => a + Number(e.amount_eur), 0);
  // While running: a service costs at least its planned net. Once completed: only what was actually spent.
  const forecast = services.reduce((a, s) => a + Math.max(Number(s.net_eur), actualBy.get(s.id) ?? 0), 0) + extras;
  const cost = completed ? actual : forecast;
  return {
    sell, net, actual, extras, received,
    planned: sell - net,
    plannedPct: sell ? ((sell - net) / sell) * 100 : 0,
    margin: sell - cost,
    marginPct: sell ? ((sell - cost) / sell) * 100 : 0,
    variance: sell - cost - (sell - net),
    actualBy,
  };
}

export const PROJECT_STATUSES = ["Confirmed", "In operation", "Completed", "Cancelled"] as const;
export const EXPENSE_CATEGORIES = ["Supplier invoice", "Supplier deposit", "On-site extra", "Staff costs", "Travel", "Meals", "Software", "Marketing", "Office", "Other"] as const;
