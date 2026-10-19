import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { daysUntil, shortDate, SUPPLIER_CATEGORIES } from "@/lib/format";
import { SupplierForm } from "./supplier-form";

export const metadata: Metadata = { title: "Suppliers" };

type Row = { id: string; name: string; category: string; city: string | null; country: string | null; payment_terms: string | null; rating: number | null; email: string | null;
  supplier_rates: { valid_to: string | null }[] };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ cat?: string; add?: string }> }) {
  const { cat = "All", add } = await searchParams;
  const { sb } = await requireStaff();
  let q = sb.from("suppliers").select("id, name, category, city, country, payment_terms, rating, email, supplier_rates(valid_to)").order("name");
  if (cat !== "All") q = q.eq("category", cat);
  const { data } = await q.returns<Row[]>();
  const rows = data ?? [];
  const soon = (d: string | null) => (daysUntil(d) ?? 999) < 60;
  const nextExpiry = (r: Row) => r.supplier_rates.map((x) => x.valid_to).filter(Boolean).sort()[0] ?? null;

  return (
    <>
      <div className="head">
        <div><h1>Suppliers</h1><p className="sub">{rows.length} suppliers{cat !== "All" ? ` in ${cat}` : ""}. Net rates are internal.</p></div>
        <Link className="btn primary" href="/suppliers?add=1">+ New supplier</Link>
      </div>
      {add && <SupplierForm />}
      <div className="filters" role="group" aria-label="Filter by category">
        {["All", ...SUPPLIER_CATEGORIES].map((c) => (
          <Link key={c} className="seg" href={c === "All" ? "/suppliers" : `/suppliers?cat=${encodeURIComponent(c)}`} aria-pressed={c === cat}>{c}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="panel empty"><h2>No suppliers yet</h2><p>Add hotels, venues, transport and guides you work with.</p></div>
      ) : (
        <div className="panel tablewrap">
          <table className="t" style={{ minWidth: 760 }}>
            <thead><tr><th>Supplier</th><th>Category</th><th>Location</th><th>Payment terms</th><th>Rates valid until</th><th>Rating</th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const exp = nextExpiry(s);
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b>{s.email && <div className="note">{s.email}</div>}</td>
                    <td>{s.category}</td>
                    <td>{s.city}{s.country && <> <span className="cc">{s.country}</span></>}</td>
                    <td className="note" style={{ fontSize: 13 }}>{s.payment_terms}</td>
                    <td>{exp ? shortDate(exp, { day: "numeric", month: "short", year: "numeric" }) : <span className="note">No rates yet</span>} {soon(exp) && <span className="chip warn">Renew</span>}</td>
                    <td>{s.rating ? <span className="stars" aria-label={`${s.rating} of 5`}>{"●".repeat(s.rating)}<i>{"●".repeat(5 - s.rating)}</i></span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
