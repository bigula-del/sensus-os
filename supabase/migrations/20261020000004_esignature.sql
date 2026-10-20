-- E-signature: signers open a secret link, read the document and sign by drawing.
-- Each step is recorded in an audit trail (time, IP address, browser, document fingerprint).
-- This is a simple electronic signature (eIDAS); contracts that legally need a qualified
-- signature should go through a certified provider.

alter table public.signature_requests add column if not exists proposal_id uuid references public.proposals(id) on delete set null;
alter table public.signature_requests add column if not exists message text;
alter table public.signature_requests add column if not exists document_sha256 text;
alter table public.signature_requests add column if not exists signed_name text;
alter table public.signature_requests add column if not exists signature_png text;

-- Private bucket for documents sent for signature (PDF). Staff only; signers get a short-lived link from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "staff read documents" on storage.objects;
drop policy if exists "staff upload documents" on storage.objects;
create policy "staff read documents" on storage.objects for select using (bucket_id = 'documents' and public.is_internal());
create policy "staff upload documents" on storage.objects for insert with check (bucket_id = 'documents' and public.is_internal());

-- What the signer may see: the document name, who it is for, status. Opening it marks it Viewed.
create or replace function public.sign_open(p_token uuid, p_ip text, p_ua text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.signature_requests%rowtype; v_share uuid;
begin
  select * into r from public.signature_requests where token = p_token for update;
  if r.id is null or r.status in ('Draft','Declined') then return null; end if;
  if r.status = 'Sent' then
    update public.signature_requests
       set status = 'Viewed', viewed_at = now(),
           audit = audit || jsonb_build_object('at', now(), 'event', 'viewed', 'ip', left(p_ip, 64), 'browser', left(p_ua, 300))
     where id = r.id;
  end if;
  select share_token into v_share from public.proposals where id = r.proposal_id;
  return jsonb_build_object('name', r.name, 'signer', r.signer_name, 'message', r.message,
    'status', case when r.status = 'Sent' then 'Viewed' else r.status end,
    'signed_at', r.signed_at, 'signed_name', r.signed_name, 'has_file', r.file_path is not null,
    'proposal_token', v_share, 'fingerprint', r.document_sha256);
end $$;

create or replace function public.sign_complete(p_token uuid, p_name text, p_signature text, p_ip text, p_ua text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.signature_requests%rowtype;
begin
  select * into r from public.signature_requests where token = p_token for update;
  if r.id is null or r.status not in ('Sent','Viewed') then return false; end if;
  if coalesce(length(trim(p_name)),0) < 2 then raise exception 'name required'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then raise exception 'signature required'; end if;
  update public.signature_requests
     set status = 'Signed', signed_at = now(), signed_name = left(trim(p_name), 200), signature_png = p_signature,
         audit = audit || jsonb_build_object('at', now(), 'event', 'signed', 'name', left(trim(p_name), 200),
                                             'ip', left(p_ip, 64), 'browser', left(p_ua, 300), 'fingerprint', r.document_sha256)
   where id = r.id;
  return true;
end $$;

create or replace function public.sign_decline(p_token uuid, p_reason text, p_ip text, p_ua text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.signature_requests%rowtype;
begin
  select * into r from public.signature_requests where token = p_token for update;
  if r.id is null or r.status not in ('Sent','Viewed') then return false; end if;
  update public.signature_requests
     set status = 'Declined',
         audit = audit || jsonb_build_object('at', now(), 'event', 'declined', 'reason', left(p_reason, 500), 'ip', left(p_ip, 64), 'browser', left(p_ua, 300))
   where id = r.id;
  return true;
end $$;

-- the file path is only handed to the server (service role), never to the browser
create or replace function public.sign_file_path(p_token uuid)
returns text language sql stable security definer set search_path = public as $$
  select file_path from public.signature_requests where token = p_token and status in ('Sent','Viewed','Signed')
$$;

revoke all on function public.sign_open(uuid, text, text), public.sign_complete(uuid, text, text, text, text),
  public.sign_decline(uuid, text, text, text), public.sign_file_path(uuid) from public;
grant execute on function public.sign_open(uuid, text, text), public.sign_complete(uuid, text, text, text, text),
  public.sign_decline(uuid, text, text, text) to anon, authenticated;
revoke all on function public.sign_file_path(uuid) from anon, authenticated;
grant execute on function public.sign_file_path(uuid) to service_role;
