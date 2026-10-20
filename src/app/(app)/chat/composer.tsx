"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendMessage } from "./actions";

/** Message box. Enter sends, Shift+Enter adds a new line. The conversation refreshes every few seconds. */
export function Composer({ channelId, placeholder }: { channelId: string; placeholder: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(tick, 8000);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    const box = document.getElementById("msgs");
    if (box) box.scrollTop = box.scrollHeight;
  });

  const send = () => {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const r = await sendMessage(channelId, body);
      if (r.error) { setErr(r.error); return; }
      setText(""); setErr("");
      router.refresh();
      ref.current?.focus();
    });
  };

  return (
    <div className="composer" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <textarea ref={ref} className="in" rows={1} value={text} placeholder={placeholder} aria-label="Message" style={{ minHeight: 40, resize: "none" }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" disabled={pending || !text.trim()} onClick={send}>Send</button>
      </div>
      {err && <span className="note" style={{ color: "var(--bad)" }}>{err}</span>}
    </div>
  );
}
