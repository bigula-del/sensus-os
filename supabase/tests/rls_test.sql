-- Security tests for the foundation schema. Run against a fresh local database after
-- local_supabase_stub.sql and the migrations. Every check raises an error if a rule fails.
\set ON_ERROR_STOP 1
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','matheus@sensustravel.com','{"full_name":"Matheus"}'),
 ('00000000-0000-0000-0000-000000000002','sofia@sensustravel.com','{"full_name":"Sofia Marques"}'),
 ('00000000-0000-0000-0000-000000000003','client@example.com','{"full_name":"Client"}');
update public.profiles set role='client' where id='00000000-0000-0000-0000-000000000003';

-- seed as superuser
insert into public.clients(id,name) values ('10000000-0000-0000-0000-000000000001','Nova Pharma Group');
insert into public.leads(id,client_id,title,pax,dates_text) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Incentive · Lisbon & Douro',60,'12–15 May 2027');
insert into public.proposals(id,lead_id,status,pax,share_token) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Sent',60,'40000000-0000-0000-0000-000000000001');
insert into public.proposal_days(proposal_id,day_number,title) values ('30000000-0000-0000-0000-000000000001',1,'Arrival');
insert into public.proposal_lines(id,proposal_id,day_number,service,description,sell_total_quote) values ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'Welcome dinner','Palace dinner',6840);
insert into public.proposal_line_costs(line_id,net_unit,margin_pct) values ('50000000-0000-0000-0000-000000000001',95,20);
insert into public.hr_staff(profile_id,pay) values ('00000000-0000-0000-0000-000000000002','€2,450 / month');
insert into public.chat_channels(id,name,is_direct,member_ids) values ('60000000-0000-0000-0000-000000000001','DM',true,array['00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid]);
insert into public.chat_messages(channel_id,author_id,body) values ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','private');

create function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAILED: %', msg; end if; raise notice 'ok  %', msg; end $$;

-- 1. first user is admin, others default to sales
select pg_temp.assert((select role from public.profiles where id='00000000-0000-0000-0000-000000000001')='admin','first user becomes admin');
select pg_temp.assert((select role from public.profiles where id='00000000-0000-0000-0000-000000000002')='sales','new users default to sales');

-- as Sofia (sales)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select pg_temp.assert((select count(*) from public.leads)=1,'sales reads leads');
select pg_temp.assert((select count(*) from public.proposal_line_costs)=1,'sales reads internal net prices');
select pg_temp.assert((select count(*) from public.hr_staff)=0,'sales cannot see HR');
select pg_temp.assert((select count(*) from public.chat_messages)=1,'DM member reads DM');
insert into public.expenses(supplier_name,amount,amount_eur,status) values ('Taxi',20,20,'To review');
select pg_temp.assert((select count(*) from public.expenses)=1,'sales adds expense for review');
do $$ begin insert into public.expenses(supplier_name,amount,amount_eur,status) values ('X',1,1,'Approved'); raise exception 'FAILED: sales self-approved expense';
exception when insufficient_privilege then raise notice 'ok  sales cannot self-approve expenses'; end $$;
do $$ begin update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000002';
exception when insufficient_privilege then null; end $$;
select pg_temp.assert((select role from public.profiles where id='00000000-0000-0000-0000-000000000002')='sales','sales cannot promote self');
select pg_temp.assert(public.request_leave('Holiday','2026-12-23','2026-12-27',3) is not null,'sales can request leave');
insert into public.leads(title) values ('new from sales');
select pg_temp.assert((select number from public.leads where title='new from sales') > (select number from public.leads where title like 'Incentive%'),'new lead gets the next number');
reset role;

-- as the client
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert((select count(*) from public.leads)=0,'client cannot read leads');
select pg_temp.assert((select count(*) from public.proposal_line_costs)=0,'client cannot read net prices');
select pg_temp.assert((select count(*) from public.proposal_lines)=0,'client cannot read proposal tables directly');
select pg_temp.assert((select count(*) from public.expenses)=0,'client cannot read expenses');
select pg_temp.assert((select count(*) from public.project_finance)=0,'client cannot read project finance');
reset role;

-- as anonymous visitor with the share link
set role anon; select set_config('request.jwt.claim.sub','',false);
do $$ begin perform count(*) from public.leads; raise exception 'FAILED: anon read leads';
exception when insufficient_privilege then raise notice 'ok  anonymous visitors cannot read tables'; end $$;
select pg_temp.assert((public.client_proposal('40000000-0000-0000-0000-000000000001')->>'total')::numeric=6840,'share link shows client total');
select pg_temp.assert(public.client_proposal('40000000-0000-0000-0000-000000000001')::text !~* '(net|margin|cost|supplier)','client proposal carries no internal fields');
select pg_temp.assert((public.client_proposal('40000000-0000-0000-0000-000000000001')->>'ref')::bigint = 680735,'client proposal shows the lead number');
select pg_temp.assert(public.client_proposal(gen_random_uuid()) is null,'wrong link shows nothing');
reset role;

-- as Matheus (admin)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select pg_temp.assert((select count(*) from public.hr_staff)=1,'admin sees HR');
select pg_temp.assert((select count(*) from public.hr_leave)=1,'admin sees leave requests');
update public.expenses set status='Approved';
select pg_temp.assert((select count(*) from public.expenses where status='Approved')=1,'admin approves expenses');
reset role;

-- direct messages stay private to members
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000004','ines@sensustravel.com');
update public.profiles set role='operations' where id='00000000-0000-0000-0000-000000000004';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select pg_temp.assert((select count(*) from public.chat_messages)=0,'non-member cannot read DM');
select pg_temp.assert((select count(*) from public.leads)=2,'operations reads leads');
reset role;
\echo ALL SECURITY TESTS PASSED
