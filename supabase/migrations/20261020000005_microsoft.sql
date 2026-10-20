-- Microsoft 365 connection per team member. Tokens are encrypted by the app and this table
-- is reachable ONLY by the server (service role): no browser, staff or visitor can read it.
create table if not exists public.ms_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ms_accounts enable row level security;
revoke all on public.ms_accounts from anon, authenticated;

-- email links: remember who linked and the date of the email
alter table public.email_links add column if not exists received_at timestamptz;
alter table public.email_links add column if not exists mailbox text;
-- a copy of the email's text, so everyone on the team can read it from the lead or project
alter table public.email_links add column if not exists recipients text;
alter table public.email_links add column if not exists body_text text;
create index if not exists email_links_lead_idx on public.email_links(lead_id);
create index if not exists email_links_project_idx on public.email_links(project_id);
