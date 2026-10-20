import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { SignPad } from "./pad";

export const metadata: Metadata = { title: "Sign document", robots: { index: false } };

type Req = { name: string; signer: string; message: string | null; status: string; signed_at: string | null; signed_name: string | null;
  has_file: boolean; proposal_token: string | null; fingerprint: string | null };

async function who() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown", ua: h.get("user-agent") ?? "" };
}

async function sign(token: string, name: string, png: string) {
  "use server";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { error: "This link is not valid." };
  const { ip, ua } = await who();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("sign_complete", { p_token: token, p_name: String(name).slice(0, 200), p_signature: String(png), p_ip: ip, p_ua: ua });
  if (error || !data) return { error: "The signature could not be saved. Draw it again and retry, or contact Sensus." };
  revalidatePath(`/sign/${token}`);
  return {};
}

async function decline(token: string, reason: string) {
  "use server";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { error: "This link is not valid." };
  const { ip, ua } = await who();
  const sb = await supabaseServer();
  await sb.rpc("sign_decline", { p_token: token, p_reason: String(reason ?? "").slice(0, 500), p_ip: ip, p_ua: ua });
  revalidatePath(`/sign/${token}`);
  return {};
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { ip, ua } = await who();
  const sb = await supabaseServer();
  const { data } = await sb.rpc("sign_open", { p_token: token, p_ip: ip, p_ua: ua });
  const r = data as Req | null;
  if (!r) notFound();

  let pdfUrl: string | null = null;
  if (r.has_file) {
    try {
      const admin = supabaseAdmin();
      const { data: path } = await admin.rpc("sign_file_path", { p_token: token });
      if (path) pdfUrl = (await admin.storage.from("documents").createSignedUrl(path as string, 1800)).data?.signedUrl ?? null;
    } catch {
      pdfUrl = null;
    }
  }
  const docUrl = pdfUrl ?? (r.proposal_token ? `/p/${r.proposal_token}` : null);

  return (
    <main className="pubwrap">
      <div className="formprev" style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="fh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-black.png" alt="sensus" style={{ width: 130 }} />
          <div style={{ font: "700 22px/1.2 var(--display)", marginTop: 14 }}>{r.name}</div>
          <div style={{ fontSize: 13 }}>For {r.signer}</div>
        </div>
        <div className="fb">
          {r.message && <p style={{ margin: 0, color: "#333", whiteSpace: "pre-wrap" }}>{r.message}</p>}
          {docUrl ? (
            <>
              <iframe src={docUrl} title="Document to sign" style={{ width: "100%", height: 520, border: "1px solid #E5E5E0", borderRadius: 6, background: "#fff" }} />
              <a href={docUrl} target="_blank" rel="noreferrer" style={{ color: "#111", fontSize: 13 }}>Open the document in a new tab</a>
            </>
          ) : <p className="err" style={{ margin: 0 }}>The document cannot be shown right now. Please contact Sensus at info@sensustravel.com.</p>}
          {r.fingerprint && <p style={{ margin: 0, fontSize: 11.5, color: "#666", wordBreak: "break-all" }}>Document fingerprint (SHA-256): {r.fingerprint}</p>}
        </div>
        {r.status === "Signed" ? (
          <div className="fb" style={{ borderTop: "1px solid #E5E5E0" }}>
            <h2 style={{ margin: 0, color: "#111" }}>Signed</h2>
            <p style={{ margin: 0, color: "#333" }}>Signed by {r.signed_name}{r.signed_at ? ` on ${new Date(r.signed_at).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })} (Lisbon time)` : ""}. Thank you.</p>
          </div>
        ) : r.status === "Declined" ? (
          <div className="fb" style={{ borderTop: "1px solid #E5E5E0" }}><h2 style={{ margin: 0, color: "#111" }}>Declined</h2><p style={{ margin: 0, color: "#333" }}>Sensus has been told. They will be in touch.</p></div>
        ) : docUrl ? (
          <SignPad signer={r.signer} onSign={sign.bind(null, token)} onDecline={decline.bind(null, token)} />
        ) : null}
        <div className="fb" style={{ paddingTop: 0 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "#666" }}>Sensus Travel DMC · SENSO VIAJANTE - VIAGENS UNIPESSOAL LDA · NIF PT518035042. Your name, signature, time, IP address and browser are recorded as evidence of signature.</p>
        </div>
      </div>
    </main>
  );
}
