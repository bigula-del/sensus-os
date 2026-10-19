"use client";

import { useActionState, useState } from "react";
import { addMember, resetMemberPassword } from "./actions";

type AddState = { error?: string; ok?: { email: string; name: string; password: string } } | null;

function CopyBox({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="aibox" style={{ marginTop: 4 }}>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", font: "inherit" }}>{text}</pre>
      <button
        type="button"
        className="btn sm"
        style={{ marginTop: 8 }}
        onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true), () => setDone(false))}
      >
        {done ? "Copied" : "Copy message"}
      </button>
    </div>
  );
}

export function InviteForm({ siteUrl }: { siteUrl: string }) {
  const [state, action, pending] = useActionState<AddState, FormData>(addMember, null);
  const ok = state?.ok;
  return (
    <form action={action} className="panel pad stack">
      <h3>Add a team member</h3>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {ok && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="okmsg" role="status" style={{ margin: 0 }}>Account created. Send {ok.name} this message (by WhatsApp or email). The password is shown only now.</p>
          <CopyBox text={`Hi ${ok.name.split(" ")[0]}, your Sensus OS account is ready.\n\nOpen: ${siteUrl}\nEmail: ${ok.email}\nTemporary password: ${ok.password}\n\nAfter signing in, choose your own password under "Change password".`} />
        </div>
      )}
      <div className="formgrid">
        <label className="f" htmlFor="name">Full name<input className="in" id="name" name="name" required /></label>
        <label className="f" htmlFor="email">Email<input className="in" id="email" name="email" type="email" required /></label>
        <label className="f" htmlFor="role">Role
          <select className="in" id="role" name="role" defaultValue="sales">
            <option value="sales">Sales</option><option value="operations">Operations</option><option value="finance">Finance</option><option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <p className="note" style={{ margin: 0 }}>Sensus OS creates the account and gives you a temporary password to pass on.</p>
      <div><button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create account"}</button></div>
    </form>
  );
}

export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<{ error?: string; password?: string } | null, FormData>(resetMemberPassword, null);
  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn sm ghost" disabled={pending}>{pending ? "…" : "New password"}</button>
      {state?.password && <span className="chip y" role="status">New password for {name}: {state.password}</span>}
      {state?.error && <span className="chip bad">{state.error}</span>}
    </form>
  );
}
