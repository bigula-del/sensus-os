-- Projects from approved proposals, and private storage for receipts.

-- 1. Approving a proposal creates the project file in one step (all or nothing).
--    Runs with the caller's rights, so row level security still applies.
create or replace function public.approve_proposal(p_proposal uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  p public.proposals%rowtype;
  l public.leads%rowtype;
  v_project uuid;
  v_code text;
  r record;
  v_service uuid;
  q numeric;
begin
  if not public.is_internal() then raise exception 'not allowed'; end if;
  select * into p from public.proposals where id = p_proposal for update;
  if p.id is null then raise exception 'proposal not found'; end if;
  if p.status not in ('Sent','Draft') then raise exception 'proposal is %', p.status; end if;
  select * into l from public.leads where id = p.lead_id;
  select id into v_project from public.projects where lead_id = l.id limit 1;
  if v_project is not null then raise exception 'this lead already has a project'; end if;

  v_code := l.number::text;
  q := coalesce((p.fx->>p.quote_currency)::numeric, 1);

  insert into public.projects (code, lead_id, proposal_id, client_id, title, kind, start_date, end_date, pax, status, ops_owner_id)
  values (v_code, l.id, p.id, l.client_id, l.title, l.kind, l.start_date, l.end_date, p.pax, 'Confirmed', auth.uid())
  returning id into v_project;

  for r in
    select pl.sort, pl.day_number, pl.service, pl.units, pl.basis, pl.sell_total_quote, c.supplier_id, c.net_unit, c.net_currency
    from public.proposal_lines pl left join public.proposal_line_costs c on c.line_id = pl.id
    where pl.proposal_id = p.id order by pl.day_number, pl.sort
  loop
    insert into public.project_services (project_id, sort, service, sell_eur)
    values (v_project, r.day_number * 1000 + r.sort, 'Day ' || r.day_number || ' · ' || r.service, round(r.sell_total_quote / q, 2))
    returning id into v_service;
    insert into public.project_service_costs (service_id, supplier_id, net_eur)
    values (v_service, r.supplier_id,
            round(coalesce(r.net_unit,0) * r.units * (case when r.basis = 'pax' then p.pax + p.foc_places else 1 end)
                  / coalesce((p.fx->>coalesce(r.net_currency,'EUR'))::numeric, 1), 2));
  end loop;

  update public.proposals set status = 'Superseded' where lead_id = l.id and status = 'Sent' and id <> p.id;
  update public.proposals set status = 'Approved' where id = p.id;
  update public.leads set stage = 'Won' where id = l.id;
  return v_project;
end $$;
revoke all on function public.approve_proposal(uuid) from public, anon;
grant execute on function public.approve_proposal(uuid) to authenticated;

-- 2. Private bucket for receipts and invoices (photos and PDFs, up to 15 MB). Staff only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "staff read receipts" on storage.objects;
drop policy if exists "staff upload receipts" on storage.objects;
drop policy if exists "finance deletes receipts" on storage.objects;
create policy "staff read receipts" on storage.objects for select using (bucket_id = 'receipts' and public.is_internal());
create policy "staff upload receipts" on storage.objects for insert with check (bucket_id = 'receipts' and public.is_internal());
create policy "finance deletes receipts" on storage.objects for delete using (bucket_id = 'receipts' and public.my_role() in ('admin','finance'));
