import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { loadItinerary } from "@/lib/itinerary-load";
import { connectedEmail } from "@/lib/microsoft";
import { ConfirmButton } from "@/components/confirm-button";
import { EmailLinkForm } from "@/components/email-link";
import { deleteItinerary, duplicateItinerary, setItineraryStatus } from "../actions";
import { ItineraryBuilder } from "./builder";

export const metadata: Metadata = { title: "Itinerary" };
export const maxDuration = 120;

export default async function ItineraryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb, user } = await requireStaff();
  const data = await loadItinerary(sb, id);
  if (!data) notFound();
  const { it, payload } = data;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const shareUrl = `${origin}/i/${it.share_token}`;
  const lead = it.leads as { id: string; number: number | null; title: string; contacts: { full_name: string; email: string | null } | null } | null;
  const project = it.projects as { id: string; code: string; title: string } | null;
  const mailbox = it.status === "Shared" ? await connectedEmail(user.id) : null;

  return (
    <>
      <div className="head">
        <div>
          <div className="chips">
            <span className={`chip ${it.status === "Shared" ? "good" : it.status === "Draft" ? "warn" : ""}`}>{it.status}</span>
            {lead && <Link className="chip" href={`/pipeline/${lead.id}`} style={{ textDecoration: "none" }}>Lead #{lead.number}</Link>}
            {project && <Link className="chip" href={`/projects/${project.id}`} style={{ textDecoration: "none" }}>Project #{project.code}</Link>}
          </div>
          <h1 style={{ marginTop: 8 }}>{it.title}</h1>
          <p className="sub">Edit below, then Save. Share it to give travellers a link that works on any phone and prints as a PDF.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/itineraries">← Itineraries</Link>
          <Link className="btn" href={`/itineraries/${id}/preview`} target="_blank">Preview</Link>
        </div>
      </div>
      {error && <p className="err" style={{ marginBottom: 14 }}>{error} You can build the days by hand below.</p>}
      {it.status === "Shared" && (
        <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
          <div className="okmsg">Client link (live): <b style={{ userSelect: "all", wordBreak: "break-all" }}>{shareUrl}</b></div>
          <EmailLinkForm connected={!!mailbox} title="Send the itinerary by email" to={lead?.contacts?.email ?? ""}
            subject={`Your itinerary: ${it.title}`}
            message={`Dear ${lead?.contacts?.full_name?.split(" ")[0] ?? "traveller"},\n\nYour itinerary is ready. Open it on your phone or computer at the link below; it is always up to date and you can save it as a PDF.\n\nWe look forward to welcoming you.\n\nKind regards,`}
            href={shareUrl} label="View your itinerary" />
        </div>
      )}
      <ItineraryBuilder id={id} status={it.status} shareUrl={shareUrl} initial={payload} aiOn={aiEnabled()} />
      <div className="row no-print" style={{ marginTop: 20, gap: 8 }}>
        <form action={duplicateItinerary}><input type="hidden" name="id" value={id} /><button className="btn ghost">Duplicate as template</button></form>
        <form action={setItineraryStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={it.status === "Archived" ? "Draft" : "Archived"} />
          <button className="btn ghost">{it.status === "Archived" ? "Restore from archive" : "Archive"}</button></form>
        <form action={deleteItinerary}><input type="hidden" name="id" value={id} />
          <ConfirmButton label="Delete itinerary" question="Delete this itinerary for good? The client link will stop working." className="btn ghost" /></form>
      </div>
    </>
  );
}
