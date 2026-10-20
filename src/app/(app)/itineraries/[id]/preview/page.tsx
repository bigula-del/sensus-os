import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { loadItinerary, toClientView } from "@/lib/itinerary-load";
import { ItineraryDoc } from "@/components/itinerary-doc";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Itinerary preview" };

export default async function ItineraryPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb } = await requireStaff();
  const data = await loadItinerary(sb, id);
  if (!data) notFound();
  const lead = data.it.leads as { number: number | null } | null;
  return (
    <>
      <div className="banner no-print" style={{ justifyContent: "space-between" }}>
        <span><b>Preview</b> · this is exactly what travellers see (internal notes are hidden).{data.it.status !== "Shared" && " The client link is not active until you share it."}</span>
        <span className="row" style={{ gap: 6 }}><PrintButton label="Save as PDF" /><Link className="btn sm" href={`/itineraries/${id}`}>← Back to editing</Link></span>
      </div>
      <div className="itnwrap" style={{ borderRadius: 10 }}>
        <ItineraryDoc it={toClientView(data.payload, lead?.number ?? null)} preview />
      </div>
    </>
  );
}
