"use client";

import { useActionState, useState } from "react";
import { sendReset, signIn } from "./actions";

type State = { error?: string; ok?: string } | null;

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [mode, setMode] = useState<"in" | "reset">("in");
  const [inState, inAction, inPending] = useActionState<State, FormData>(signIn, null);
  const [rState, rAction, rPending] = useActionState<State, FormData>(sendReset, null);
  const state = mode === "in" ? inState : rState;

  return (
    <form className="box" action={mode === "in" ? inAction : rAction}>
      <div className="head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-black.png" alt="sensus · dmc · mice · leisure" />
      </div>
      <h2>{mode === "in" ? "Sign in to Sensus OS" : "Reset your password"}</h2>
      {notice && <p className="err">{notice}</p>}
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="okmsg" role="status">{state.ok}</p>}
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="f" htmlFor="email">
        Email
        <input className="in" id="email" name="email" type="email" autoComplete="email" required />
      </label>
      {mode === "in" && (
        <label className="f" htmlFor="password">
          Password
          <input className="in" id="password" name="password" type="password" autoComplete="current-password" required />
        </label>
      )}
      <button className="btn primary" disabled={inPending || rPending} style={{ justifyContent: "center" }}>
        {mode === "in" ? (inPending ? "Signing in…" : "Sign in") : rPending ? "Sending…" : "Send reset link"}
      </button>
      <button type="button" className="btn ghost" onClick={() => setMode(mode === "in" ? "reset" : "in")}>
        {mode === "in" ? "Forgot your password?" : "Back to sign in"}
      </button>
    </form>
  );
}
