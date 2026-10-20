"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ label, pending, className = "btn primary" }: { label: string; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return <button className={className} disabled={busy} aria-busy={busy}>{busy ? <><span className="spin" /> {pending}</> : label}</button>;
}
