"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SUPPLIER_CATEGORIES } from "@/lib/format";
import { createSupplier } from "./actions";

export function SupplierForm() {
  const [state, action, pending] = useActionState<{ error?: string } | null, FormData>(createSupplier, null);
  return (
    <form action={action} className="panel pad stack" style={{ marginBottom: 16 }}>
      <h3>New supplier</h3>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <div className="formgrid">
        <label className="f" htmlFor="name">Name *<input className="in" id="name" name="name" required /></label>
        <label className="f" htmlFor="category">Category<select className="in" id="category" name="category">{SUPPLIER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f" htmlFor="city">City<input className="in" id="city" name="city" /></label>
        <label className="f" htmlFor="country">Country code<input className="in" id="country" name="country" maxLength={2} placeholder="PT" /></label>
        <label className="f" htmlFor="email">Email<input className="in" id="email" name="email" type="email" /></label>
        <label className="f" htmlFor="phone">Phone<input className="in" id="phone" name="phone" /></label>
        <label className="f" htmlFor="payment_terms">Payment terms<input className="in" id="payment_terms" name="payment_terms" placeholder="30% at booking, 70% 30 days before" /></label>
        <label className="f" htmlFor="rating">Rating<select className="in" id="rating" name="rating"><option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} of 5</option>)}</select></label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save supplier"}</button>
        <Link className="btn ghost" href="/suppliers">Cancel</Link>
      </div>
    </form>
  );
}
