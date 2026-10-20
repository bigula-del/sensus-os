import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientItinerary, ItDay, ItItem, ItPayload } from "@/lib/itineraries";

/** Loads an itinerary for staff: the full builder payload plus the record. */
export async function loadItinerary(sb: SupabaseClient, id: string) {
  const [{ data: it }, { data: days }, { data: items }] = await Promise.all([
    sb.from("itineraries").select("*, leads(id, number, title, contacts(full_name, email)), projects(id, code, title)").eq("id", id).maybeSingle(),
    sb.from("itinerary_days").select("*").eq("itinerary_id", id).order("day_number"),
    sb.from("itinerary_items").select("*").eq("itinerary_id", id).order("day_number").order("sort"),
  ]);
  if (!it) return null;
  const s = (v: unknown) => (v == null ? "" : String(v));
  const payload: ItPayload = {
    header: {
      title: s(it.title), subtitle: s(it.subtitle), client_name: s(it.client_name), start_date: s(it.start_date), pax: it.pax ?? null, destinations: it.destinations ?? [],
      cover_url: s(it.cover_url), cover_credit: s(it.cover_credit), intro: s(it.intro), contacts: s(it.contacts), internal_notes: s(it.internal_notes),
    },
    days: (days ?? []).map((d) => ({ day_number: d.day_number, title: s(d.title), city: s(d.city), description: s(d.description), photo_url: s(d.photo_url), photo_credit: s(d.photo_credit) }) as ItDay),
    items: (items ?? []).map((x) => ({
      id: x.id, day_number: x.day_number, sort: x.sort, kind: x.kind, title: s(x.title), start_time: s(x.start_time).slice(0, 5), end_time: s(x.end_time).slice(0, 5),
      location: s(x.location), address: s(x.address), description: s(x.description), photo_url: s(x.photo_url), photo_credit: s(x.photo_credit), link_url: s(x.link_url), booking_ref: s(x.booking_ref), internal_notes: s(x.internal_notes),
    }) as ItItem),
  };
  return { it, payload };
}

/** The same view a traveller gets, built for the staff preview. Internal notes are left out. */
export function toClientView(p: ItPayload, ref: number | null): ClientItinerary {
  const n = (v: string) => v || null;
  return {
    title: p.header.title, subtitle: n(p.header.subtitle), client: n(p.header.client_name), start_date: n(p.header.start_date), pax: p.header.pax, destinations: p.header.destinations,
    cover_url: n(p.header.cover_url), cover_credit: n(p.header.cover_credit), intro: n(p.header.intro), contacts: n(p.header.contacts), ref,
    days: p.days.map((d) => ({
      day: d.day_number, title: d.title, city: n(d.city), description: n(d.description), photo_url: n(d.photo_url), photo_credit: n(d.photo_credit),
      items: p.items.filter((x) => x.day_number === d.day_number).sort((a, b) => a.sort - b.sort).map((x) => ({
        kind: x.kind, title: x.title, start_time: n(x.start_time), end_time: n(x.end_time), location: n(x.location), address: n(x.address), description: n(x.description),
        photo_url: n(x.photo_url), photo_credit: n(x.photo_credit), link_url: n(x.link_url), booking_ref: n(x.booking_ref),
      })),
    })),
  };
}
