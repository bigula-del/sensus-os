-- Sensus OS · foundation schema
-- Rules this schema enforces:
--   1. Only signed-in Sensus staff (profiles with an internal role) can read business data.
--   2. Internal cost data (net prices, actual costs, margins, expenses) lives in separate
--      tables that only internal staff can read. Client-facing tables never hold costs,
--      so a client portal or the Companion app can only ever read client-facing fields.
--   3. HR data is readable and writable by the admin only.

create extension if not exists pgcrypto;

-- ───────────────────────── roles & profiles ─────────────────────────
create type public.app_role as enum ('admin','sales','operations','finance','client');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'sales',
  city text,
  initials text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create or replace function public.is_internal() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','sales','operations','finance'), false)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- new auth users get a profile; the very first user becomes admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when (select count(*) from public.profiles) = 0 then 'admin'::public.app_role else 'sales'::public.app_role end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- shared updated_at helper
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── CRM ─────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'corporate' check (kind in ('agency','corporate','direct')),
  country text, market text,
  billing_name text, billing_tax_id text, billing_address text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  full_name text not null, email text, phone text, language text, job_title text,
  marketing_consent boolean not null default false, consent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create type public.lead_stage as enum ('New','Qualifying','Proposal sent','Negotiation','Won','Lost');
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  kind text not null default 'MICE' check (kind in ('MICE','Leisure')),
  stage public.lead_stage not null default 'New',
  destinations text[] not null default '{}',
  dates_text text, start_date date, end_date date,
  pax int, market text, source text,
  estimated_value_eur numeric(12,2),
  owner_id uuid references public.profiles(id),
  lost_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ───────────────────────── suppliers ─────────────────────────
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null default 'Other',
  city text, country text, payment_terms text, rating smallint check (rating between 1 and 5),
  email text, phone text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.supplier_rates (            -- internal: net prices
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  service text not null, description text,
  basis text not null default 'pax' check (basis in ('pax','group','room')),
  net_price numeric(12,2) not null, currency char(3) not null default 'EUR',
  valid_from date, valid_to date, conditions text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ───────────────────────── proposals ─────────────────────────
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  version int not null default 1,
  option_label text,
  status text not null default 'Draft' check (status in ('Draft','Sent','Approved','Rejected','Superseded')),
  quote_currency char(3) not null default 'EUR',
  pax int not null default 1,
  foc_places int not null default 0,          -- free places diluted over paying travellers
  single_supplement numeric(12,2),            -- shown separately; prices are per person sharing a double
  valid_until date,
  fx jsonb not null default '{"EUR":1}',      -- rates locked on this version
  intro text,
  ai_drafted boolean not null default false,
  share_token uuid not null default gen_random_uuid(),   -- secret link sent to the client
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (lead_id, version, option_label)
);
create table public.proposal_days (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  day_number int not null, title text not null default '',
  unique (proposal_id, day_number)
);
create table public.proposal_lines (           -- client-facing only: no costs here
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  day_number int not null default 1,
  sort int not null default 0,
  service text not null,
  description text,
  basis text not null default 'pax' check (basis in ('pax','group','room')),
  units numeric(10,2) not null default 1,
  sell_total_quote numeric(14,2) not null default 0,   -- what the client pays for this line
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.proposal_line_costs (       -- internal: net, currency, margin, supplier
  line_id uuid primary key references public.proposal_lines(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_text text,
  net_unit numeric(12,2) not null default 0,
  net_currency char(3) not null default 'EUR',
  margin_pct numeric(6,2) not null default 18,
  is_estimate boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── projects (programmes) ─────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  lead_id uuid references public.leads(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  kind text not null default 'MICE',
  start_date date, end_date date, pax int,
  status text not null default 'Confirmed' check (status in ('Confirmed','In operation','Completed','Cancelled')),
  ops_owner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.project_services (          -- client-facing: what was sold
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sort int not null default 0,
  service text not null,
  sell_eur numeric(14,2) not null default 0
);
create table public.project_service_costs (     -- internal: planned net
  service_id uuid primary key references public.project_services(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  net_eur numeric(14,2) not null default 0
);
create table public.client_payments (           -- internal: money received
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  received_on date not null, amount_eur numeric(14,2) not null, reference text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── expenses (internal) ─────────────────────────
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  supplier_name text not null,
  description text,
  amount numeric(14,2) not null,
  currency char(3) not null default 'EUR',
  amount_eur numeric(14,2) not null,           -- converted at the rate of the day
  category text not null default 'Other',
  project_id uuid references public.projects(id) on delete set null,
  service_id uuid references public.project_services(id) on delete set null,
  status text not null default 'To review' check (status in ('To review','Approved','Rejected')),
  receipt_path text,
  read_by_ai boolean not null default false,
  created_by uuid references public.profiles(id) default auth.uid(),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- project finance, internal only (security_invoker so the caller's rules apply)
create view public.project_finance with (security_invoker = true) as
select p.id as project_id,
  coalesce((select sum(s.sell_eur) from public.project_services s where s.project_id = p.id),0) as sell_eur,
  coalesce((select sum(c.net_eur) from public.project_services s join public.project_service_costs c on c.service_id = s.id where s.project_id = p.id),0) as net_eur,
  coalesce((select sum(e.amount_eur) from public.expenses e where e.project_id = p.id and e.status <> 'Rejected'),0) as actual_eur,
  coalesce((select sum(cp.amount_eur) from public.client_payments cp where cp.project_id = p.id),0) as received_eur
from public.projects p;

-- ───────────────────────── calendar, notes, chat ─────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null, starts_at time,
  title text not null,
  kind text not null default 'reminder' check (kind in ('reminder','meeting','project')),
  project_id uuid references public.projects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  owner_id uuid references public.profiles(id) default auth.uid(),
  done boolean not null default false,
  outlook_id text,
  created_at timestamptz not null default now()
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) default auth.uid(),
  title text not null default '', body text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  shared boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid references public.projects(id) on delete cascade,
  is_direct boolean not null default false,
  member_ids uuid[] not null default '{}',     -- used for direct messages
  created_at timestamptz not null default now()
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── e-signature, forms, email links ─────────────────────────
create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null, file_path text,
  signer_name text not null, signer_email text not null,
  status text not null default 'Draft' check (status in ('Draft','Sent','Viewed','Signed','Declined')),
  token uuid not null default gen_random_uuid(),   -- secret link for the signer
  sent_at timestamptz, viewed_at timestamptz, signed_at timestamptz,
  audit jsonb not null default '[]',
  project_id uuid references public.projects(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid references public.projects(id) on delete set null,
  fields jsonb not null default '[]',
  public_token uuid not null default gen_random_uuid(),
  is_open boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);
create table public.email_links (                -- Outlook message ↔ lead/project
  message_id text primary key,
  subject text, sender text,
  lead_id uuid references public.leads(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  linked_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ───────────────────────── marketing ─────────────────────────
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('Instagram','LinkedIn','Facebook')),
  publish_on timestamptz, title text not null, body text, media_paths text[] not null default '{}',
  status text not null default 'Idea' check (status in ('Idea','Draft','Scheduled','Published','Failed')),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null, audience jsonb not null default '{}', subject text, body_html text,
  send_at timestamptz, status text not null default 'Draft' check (status in ('Draft','Scheduled','Sent')),
  stats jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  trigger_key text not null, action_key text not null, description text not null,
  enabled boolean not null default false, config jsonb not null default '{}'
);

-- ───────────────────────── HR (admin only) ─────────────────────────
create table public.hr_staff (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  contract text, start_date date, pay text, holiday_days_per_year int default 22,
  holiday_days_left numeric(5,1), notes text
);
create table public.hr_leave (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'Holiday', starts_on date not null, ends_on date not null, days numeric(5,1) not null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Declined','Recorded')),
  created_at timestamptz not null default now()
);
create table public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  name text not null, file_path text not null, dated date,
  created_at timestamptz not null default now()
);

-- staff may request their own leave without seeing HR data: a narrow function
create or replace function public.request_leave(p_kind text, p_start date, p_end date, p_days numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_internal() then raise exception 'not allowed'; end if;
  insert into public.hr_leave(profile_id, kind, starts_on, ends_on, days) values (auth.uid(), p_kind, p_start, p_end, p_days) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────── updated_at triggers ─────────────────────────
do $$ declare t text; begin
  foreach t in array array['clients','contacts','leads','suppliers','supplier_rates','proposals','proposal_lines','proposal_line_costs','projects','expenses','notes','forms']
  loop execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch()', t); end loop;
end $$;

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles enable row level security;
create policy "staff read profiles" on public.profiles for select using (public.is_internal() or id = auth.uid());
create policy "admin manages profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "user edits own name" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

-- internal business tables: all internal staff read & write
do $$ declare t text; begin
  foreach t in array array['clients','contacts','leads','suppliers','supplier_rates','proposals','proposal_days','proposal_lines','proposal_line_costs',
                           'projects','project_services','project_service_costs','client_payments','expenses','events','signature_requests',
                           'forms','form_responses','email_links','social_posts','email_campaigns','automations','chat_channels']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "internal staff" on public.%I for all using (public.is_internal()) with check (public.is_internal())', t);
  end loop;
end $$;

-- expenses: anyone internal can add; only admin/finance approve or edit others' expenses
drop policy "internal staff" on public.expenses;
create policy "internal read expenses" on public.expenses for select using (public.is_internal());
create policy "internal add expenses" on public.expenses for insert with check (public.is_internal() and (status = 'To review' or public.my_role() in ('admin','finance')));
create policy "owner edits pending" on public.expenses for update using (public.is_internal() and created_by = auth.uid() and status = 'To review') with check (status = 'To review');
create policy "admin finance manage" on public.expenses for all using (public.my_role() in ('admin','finance')) with check (public.my_role() in ('admin','finance'));

-- notes: private to the owner unless shared or linked to a project
alter table public.notes enable row level security;
create policy "own notes" on public.notes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "shared notes readable" on public.notes for select using (public.is_internal() and (shared or project_id is not null));

-- chat messages: internal; direct messages only for members
alter table public.chat_messages enable row level security;
create policy "read channel messages" on public.chat_messages for select using (
  public.is_internal() and exists (select 1 from public.chat_channels c where c.id = channel_id and (not c.is_direct or auth.uid() = any(c.member_ids))));
create policy "post as self" on public.chat_messages for insert with check (
  author_id = auth.uid() and public.is_internal() and exists (select 1 from public.chat_channels c where c.id = channel_id and (not c.is_direct or auth.uid() = any(c.member_ids))));
drop policy "internal staff" on public.chat_channels;
create policy "see channels" on public.chat_channels for select using (public.is_internal() and (not is_direct or auth.uid() = any(member_ids)));
create policy "create channels" on public.chat_channels for insert with check (public.is_internal());
create policy "admin edits channels" on public.chat_channels for update using (public.is_admin());

-- HR: admin only
do $$ declare t text; begin
  foreach t in array array['hr_staff','hr_leave','hr_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "admin only" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- no anonymous access anywhere
revoke all on all tables in schema public from anon;

-- ───────────────────────── client-facing access (portal, Companion, public links) ─────────────────────────
-- Public pages never read tables directly. They call these functions, which return
-- client-facing fields only. Costs, margins and supplier data are not reachable from here.
create or replace function public.client_proposal(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', l.title, 'client', c.name, 'dates', l.dates_text, 'pax', p.pax, 'version', p.version,
    'currency', p.quote_currency, 'valid_until', p.valid_until, 'single_supplement', p.single_supplement, 'intro', p.intro,
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day_number, 'title', d.title,
               'items', (select coalesce(jsonb_agg(jsonb_build_object('service', pl.service, 'description', pl.description) order by pl.sort),'[]')
                         from public.proposal_lines pl where pl.proposal_id = p.id and pl.day_number = d.day_number)) order by d.day_number),'[]')
             from public.proposal_days d where d.proposal_id = p.id),
    'total', (select coalesce(sum(sell_total_quote),0) from public.proposal_lines where proposal_id = p.id))
  from public.proposals p join public.leads l on l.id = p.lead_id left join public.clients c on c.id = l.client_id
  where p.share_token = p_token and p.status in ('Sent','Approved')
$$;
create or replace function public.public_form(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', f.name, 'fields', f.fields) from public.forms f where f.public_token = p_token and f.is_open
$$;
create or replace function public.submit_form(p_token uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_form uuid;
begin
  select id into v_form from public.forms where public_token = p_token and is_open;
  if v_form is null then raise exception 'form closed'; end if;
  insert into public.form_responses(form_id, answers) values (v_form, p_answers);
end $$;
grant execute on function public.public_form(uuid), public.submit_form(uuid, jsonb), public.client_proposal(uuid) to anon, authenticated;
