import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, initialsOf } from "@/lib/auth";
import { createChannel, ensureGeneral, openDirect } from "./actions";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Team chat" };

type Ch = { id: string; name: string; is_direct: boolean; member_ids: string[]; project_id: string | null; projects: { code: string; title: string } | null };
type Msg = { id: string; body: string; created_at: string; author_id: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
};

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string; new?: string }> }) {
  const sp = await searchParams;
  const { sb, user } = await requireStaff();
  await ensureGeneral();
  const [{ data: chans }, { data: people }, { data: projects }] = await Promise.all([
    sb.from("chat_channels").select("id, name, is_direct, member_ids, project_id, projects(code, title)").order("created_at").returns<Ch[]>(),
    sb.from("profiles").select("id, full_name").neq("role", "client").eq("active", true).order("full_name"),
    sb.from("projects").select("id, code, title").in("status", ["Confirmed", "In operation"]).order("start_date"),
  ]);
  const channels = (chans ?? []).filter((c) => !c.is_direct);
  const directs = (chans ?? []).filter((c) => c.is_direct);
  const nameOf = (id: string) => (people ?? []).find((p) => p.id === id)?.full_name ?? "Former colleague";
  const current = (chans ?? []).find((c) => c.id === sp.c) ?? channels[0];
  const label = (c: Ch) => (c.is_direct ? nameOf(c.member_ids.find((m) => m !== user.id) ?? user.id) : `# ${c.name}`);
  const { data: msgs } = current
    ? await sb.from("chat_messages").select("id, body, created_at, author_id").eq("channel_id", current.id).order("created_at", { ascending: false }).limit(200).returns<Msg[]>()
    : { data: [] as Msg[] };
  const messages = [...(msgs ?? [])].reverse();

  return (
    <>
      <div className="head"><div><h1>Team chat</h1><p className="sub">Channels for the team and for each project, plus private messages.</p></div>
        <Link className="btn" href={`/chat?new=1${current ? `&c=${current.id}` : ""}`}>+ New channel</Link></div>
      {sp.new && (
        <form action={createChannel} className="panel pad row" style={{ marginBottom: 16 }}>
          <label className="f" style={{ flex: "1 1 200px" }}>Channel name<input className="in" name="name" required placeholder="e.g. sales or prj-680735" /></label>
          <label className="f" style={{ flex: "1 1 220px" }}>Linked project (optional)<select className="in" name="project_id"><option value="">None</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>#{p.code} · {p.title}</option>)}</select></label>
          <button className="btn primary" style={{ alignSelf: "flex-end" }}>Create</button>
        </form>
      )}
      <div className="panel split">
        <div className="listcol">
          <div className="navlabel" style={{ color: "var(--muted)" }}>Channels</div>
          {channels.map((c) => (
            <Link key={c.id} className="chan" aria-current={c.id === current?.id} href={`/chat?c=${c.id}`} style={{ textDecoration: "none" }}>
              {label(c)}{c.projects && <span className="note">#{c.projects.code}</span>}
            </Link>
          ))}
          <div className="navlabel" style={{ color: "var(--muted)", marginTop: 8 }}>Private messages</div>
          {(people ?? []).filter((p) => p.id !== user.id).map((p) => {
            const dm = directs.find((d) => d.member_ids.includes(p.id));
            return dm ? (
              <Link key={p.id} className="chan" aria-current={dm.id === current?.id} href={`/chat?c=${dm.id}`} style={{ textDecoration: "none" }}>
                <span className="row" style={{ gap: 8 }}><span className="avatar sm alt">{initialsOf(p.full_name)}</span>{p.full_name}</span>
              </Link>
            ) : (
              <form key={p.id} action={openDirect}><input type="hidden" name="user_id" value={p.id} />
                <button className="chan" style={{ width: "100%" }}><span className="row" style={{ gap: 8 }}><span className="avatar sm alt">{initialsOf(p.full_name)}</span>{p.full_name}</span></button></form>
            );
          })}
          {(people ?? []).length <= 1 && <p className="note" style={{ padding: "0 16px" }}>Add your team in Team &amp; access to message them.</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {current ? (
            <>
              <header style={{ padding: "12px 20px", borderBottom: "1px solid var(--line)" }}>
                <h3>{label(current)}</h3>
                {current.projects && <Link className="note" href={`/projects/${current.project_id}`}>Project #{current.projects.code} · {current.projects.title}</Link>}
                {current.is_direct && <span className="note">Only the two of you can read this.</span>}
              </header>
              <div className="msgs" id="msgs">
                {messages.length ? messages.map((m) => (
                  <div className="msg" key={m.id}>
                    <span className={`avatar sm ${m.author_id === user.id ? "" : "alt"}`}>{initialsOf(nameOf(m.author_id))}</span>
                    <div><div className="who">{nameOf(m.author_id)}<span>{when(m.created_at)}</span></div><p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p></div>
                  </div>
                )) : <div className="empty">No messages yet. Say hello.</div>}
              </div>
              <Composer channelId={current.id} placeholder={`Message ${label(current)}`} />
            </>
          ) : <div className="empty">Choose a channel.</div>}
        </div>
      </div>
    </>
  );
}
