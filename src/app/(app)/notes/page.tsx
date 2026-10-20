import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { createNote } from "./actions";
import { NoteEditor } from "./editor";

export const metadata: Metadata = { title: "Notes" };

type N = { id: string; title: string; body: string; project_id: string | null; shared: boolean; owner_id: string; updated_at: string;
  projects: { code: string } | null; profiles: { full_name: string } | null };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  const { sb, user } = await requireStaff();
  const [{ data }, { data: projects }] = await Promise.all([
    sb.from("notes").select("id, title, body, project_id, shared, owner_id, updated_at, projects(code), profiles!notes_owner_id_fkey(full_name)").order("updated_at", { ascending: false }).limit(300).returns<N[]>(),
    sb.from("projects").select("id, code, title").neq("status", "Cancelled").order("start_date", { ascending: false }),
  ]);
  const notes = data ?? [];
  const current = notes.find((x) => x.id === n) ?? notes[0];
  return (
    <>
      <div className="head">
        <div><h1>Notes</h1><p className="sub">Your notepad. Notes are private unless you share them; a note linked to a project also shows in that project.</p></div>
        <form action={createNote}><button className="btn primary">+ New note</button></form>
      </div>
      {!notes.length ? (
        <div className="panel empty"><h2>No notes yet</h2><p>Create your first note.</p></div>
      ) : (
        <div className="panel notes">
          <div className="listcol">
            {notes.map((x) => (
              <Link key={x.id} className="mail" aria-current={x.id === current?.id} href={`/notes?n=${x.id}`} style={{ textDecoration: "none" }}>
                <div className="subj">{x.title || "Untitled"}</div>
                <div className="prev">
                  {x.projects ? `#${x.projects.code} · ` : ""}{x.owner_id !== user.id ? `${x.profiles?.full_name ?? "Colleague"} · ` : x.shared ? "Shared · " : ""}{shortDate(x.updated_at)}
                </div>
              </Link>
            ))}
          </div>
          {current && (
            <NoteEditor key={current.id} note={current} mine={current.owner_id === user.id}
              projects={(projects ?? []).map((p) => ({ id: p.id, label: `#${p.code} · ${p.title}` }))} />
          )}
        </div>
      )}
    </>
  );
}
