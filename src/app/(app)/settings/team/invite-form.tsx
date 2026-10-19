"use client";

import { useActionState } from "react";
import { inviteUser } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<{ error?: string; ok?: string } | null, FormData>(inviteUser, null);
  return (
    <form action={action} className="panel pad stack">
      <h3>Invite a team member</h3>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="okmsg" role="status">{state.ok}</p>}
      <div className="formgrid">
        <label className="f" htmlFor="name">Full name<input className="in" id="name" name="name" required /></label>
        <label className="f" htmlFor="email">Email<input className="in" id="email" name="email" type="email" required /></label>
        <label className="f" htmlFor="role">Role
          <select className="in" id="role" name="role" defaultValue="sales">
            <option value="sales">Sales</option><option value="operations">Operations</option><option value="finance">Finance</option><option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <p className="note" style={{ margin: 0 }}>They get an email with a link to choose their password.</p>
      <div><button className="btn primary" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button></div>
    </form>
  );
}
