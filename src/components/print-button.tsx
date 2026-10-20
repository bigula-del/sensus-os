"use client";

export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return <button type="button" className="itn-btn" onClick={() => window.print()}>{label}</button>;
}
