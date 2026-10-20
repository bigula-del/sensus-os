-- Lead numbers: a running reference starting at 680735 (Matheus's numbering).
-- Existing leads are numbered in the order they were created.
create sequence if not exists public.lead_number_seq start 680735;
alter table public.leads add column if not exists number bigint unique;
do $$ declare r record; begin
  for r in select id from public.leads where number is null order by created_at loop
    update public.leads set number = nextval('public.lead_number_seq') where id = r.id;
  end loop;
end $$;
alter table public.leads alter column number set default nextval('public.lead_number_seq');
alter table public.leads alter column number set not null;
revoke all on sequence public.lead_number_seq from anon;
grant usage on sequence public.lead_number_seq to authenticated;

-- the client proposal shows the lead number as its reference (not cost data)
create or replace function public.client_proposal(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ref', l.number,
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
