"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { askClaude, jsonFrom } from "@/lib/ai";
import { field } from "@/lib/format";
import { countryOf } from "@/lib/holidays";
import { cleanPayload, guessKind, KINDS, type ItDay, type ItItem, type ItPayload } from "@/lib/itineraries";
import { searchPhotos, wikiSummary, type Photo, type WikiSummary } from "@/lib/web-content";

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const dests = (s: string | null) => (s ?? "").split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 12);

type AiDraft = { days: ItDay[]; items: ItItem[]; title?: string; subtitle?: string; intro?: string };

/** Asks Claude for a full day-by-day programme in the Sensus style. */
async function draftWithAi(brief: { destinations: string; days: number; pax: number | null; start_date: string | null; style: string; notes: string; kind: string }): Promise<AiDraft> {
  const text = await askClaude(`You are the senior programme designer at Sensus Travel DMC, a premium MICE and leisure destination management company based in Lisbon,
operating in Portugal, Spain, France, Italy, Cape Verde, Brazil, Argentina, Chile, Colombia and Mexico.
Design a ${brief.days}-day ${brief.kind} itinerary.
Destinations: ${brief.destinations}
Travellers: ${brief.pax ?? "not specified"}
Start date: ${brief.start_date ?? "not fixed"}
Style and interests: ${brief.style || "premium, authentic, well paced"}
Extra notes from the client: ${brief.notes || "none"}

Rules: realistic timings and travel times; real, existing places, hotels and restaurants of high standard; one clear highlight per day;
evenings free or with a dinner; include arrival and departure transfers; English, warm and concise, no prices.
Reply with JSON only, no comments:
{"title": "...", "subtitle": "one line", "intro": "2-3 sentences welcoming the travellers",
 "days": [{"day_number": 1, "title": "short day title", "city": "city", "description": "2 sentences",
   "items": [{"kind": "flight|transfer|hotel|activity|meal|meeting|free|note", "title": "...", "start_time": "HH:MM or empty", "end_time": "HH:MM or empty",
              "location": "place name", "address": "street, city or empty", "description": "1-3 sentences"}]}]}`, 12000);
  const j = jsonFrom<{ title?: string; subtitle?: string; intro?: string; days?: (ItDay & { items?: ItItem[] })[] }>(text);
  const days: ItDay[] = [];
  const items: ItItem[] = [];
  (j.days ?? []).slice(0, 60).forEach((d, i) => {
    const n = i + 1;
    days.push({ day_number: n, title: d.title ?? "", city: d.city ?? "", description: d.description ?? "", photo_url: "", photo_credit: "" });
    (d.items ?? []).forEach((it, s) => items.push({
      id: crypto.randomUUID(), day_number: n, sort: s, kind: KINDS.some((k) => k.id === it.kind) ? it.kind : "activity", title: it.title ?? "",
      start_time: it.start_time ?? "", end_time: it.end_time ?? "", location: it.location ?? "", address: it.address ?? "", description: it.description ?? "",
      photo_url: "", photo_credit: "", link_url: "", booking_ref: "", internal_notes: "",
    }));
  });
  if (!days.length) throw new Error("The AI did not return a programme. Try again with more detail.");
  return { days, items, title: j.title, subtitle: j.subtitle, intro: j.intro };
}

