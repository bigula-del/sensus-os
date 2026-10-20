import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { connectedEmail, graph, msConfigured, MsNotConnected, type MailItem } from "@/lib/microsoft";
import { disconnectOutlook, leadFromEmail, linkEmail, sendEmail, unlinkEmail } from "./actions";
import { SubmitButton } from "./submit";

export const metadata: Metadata = { title: "Inbox" };

const FOLDERS = [{ id: "inbox", label: "Inbox" }, { id: "sentitems", label: "Sent" }] as const;
const when = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Lisbon" });
};
const who = (r?: { emailAddress: { name?: string; address: string } }) => r?.emailAddress.name || r?.emailAddress.address || "";
const SELECT = "id,subject,bodyPreview,receivedDateTime,sentDateTime,isRead,hasAttachments,from,toRecipients";

type SP = { folder?: string; q?: string; m?: string; compose?: string; error?: string; sent?: string; linked?: string; connected?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { sb, user } = await requireStaff();
  const folder = FOLDERS.find((f) => f.id === sp.folder)?.id ?? "inbox";
  const q = (sp.q ?? "").replace(/["\\]/g, "").trim().slice(0, 100);

  const head = (mailbox?: string | null) => (
    <div className="head">
      <div><h1>Inbox</h1><p className="sub">{mailbox ? <>Your Outlook mailbox · <b>{mailbox}</b></> : "Your Outlook email inside Sensus OS."}</p></div>
      {mailbox && (
        <div className="row">
          <Link className="btn primary" href="/inbox?compose=1">+ New email</Link>
          <form action={disconnectOutlook}><button className="btn ghost" title="Sensus OS will stop reading this mailbox">Disconnect</button></form>
        </div>
      )}
    </div>
  );

  if (!msConfigured()) {
    return (<>{head()}<div className="panel empty"><h2>Outlook is being set up</h2><p>The Microsoft 365 connection is waiting for its final setup step. Once done, each person connects their own mailbox here with one click.</p></div></>);
  }
  const mailbox = await connectedEmail(user.id);
  if (!mailbox) {
    return (
      <>
        {head()}
        {sp.error && <p className="err" style={{ marginBottom: 16 }}>{sp.error === "setup" ? "Outlook is not set up yet." : sp.error}</p>}
        <div className="panel empty stack" style={{ alignItems: "center" }}>
          <h2>Connect your Outlook</h2>
          <p style={{ maxWidth: 520 }}>Read and answer your email here, link emails to leads and projects, and send proposals and signature links from your own address. Only you see your mailbox; emails you link to a lead or project are shared with the team.</p>
          <a className="btn primary" href="/api/microsoft/connect">Connect Outlook</a>
          <p className="note">You will sign in with your Microsoft 365 account and approve access once.</p>
        </div>
      </>
    );
  }

  let list: MailItem[] = [];
  let current: MailItem | null = null;
  let problem: string | null = null;
  try {
    const qs = q ? `$search="${encodeURIComponent(q)}"&$top=40&$select=${SELECT}` : `$top=40&$orderby=${folder === "sentitems" ? "sentDateTime" : "receivedDateTime"} desc&$select=${SELECT}`;
    const [l, c] = await Promise.all([
      graph<{ value: MailItem[] }>(user.id, `/me/mailFolders/${folder}/messages?${qs}`),
      sp.m ? graph<MailItem>(user.id, `/me/messages/${encodeURIComponent(sp.m)}?$select=${SELECT},ccRecipients,body,webLink,conversationId`, { textBody: true }).catch(() => null) : Promise.resolve(null),
    ]);
    list = l.value ?? [];
    current = c;
    if (current && !current.isRead) {
      await graph(user.id, `/me/messages/${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) }).catch(() => null);
      list = list.map((x) => (x.id === current!.id ? { ...x, isRead: true } : x));
    }
  } catch (e) {
    problem = e instanceof MsNotConnected ? e.message : e instanceof Error ? e.message : "Outlook could not be reached.";
    if (e instanceof MsNotConnected) {
      return (<>{head()}<div className="panel empty stack" style={{ alignItems: "center" }}><h2>Reconnect Outlook</h2><p>{problem}</p><a className="btn primary" href="/api/microsoft/connect">Connect Outlook</a></div></>);
    }
  }

  const ids = [...list.map((x) => x.id), ...(current ? [current.id] : [])];
  const [{ data: links }, { data: leads }, { data: projects }] = await Promise.all([
    ids.length ? sb.from("email_links").select("message_id, lead_id, project_id, leads(number, title), projects(code, title)").in("message_id", ids) : Promise.resolve({ data: [] as never[] }),
    current ? sb.from("leads").select("id, number, title").not("stage", "in", "(Won,Lost)").order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] as never[] }),
    current ? sb.from("projects").select("id, code, title").neq("status", "Cancelled").order("start_date", { ascending: false }).limit(200) : Promise.resolve({ data: [] as never[] }),
  ]);
  type L = { message_id: string; lead_id: string | null; project_id: string | null; leads: { number: number | null; title: string } | null; projects: { code: string; title: string } | null };
  const linkOf = (id: string) => ((links ?? []) as unknown as L[]).find((x) => x.message_id === id);
  const curLink = current ? linkOf(current.id) : undefined;
  const base = (extra: Record<string, string>) => `/inbox?${new URLSearchParams({ ...(folder !== "inbox" ? { folder } : {}), ...(q ? { q } : {}), ...extra })}`;

  return (
    <>
      {head(mailbox)}
      {sp.connected && <p className="okmsg" style={{ marginBottom: 16 }}>Outlook is connected. Your email appears below.</p>}
      {sp.sent && <p className="okmsg" style={{ marginBottom: 16 }}>Sent.</p>}
      {sp.linked && <p className="okmsg" style={{ marginBottom: 16 }}>Linked. The team can read this email on the lead or project.</p>}
      {(sp.error || problem) && <p className="err" style={{ marginBottom: 16 }}>{sp.error || problem}</p>}

      {sp.compose && (
        <form action={sendEmail} className="panel pad stack" style={{ marginBottom: 16 }}>
          <h3>New email</h3>
          <label className="f">To<input className="in" name="to" type="text" required placeholder="name@company.com, other@company.com" /></label>
          <label className="f">Cc (optional)<input className="in" name="cc" type="text" /></label>
          <label className="f">Subject<input className="in" name="subject" required maxLength={300} /></label>
          <label className="f">Message<textarea className="in" name="body" rows={9} required placeholder="Your signature with the Sensus details is added automatically." /></label>
          <div className="row"><SubmitButton label="Send" pending="Sending…" /><Link className="btn ghost" href="/inbox">Cancel</Link></div>
        </form>
      )}

      <div className="row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 0 }} role="tablist">
          {FOLDERS.map((f) => (
            <Link key={f.id} href={f.id === "inbox" ? "/inbox" : `/inbox?folder=${f.id}`} role="tab" aria-selected={folder === f.id}
              style={{ padding: "9px 12px", fontWeight: 600, textDecoration: "none", color: folder === f.id ? "var(--ink)" : "var(--muted)", borderBottom: `2px solid ${folder === f.id ? "var(--ink)" : "transparent"}` }}>{f.label}</Link>
          ))}
        </div>
        <form className="row" action="/inbox">
          {folder !== "inbox" && <input type="hidden" name="folder" value={folder} />}
          <input className="in" name="q" defaultValue={q} placeholder="Search email" aria-label="Search email" style={{ width: 220 }} />
          <button className="btn">Search</button>
          {q && <Link className="btn ghost" href={folder === "inbox" ? "/inbox" : `/inbox?folder=${folder}`}>Clear</Link>}
        </form>
      </div>

      <div className="panel split">
        <div className="listcol" style={{ padding: 0 }}>
          {list.length ? list.map((x) => {
            const lk = linkOf(x.id);
            const name = folder === "sentitems" ? `To: ${(x.toRecipients ?? []).map(who).join(", ")}` : who(x.from);
            return (
              <Link key={x.id} href={base({ m: x.id })} aria-current={x.id === current?.id}
                style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid var(--line)", textDecoration: "none", background: x.id === current?.id ? "var(--soft)" : undefined }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "nowrap" }}>
                  <span style={{ fontWeight: x.isRead ? 500 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!x.isRead && <span aria-label="Unread" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: "var(--ink)", marginRight: 6, verticalAlign: 1 }} />}{name}</span>
                  <span className="note" style={{ flex: "none" }}>{when(folder === "sentitems" ? x.sentDateTime : x.receivedDateTime)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: x.isRead ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.hasAttachments && "📎 "}{x.subject || "(no subject)"}</div>
                <div className="note" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.bodyPreview}</div>
                {lk && <span className="chip" style={{ marginTop: 4 }}>{lk.leads ? `Lead #${lk.leads.number ?? ""}` : `Project #${lk.projects?.code ?? ""}`}</span>}
              </Link>
            );
          }) : <div className="empty">{q ? "No email matches your search." : "No email here."}</div>}
        </div>

        <div style={{ minWidth: 0 }}>
          {current ? (
            <article className="stack" style={{ padding: "16px 20px" }}>
              <header className="stack" style={{ gap: 4 }}>
                <h2 style={{ fontSize: 20 }}>{current.subject || "(no subject)"}</h2>
                <div className="note"><b style={{ color: "var(--ink)" }}>{who(current.from)}</b> &lt;{current.from?.emailAddress.address}&gt; · {new Date(current.receivedDateTime).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" })}</div>
                <div className="note">To: {(current.toRecipients ?? []).map(who).join(", ")}{current.ccRecipients?.length ? ` · Cc: ${current.ccRecipients.map(who).join(", ")}` : ""}</div>
                {current.hasAttachments && <div className="note">📎 Has attachments. {current.webLink && <a href={current.webLink} target="_blank" rel="noreferrer">Open in Outlook</a>}</div>}
              </header>

              <div className="panel pad" style={{ background: "var(--soft)" }}>
                {curLink ? (
                  <form action={unlinkEmail} className="row" style={{ justifyContent: "space-between" }}>
                    <span>Linked to {curLink.lead_id ? <Link href={`/pipeline/${curLink.lead_id}`}>lead #{curLink.leads?.number} · {curLink.leads?.title}</Link> : <Link href={`/projects/${curLink.project_id}`}>project #{curLink.projects?.code} · {curLink.projects?.title}</Link>}</span>
                    <input type="hidden" name="message_id" value={current.id} /><input type="hidden" name="from" value={base({ m: current.id })} />
                    <button className="btn ghost sm">Unlink</button>
                  </form>
                ) : (
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <form action={linkEmail} className="row">
                      <input type="hidden" name="message_id" value={current.id} /><input type="hidden" name="folder" value={folder} />
                      <select className="in" name="target" required aria-label="Lead or project" style={{ maxWidth: 300 }} defaultValue="">
                        <option value="" disabled>Link to a lead or project…</option>
                        <optgroup label="Leads">{(leads ?? []).map((l: { id: string; number: number | null; title: string }) => <option key={l.id} value={`lead:${l.id}`}>#{l.number} · {l.title}</option>)}</optgroup>
                        <optgroup label="Projects">{(projects ?? []).map((p: { id: string; code: string; title: string }) => <option key={p.id} value={`project:${p.id}`}>#{p.code} · {p.title}</option>)}</optgroup>
                      </select>
                      <SubmitButton label="Link" pending="Linking…" className="btn" />
                    </form>
                    {folder === "inbox" && (
                      <form action={leadFromEmail}>
                        <input type="hidden" name="message_id" value={current.id} /><input type="hidden" name="folder" value={folder} />
                        <SubmitButton label="Create lead from this email" pending="Creating lead…" className="btn" />
                      </form>
                    )}
                  </div>
                )}
              </div>

              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55, fontSize: 14 }}>{current.body?.content?.trim() || current.bodyPreview}</div>

              <form action={sendEmail} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <input type="hidden" name="reply_to" value={current.id} /><input type="hidden" name="folder" value={folder} />
                <label className="f">Reply<textarea className="in" name="body" rows={5} required placeholder={`Reply to ${who(current.from)}…`} /></label>
                <div className="row">
                  <SubmitButton label="Send reply" pending="Sending…" />
                  {(current.toRecipients?.length ?? 0) + (current.ccRecipients?.length ?? 0) > 1 && <label className="inline"><input type="checkbox" name="all" value="1" /> Reply to all</label>}
                </div>
              </form>
            </article>
          ) : <div className="empty">Choose an email to read it.</div>}
        </div>
      </div>
    </>
  );
}
