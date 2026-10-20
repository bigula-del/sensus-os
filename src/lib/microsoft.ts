import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Microsoft 365 (Outlook) access through Microsoft Graph, per team member.
 * Each person connects their own mailbox once; their refresh token is stored encrypted
 * in `ms_accounts`, a table only the server can read.
 *
 * Client and tenant IDs are not secret. The client secret lives only in Vercel (MS_CLIENT_SECRET).
 */
export const MS_CLIENT_ID = process.env.MS_CLIENT_ID?.trim() || "";
export const MS_TENANT_ID = process.env.MS_TENANT_ID?.trim() || "";
export const SITE_URL = process.env.SITE_URL?.trim() || "https://sensus-os.vercel.app";
export const MS_REDIRECT = `${SITE_URL}/api/microsoft/callback`;
const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite";

export const msConfigured = () => !!(MS_CLIENT_ID && MS_TENANT_ID && process.env.MS_CLIENT_SECRET?.trim());

// ── token encryption (AES-256-GCM), key derived from the server's secret ──
function key() {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) throw new Error("SETUP: SUPABASE_SERVICE_ROLE_KEY is missing in Vercel.");
  return createHash("sha256").update(`sensus-os/microsoft/${base}`).digest();
}
function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
function decrypt(payload: string) {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export function authUrl(state: string, loginHint?: string) {
  const u = new URL(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: MS_CLIENT_ID, response_type: "code", redirect_uri: MS_REDIRECT, response_mode: "query",
    scope: SCOPES, state, prompt: "select_account", ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET?.trim() ?? "", scope: SCOPES, ...body }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json()) as TokenResponse;
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || "Microsoft sign-in failed");
  return j;
}

/** Called once, after the person approves access in Microsoft. Stores their mailbox connection. */
export async function connectWithCode(profileId: string, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: MS_REDIRECT });
  if (!t.refresh_token) throw new Error("Microsoft did not allow offline access. Check the offline_access permission.");
  const me = (await (await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { authorization: `Bearer ${t.access_token}` } })).json()) as { mail?: string; userPrincipalName?: string };
  const email = me.mail || me.userPrincipalName || "unknown";
  const { error } = await supabaseAdmin().from("ms_accounts").upsert({ profile_id: profileId, email, refresh_token_enc: encrypt(t.refresh_token), updated_at: new Date().toISOString() });
  if (error) throw new Error("The connection could not be saved. Has the Microsoft database step been run?");
  cache.set(profileId, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
  return email;
}

export async function disconnect(profileId: string) {
  cache.delete(profileId);
  await supabaseAdmin().from("ms_accounts").delete().eq("profile_id", profileId);
}

/** The connected mailbox address, or null. */
export async function connectedEmail(profileId: string): Promise<string | null> {
  if (!msConfigured()) return null;
  try {
    const { data } = await supabaseAdmin().from("ms_accounts").select("email").eq("profile_id", profileId).maybeSingle();
    return data?.email ?? null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { token: string; until: number }>();

async function accessToken(profileId: string) {
  const hit = cache.get(profileId);
  if (hit && hit.until > Date.now()) return hit.token;
  const admin = supabaseAdmin();
  const { data } = await admin.from("ms_accounts").select("refresh_token_enc").eq("profile_id", profileId).maybeSingle();
  if (!data) throw new MsNotConnected();
  let t: TokenResponse;
  try {
    t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(data.refresh_token_enc) });
  } catch {
    throw new MsNotConnected("Your Outlook connection expired. Connect it again.");
  }
  if (t.refresh_token) await admin.from("ms_accounts").update({ refresh_token_enc: encrypt(t.refresh_token), updated_at: new Date().toISOString() }).eq("profile_id", profileId);
  cache.set(profileId, { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 });
  return t.access_token;
}

export class MsNotConnected extends Error {
  constructor(msg = "Outlook is not connected.") { super(msg); }
}

/** Calls Microsoft Graph as the person. `path` starts with /me/... */
export async function graph<T = unknown>(profileId: string, path: string, init: RequestInit & { textBody?: boolean } = {}): Promise<T> {
  const token = await accessToken(profileId);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  // immutable IDs: a message keeps its ID when moved between folders, so links to leads stay valid
  headers.set("Prefer", ['IdType="ImmutableId"', ...(init.textBody ? ['outlook.body-content-type="text"'] : [])].join(", "));
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (res.status === 401) { cache.delete(profileId); throw new MsNotConnected("Your Outlook connection expired. Connect it again."); }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(j.error?.message || `Outlook error ${res.status}`);
  }
  return (res.status === 202 || res.status === 204 ? undefined : await res.json()) as T;
}

export type Recipient = { emailAddress: { name?: string; address: string } };
export type MailItem = {
  id: string; subject: string | null; bodyPreview: string; receivedDateTime: string; sentDateTime?: string; isRead: boolean; hasAttachments: boolean;
  from?: Recipient; toRecipients?: Recipient[]; ccRecipients?: Recipient[]; body?: { contentType: string; content: string }; conversationId?: string; webLink?: string;
};

/** Sends an email from the person's own mailbox (it also lands in their Sent folder). */
export async function sendMail(profileId: string, to: string[], subject: string, html: string, cc: string[] = []) {
  await graph(profileId, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
}

/** Minimal branded email wrapper. */
export function brandedHtml(paragraphs: string[], sender: string, link?: { href: string; label: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111;max-width:560px">
${paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
${link ? `<p style="margin:22px 0"><a href="${esc(link.href)}" style="background:#F3EA1F;color:#0B0B0A;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;display:inline-block">${esc(link.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#666">Or open: <a href="${esc(link.href)}" style="color:#666">${esc(link.href)}</a></p>` : ""}
<p style="margin:22px 0 0">${esc(sender)}<br><b>Sensus Travel DMC</b><br><span style="color:#666;font-size:12px">dmc · mice · leisure · sensustravel.com</span></p></div>`;
}
