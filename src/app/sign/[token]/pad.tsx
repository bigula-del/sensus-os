"use client";

import { useRef, useState } from "react";

export function SignPad({ signer, onSign, onDecline }: {
  signer: string;
  onSign: (name: string, png: string) => Promise<{ error?: string }>;
  onDecline: (reason: string) => Promise<{ error?: string }>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);
  const [name, setName] = useState(signer);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!, r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const x = canvas.current!.getContext("2d")!;
    x.lineWidth = 2.6; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#111";
    drawing.current = true; canvas.current!.setPointerCapture(e.pointerId);
    x.beginPath(); x.moveTo(...pt(e));
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const x = canvas.current!.getContext("2d")!;
    x.lineTo(...pt(e)); x.stroke(); setInked(true);
  };
  const clear = () => { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setInked(false); };

  return (
    <div className="fb" style={{ borderTop: "1px solid #E5E5E0" }}>
      <label htmlFor="signame">Your full name<input id="signame" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 5 }}>Draw your signature</div>
        <canvas ref={canvas} width={1120} height={300} className="sigpad" style={{ height: 150 }} aria-label="Signature area: draw with your finger or mouse"
          onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} />
        <button type="button" className="btn sm" onClick={clear} style={{ marginTop: 6 }}>Clear</button>
      </div>
      <label style={{ flexDirection: "row", gap: 8, fontWeight: 400, alignItems: "flex-start" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
        I have read the document and agree to sign it electronically. I understand this signature is legally binding.
      </label>
      {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy || !inked || !agree || name.trim().length < 2}
          onClick={async () => { setBusy(true); const r = await onSign(name, canvas.current!.toDataURL("image/png")); setBusy(false); if (r.error) setErr(r.error); }}>
          {busy ? "Signing…" : "Sign document"}</button>
        {!declining && <button className="btn ghost" onClick={() => setDeclining(true)}>Decline</button>}
      </div>
      {declining && (
        <div className="row">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" style={{ flex: 1 }} aria-label="Reason for declining" />
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); const r = await onDecline(reason); setBusy(false); if (r.error) setErr(r.error); }}>Confirm decline</button>
        </div>
      )}
    </div>
  );
}