export async function createItinerary(_prev: unknown, fd: FormData): Promise<{ error?: string }> {
  const { sb, user } = await requireStaff();
  const mode = field(fd, "mode") ?? "blank";
  let title = field(fd, "title");
  let start = field(fd, "start_date");
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) start = null;
  let pax = Number(field(fd, "pax")) || null;
  let client = field(fd, "client_name");
  let destinations = dests(field(fd, "destinations"));
  let lead = isUuid(field(fd, "lead_id")) ? field(fd, "lead_id") : null;
  const project = isUuid(field(fd, "project_id")) ? field(fd, "project_id") : null;
  const proposal = mode === "proposal" && isUuid(field(fd, "proposal_id")) ? field(fd, "proposal_id") : null;
  const nDays = Math.min(Math.max(Math.round(Number(field(fd, "days")) || 3), 1), 30);

  let payload: ItPayload | null = null;
  if (mode === "proposal") {
    if (!proposal) return { error: "Choose the proposal to start from." };
    const { data: p } = await sb.from("proposals").select("id, pax, intro, lead_id, leads(title, start_date, destinations, clients(name))").eq("id", proposal).maybeSingle();
    if (!p) return { error: "Proposal not found." };
    const l = p.leads as unknown as { title: string; start_date: string | null; destinations: string[]; clients: { name: string } | null } | null;
    const [{ data: pd }, { data: pl }] = await Promise.all([
      sb.from("proposal_days").select("day_number, title").eq("proposal_id", proposal).order("day_number"),
      sb.from("proposal_lines").select("day_number, sort, service, description").eq("proposal_id", proposal).order("day_number").order("sort"),
    ]);
    title ??= l?.title ?? "Itinerary";
    start ??= l?.start_date ?? null;
    pax ??= p.pax ?? null;
    client ??= l?.clients?.name ?? null;
    if (!destinations.length) destinations = l?.destinations ?? [];
    lead ??= p.lead_id;
    payload = {
      header: { title, subtitle: "", client_name: client ?? "", start_date: start ?? "", pax, destinations, cover_url: "", cover_credit: "", intro: p.intro ?? "", contacts: "", internal_notes: "" },
      days: (pd ?? []).map((d) => ({ day_number: d.day_number, title: d.title ?? "", city: "", description: "", photo_url: "", photo_credit: "" })),
      items: (pl ?? []).map((x, i) => ({ id: "", day_number: x.day_number, sort: x.sort ?? i, kind: guessKind(x.service), title: x.service, start_time: "", end_time: "", location: "", address: "", description: x.description ?? "", photo_url: "", photo_credit: "", link_url: "", booking_ref: "", internal_notes: "" })),
    };
  }
  if (!title && mode !== "ai") return { error: "Give the itinerary a title." };

  const { data: it, error } = await sb.from("itineraries").insert({
    title: (title ?? "New itinerary").slice(0, 200), client_name: client, start_date: start, pax, destinations, lead_id: lead, project_id: project, proposal_id: proposal, created_by: user.id,
  }).select("id").single();
  if (error || !it) return { error: "The itinerary could not be created. Has the itinerary database step been run?" };

  let warn = "";
  if (mode === "ai") {
    try {
      const d = await draftWithAi({
        destinations: destinations.map((c) => countryOf(c)?.name ?? c).join(", ") + (field(fd, "cities") ? ` (${field(fd, "cities")})` : ""),
        days: nDays, pax, start_date: start, style: field(fd, "style") ?? "", notes: field(fd, "notes") ?? "", kind: field(fd, "kind") ?? "leisure",
      });
      payload = {
        header: { title: title ?? d.title ?? "New itinerary", subtitle: d.subtitle ?? "", client_name: client ?? "", start_date: start ?? "", pax, destinations, cover_url: "", cover_credit: "", intro: d.intro ?? "", contacts: "", internal_notes: "" },
        days: d.days, items: d.items,
      };
    } catch (e) {
      warn = e instanceof Error ? e.message : "The AI draft failed.";
    }
  }
  payload ??= {
    header: { title: title ?? "New itinerary", subtitle: "", client_name: client ?? "", start_date: start ?? "", pax, destinations, cover_url: "", cover_credit: "", intro: "", contacts: "", internal_notes: "" },
    days: Array.from({ length: nDays }, (_, i) => ({ day_number: i + 1, title: i === 0 ? "Arrival" : i === nDays - 1 && nDays > 1 ? "Departure" : "", city: "", description: "", photo_url: "", photo_credit: "" })),
    items: [],
  };
  if (!payload.days.length) payload.days = [{ day_number: 1, title: "Arrival", city: "", description: "", photo_url: "", photo_credit: "" }];
  const c = cleanPayload(payload);
  await sb.rpc("save_itinerary", { p_id: it.id, p_header: c.header, p_days: c.days, p_items: c.items });
  revalidatePath("/itineraries");
  redirect(`/itineraries/${it.id}${warn ? `?error=${encodeURIComponent(warn)}` : ""}`);
}

export async function saveItinerary(id: string, payload: ItPayload): Promise<{ ok?: string; error?: string }> {
  const { sb } = await requireStaff();
  if (!isUuid(id)) return { error: "Unknown itinerary." };
  const c = cleanPayload(payload);
  const { error } = await sb.rpc("save_itinerary", { p_id: id, p_header: c.header, p_days: c.days, p_items: c.items });
  if (error) return { error: "Not saved. Check your connection and try again." };
  revalidatePath(`/itineraries/${id}`);
  revalidatePath("/itineraries");
  return { ok: "Saved." };
}

