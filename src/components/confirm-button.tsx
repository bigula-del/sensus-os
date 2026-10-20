"use client";

/** A submit button that asks for confirmation first (for deletions). */
export function ConfirmButton({ label, question, className = "btn ghost" }: { label: string; question: string; className?: string }) {
  return <button className={className} onClick={(e) => { if (!window.confirm(question)) e.preventDefault(); }}>{label}</button>;
}
