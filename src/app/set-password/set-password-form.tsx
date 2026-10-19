"use client";

import { useActionState } from "react";
import { setPassword } from "./actions";

export function SetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<{ error?: string } | null, FormData>(setPassword, null);
  return (
    <form className="box" action={action}>
      <div className="head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-black.png" alt="sensus" />
      </div>
      <h2>Choose your password</h2>
      <p className="note" style={{ margin: 0 }}>For {email}. Use at least 10 characters.</p>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <input type="email" name="username" autoComplete="username" defaultValue={email} hidden readOnly />
      <label className="f" htmlFor="password">
        New password
        <input className="in" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="f" htmlFor="confirm">
        Repeat password
        <input className="in" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <button className="btn primary" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