export async function setItineraryStatus(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "id");
  const status = field(fd, "status");
  if (!isUuid(id) || !["Draft", "Shared", "Archived"].includes(status ?? "")) return;
  await sb.from("itineraries").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/itineraries/${id}`);
  revalidatePath("/itineraries");
}

export async function duplicateItinerary(fd: FormData) {
  const { sb, user } = await requireStaff();
  const id = field(fd, "id");
  if (!isUuid(id)) return;
  const [{ data: it }, { data: days }, { data: items }] = await Promise.all([
    sb.from("itineraries").select("*").eq("id", id).maybeSingle(),
    sb.from("itinerary_days").select("*").eq("itinerary_id", id),
    sb.from("itinerary_items").select("*").eq("itinerary_id", id),
  ]);
  if (!it) return;
  const { data: copy } = await sb.from("itineraries").insert({
    title: `${it.title} (copy)`.slice(0, 200), subtitle: it.subtitle, client_name: null, start_date: null, pax: it.pax, destinations: it.destinations,
    cover_url: it.cover_url, cover_credit: it.cover_credit, intro: it.intro, contacts: it.contacts, internal_notes: it.internal_notes, created_by: user.id,
  }).select("id").single();
  if (!copy) return;
  const strip = <T extends Record<string, unknown>>(r: T) => { const { id: _i, itinerary_id: _t, ...rest } = r; void _i; void _t; return rest; };
  await sb.rpc("save_itinerary", { p_id: copy.id, p_header: { ...strip(it), title: `${it.title} (copy)`.slice(0, 200), client_name: null, start_date: null }, p_days: (days ?? []).map(strip), p_items: (items ?? []).map(strip) });
  revalidatePath("/itineraries");
  redirect(`/itineraries/${copy.id}`);
}

export async function deleteItinerary(fd: FormData) {
  const { sb } = await requireStaff();
  const id = field(fd, "id");
  if (isUuid(id)) await sb.from("itineraries").delete().eq("id", id);
  revalidatePath("/itineraries");
  redirect("/itineraries");
}

/** AI: draft days to add into the builder (nothing is saved until the person presses Save). */
export async function aiDraftDays(input: { destinations: string; days: number; pax: number | null; start_date: string | null; style: string; notes: string; kind: string }): Promise<{ error?: string; draft?: AiDraft }> {
  await requireStaff();
  try {
    return { draft: await draftWithAi({ ...input, days: Math.min(Math.max(Math.round(input.days) || 1, 1), 30), notes: input.notes.slice(0, 3000), style: input.style.slice(0, 500) }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The AI draft failed." };
  }
}

/** AI: polish or write one description in the Sensus voice. */
export async function aiDescribe(input: { title: string; location: string; city: string; current: string; lang: string }): Promise<{ error?: string; text?: string }> {
  await requireStaff();
  const lang = ({ en: "English", pt: "Portuguese (Portugal)", es: "Spanish", fr: "French", it: "Italian" } as Record<string, string>)[input.lang] ?? "English";
  try {
    const text = await askClaude(`Write a short, inviting itinerary description (2-3 sentences, ${lang}, no prices, no exaggeration) for travellers of Sensus Travel DMC, a premium DMC.
Item: ${input.title.slice(0, 200)}
Place: ${input.location.slice(0, 200)} ${input.city.slice(0, 100)}
${input.current ? `Current draft to improve: ${input.current.slice(0, 2000)}` : ""}
Reply with the description only.`, 600, 45000);
    return { text: text.trim() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI failed." };
  }
}

export async function findPhotos(q: string): Promise<{ photos: Photo[] }> {
  await requireStaff();
  return { photos: await searchPhotos(q) };
}

export async function wikiFill(q: string, lang: string): Promise<{ summary: WikiSummary | null }> {
  await requireStaff();
  return { summary: await wikiSummary(q, lang) };
}

export type LibItem = { id: string; kind: string; title: string; city: string | null; country: string | null; location: string | null; address: string | null; description: string | null; photo_url: string | null; photo_credit: string | null; link_url: string | null };

export async function saveToLibrary(item: ItItem & { city?: string; country?: string }): Promise<{ ok?: boolean; error?: string }> {
  const { sb, user } = await requireStaff();
  const c = cleanPayload({ header: {} as ItPayload["header"], days: [{ day_number: 1, title: "", city: "", description: "", photo_url: "", photo_credit: "" }], items: [{ ...item, day_number: 1 }] }).items[0];
  if (!c || !c.title) return { error: "Give the item a title first." };
  const { error } = await sb.from("itinerary_library").insert({
    kind: c.kind, title: c.title, city: item.city?.slice(0, 120) || null, country: item.country?.slice(0, 2) || null, location: c.location, address: c.address,
    description: c.description, photo_url: c.photo_url, photo_credit: c.photo_credit, link_url: c.link_url, created_by: user.id,
  });
  return error ? { error: "Could not save to the library." } : { ok: true };
}

export async function searchLibrary(q: string): Promise<{ items: LibItem[] }> {
  const { sb } = await requireStaff();
  let query = sb.from("itinerary_library").select("id, kind, title, city, country, location, address, description, photo_url, photo_credit, link_url").order("title").limit(30);
  const s = q.replace(/[%,()]/g, " ").trim().slice(0, 80);
  if (s) query = query.or(`title.ilike.%${s}%,city.ilike.%${s}%,location.ilike.%${s}%`);
  const { data } = await query;
  return { items: (data ?? []) as LibItem[] };
}

export async function deleteFromLibrary(id: string): Promise<{ ok?: boolean }> {
  const { sb } = await requireStaff();
  if (isUuid(id)) await sb.from("itinerary_library").delete().eq("id", id);
  return { ok: true };
}
