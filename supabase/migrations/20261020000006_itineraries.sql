-- Itineraries (Travefy / Tern style): a day-by-day travel programme with times, places, photos and
-- contacts, shared with travellers as a branded web page (and PDF). No prices or costs live here.
-- Internal notes stay with staff: the client page reads only through client_itinerary().

create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  client_name text,
  lead_id uuid references public.leads(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  start_date date,
  pax int,
  destinations text[] not null default '{}',
  cover_url text, cover_credit text,
  intro text,
  contacts text,                       -- client-facing: guide, DMC duty phone, emergency numbers
  internal_notes text,                 -- staff only, never shown to the client
  status text not null default 'Draft' check (status in ('Draft','Shared','Archived')),
  share_token uuid not null default gen_random_uuid() unique,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_number int not null check (day_number between 1 and 60),
  title text not null default '',
  city text,
  description text,
  photo_url text, photo_credit text,
  unique (itinerary_id, day_number)
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_number int not null check (day_number between 1 and 60),
  sort int not null default 0,
  kind text not null default 'activity' check (kind in ('flight','transfer','hotel','activity','meal','meeting','free','note')),
  title text not null default '',
  start_time time, end_time time,
  location text, address text,
  description text,
  photo_url text, photo_credit text,
  link_url text,
  booking_ref text,                    -- client-facing confirmation or flight number
  internal_notes text                  -- staff only (supplier contact, net details live elsewhere)
);
create index if not exists itinerary_items_itin_idx on public.itinerary_items(itinerary_id, day_number, sort);

-- reusable content: hotels, restaurants, visits written once, used in any itinerary
create table if not exists public.itinerary_library (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'activity' check (kind in ('flight','transfer','hotel','activity','meal','meeting','free','note')),
  title text not null,
  city text, country text,
  location text, address text,
  description text,
  photo_url text, photo_credit text,
  link_url text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['itineraries','itinerary_days','itinerary_items','itinerary_library'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "internal staff" on public.%I', t);
    execute format('create policy "internal staff" on public.%I for all using (public.is_internal()) with check (public.is_internal())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Photos for itineraries are meant for travellers, so this bucket is public to read; only staff upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('itinerary-media', 'itinerary-media', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "staff upload itinerary media" on storage.objects;
drop policy if exists "staff manage itinerary media" on storage.objects;
create policy "staff upload itinerary media" on storage.objects for insert with check (bucket_id = 'itinerary-media' and public.is_internal());
create policy "staff manage itinerary media" on storage.objects for delete using (bucket_id = 'itinerary-media' and public.is_internal());

-- What the traveller sees. Only shared itineraries; never internal notes.
create or replace function public.client_itinerary(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', i.title, 'subtitle', i.subtitle, 'client', i.client_name, 'start_date', i.start_date, 'pax', i.pax,
    'destinations', i.destinations, 'cover_url', i.cover_url, 'cover_credit', i.cover_credit, 'intro', i.intro, 'contacts', i.contacts,
    'ref', (select l.number from public.leads l where l.id = i.lead_id),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
               'day', d.day_number, 'title', d.title, 'city', d.city, 'description', d.description,
               'photo_url', d.photo_url, 'photo_credit', d.photo_credit,
               'items', (select coalesce(jsonb_agg(jsonb_build_object(
                           'kind', it.kind, 'title', it.title, 'start_time', to_char(it.start_time, 'HH24:MI'), 'end_time', to_char(it.end_time, 'HH24:MI'),
                           'location', it.location, 'address', it.address, 'description', it.description,
                           'photo_url', it.photo_url, 'photo_credit', it.photo_credit, 'link_url', it.link_url, 'booking_ref', it.booking_ref)
                         order by it.sort), '[]')
                         from public.itinerary_items it where it.itinerary_id = i.id and it.day_number = d.day_number))
             order by d.day_number), '[]')
             from public.itinerary_days d where d.itinerary_id = i.id))
  from public.itineraries i
  where i.share_token = p_token and i.status = 'Shared'
$$;
revoke all on function public.client_itinerary(uuid) from public;
grant execute on function public.client_itinerary(uuid) to anon, authenticated;

-- Saving the whole builder in one step (all or nothing). Runs with the caller's rights, so row level security applies.
create or replace function public.save_itinerary(p_id uuid, p_header jsonb, p_days jsonb, p_items jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare h public.itineraries;
begin
  if not public.is_internal() then raise exception 'not allowed'; end if;
  h := jsonb_populate_record(null::public.itineraries, p_header);
  update public.itineraries set
    title = coalesce(nullif(h.title, ''), 'Untitled itinerary'), subtitle = h.subtitle, client_name = h.client_name, start_date = h.start_date,
    pax = h.pax, destinations = coalesce(h.destinations, '{}'), cover_url = h.cover_url, cover_credit = h.cover_credit,
    intro = h.intro, contacts = h.contacts, internal_notes = h.internal_notes, updated_at = now()
  where id = p_id;
  if not found then raise exception 'itinerary not found'; end if;
  delete from public.itinerary_items where itinerary_id = p_id;
  delete from public.itinerary_days where itinerary_id = p_id;
  insert into public.itinerary_days (itinerary_id, day_number, title, city, description, photo_url, photo_credit)
    select p_id, d.day_number, coalesce(d.title, ''), d.city, d.description, d.photo_url, d.photo_credit
    from jsonb_populate_recordset(null::public.itinerary_days, coalesce(p_days, '[]'::jsonb)) d;
  insert into public.itinerary_items (itinerary_id, day_number, sort, kind, title, start_time, end_time, location, address, description,
                                      photo_url, photo_credit, link_url, booking_ref, internal_notes)
    select p_id, i.day_number, coalesce(i.sort, 0), coalesce(i.kind, 'activity'), coalesce(i.title, ''), i.start_time, i.end_time, i.location, i.address, i.description,
           i.photo_url, i.photo_credit, i.link_url, i.booking_ref, i.internal_notes
    from jsonb_populate_recordset(null::public.itinerary_items, coalesce(p_items, '[]'::jsonb)) i;
end $$;
revoke all on function public.save_itinerary(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_itinerary(uuid, jsonb, jsonb, jsonb) to authenticated;
