import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ItineraryDoc } from "@/components/itinerary-doc";
import type { ClientItinerary } from "@/lib/itineraries";

async function load(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("client_itinerary", { p_token: token });
  return data as ClientItinerary | null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const it = await load((await params).token);
  return {
    title: it ? `${it.title} · Sensus Travel DMC` : "Itinerary",
    robots: { index: false, follow: false },
    openGraph: it ? { title: it.title, description: it.subtitle ?? "Your itinerary by Sensus Travel DMC", images: it.cover_url ? [it.cover_url] : [] } : undefined,
  };
}

/**
 * The page travellers open from the itinerary link. It reads ONLY through client_itinerary(),
 * which returns traveller-facing fields of shared itineraries (no internal notes, no prices).
 */
export default async function PublicItinerary({ params }: { params: Promise<{ token: string }> }) {
  const it = await load((await params).token);
  if (!it) notFound();
  return (
    <main className="itnwrap">
      <ItineraryDoc it={it} />
    </main>
  );
}
