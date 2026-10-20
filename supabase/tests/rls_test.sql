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

-- ── projects from approved proposals ──
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
update public.proposals set fx = '{"EUR":1,"USD":1.2}', foc_places = 2, pax = 20 where id = '30000000-0000-0000-0000-000000000001';
update public.proposal_line_costs set net_unit = 60, net_currency = 'USD', margin_pct = 20 where line_id = '50000000-0000-0000-0000-000000000001';
select pg_temp.assert(public.approve_proposal('30000000-0000-0000-0000-000000000001') is not null,'sales approves a proposal into a project');
select pg_temp.assert((select code from public.projects) = '680735','project code is the lead number');
select pg_temp.assert((select stage from public.leads where id='20000000-0000-0000-0000-000000000001') = 'Won','lead moves to Won');
select pg_temp.assert((select net_eur from public.project_service_costs) = 1100,'net cost = US$60 x 22 people / 1.2');
select pg_temp.assert((select sell_eur from public.project_services) = 6840,'client price carried into the project');
do $$ begin perform public.approve_proposal('30000000-0000-0000-0000-000000000001'); raise exception 'FAILED: approved twice';
exception when others then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  a proposal cannot be approved twice'; end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert((select count(*) from public.projects)=0,'client cannot read projects');
select pg_temp.assert((select count(*) from public.project_service_costs)=0,'client cannot read project costs');
do $$ begin perform public.approve_proposal('30000000-0000-0000-0000-000000000001'); raise exception 'FAILED: client approved';
exception when others then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  client cannot approve proposals'; end $$;
reset role;
-- receipts bucket
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into storage.objects(bucket_id, name) values ('receipts','2026/test.jpg');
select pg_temp.assert((select count(*) from storage.objects where bucket_id='receipts')=1,'staff uploads and reads receipts');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert((select count(*) from storage.objects where bucket_id='receipts')=0,'client cannot see receipts');
reset role;
\echo ALL PROJECT TESTS PASSED

-- ── e-signature ──
insert into public.signature_requests(id, name, signer_name, signer_email, status, token, document_sha256)
values ('70000000-0000-0000-0000-000000000001','Service agreement','Ana Ribeiro','ana@example.com','Sent','80000000-0000-0000-0000-000000000001','abc123'),
       ('70000000-0000-0000-0000-000000000002','Draft contract','Rui','rui@example.com','Draft','80000000-0000-0000-0000-000000000002',null);
set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.assert((public.sign_open('80000000-0000-0000-0000-000000000001','1.2.3.4','test')->>'status') = 'Viewed','signer opens link: marked viewed');
select pg_temp.assert(public.sign_open('80000000-0000-0000-0000-000000000002','1.2.3.4','test') is null,'draft cannot be opened by signer');
select pg_temp.assert(public.sign_open(gen_random_uuid(),'1.2.3.4','test') is null,'wrong link shows nothing');
do $$ begin perform public.sign_complete('80000000-0000-0000-0000-000000000001','Ana Ribeiro','not-an-image','1.2.3.4','test'); raise exception 'FAILED: accepted empty signature';
exception when others then if sqlerrm like 'FAILED%' then raise; end if; raise notice 'ok  signature image required'; end $$;
select pg_temp.assert(public.sign_complete('80000000-0000-0000-0000-000000000001','Ana Ribeiro','data:image/png;base64,AAAA','1.2.3.4','test'),'signer signs');
select pg_temp.assert(not public.sign_complete('80000000-0000-0000-0000-000000000001','Ana Ribeiro','data:image/png;base64,AAAA','1.2.3.4','test'),'cannot sign twice');
do $$ begin perform public.sign_file_path('80000000-0000-0000-0000-000000000001'); raise exception 'FAILED: anon read file path';
exception when insufficient_privilege then raise notice 'ok  signer cannot read the storage path directly'; end $$;
do $$ begin perform count(*) from public.signature_requests; raise exception 'FAILED: anon read requests';
exception when insufficient_privilege then raise notice 'ok  anonymous visitors cannot list signature requests'; end $$;
reset role;
select pg_temp.assert((select jsonb_array_length(audit) from public.signature_requests where id='70000000-0000-0000-0000-000000000001') = 2,'audit trail has viewed + signed');
select pg_temp.assert((select audit->1->>'fingerprint' from public.signature_requests where id='70000000-0000-0000-0000-000000000001') = 'abc123','audit records document fingerprint');
\echo ALL SIGNATURE TESTS PASSED

-- ── microsoft tokens are server-only ──
insert into public.ms_accounts(profile_id, email, refresh_token_enc) values ('00000000-0000-0000-0000-000000000001','m@sensustravel.com','enc');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin perform count(*) from public.ms_accounts; raise exception 'FAILED: staff read tokens';
exception when insufficient_privilege then raise notice 'ok  even the admin cannot read Microsoft tokens from the browser'; end $$;
reset role;
set role anon;
do $$ begin perform count(*) from public.ms_accounts; raise exception 'FAILED: anon read tokens';
exception when insufficient_privilege then raise notice 'ok  visitors cannot read Microsoft tokens'; end $$;
reset role;
\echo ALL MICROSOFT TESTS PASSED

-- ── itineraries: travellers see only shared itineraries, never internal notes ──
insert into public.itineraries(id,title,status,share_token,internal_notes,lead_id) values
 ('80000000-0000-0000-0000-000000000001','Lisbon & Douro','Shared','81000000-0000-0000-0000-000000000001','supplier pays 10% commission','20000000-0000-0000-0000-000000000001'),
 ('80000000-0000-0000-0000-000000000002','Draft trip','Draft','81000000-0000-0000-0000-000000000002',null,null);
insert into public.itinerary_days(itinerary_id,day_number,title) values ('80000000-0000-0000-0000-000000000001',1,'Arrival');
insert into public.itinerary_items(itinerary_id,day_number,sort,kind,title,start_time,internal_notes,booking_ref) values
 ('80000000-0000-0000-0000-000000000001',1,1,'transfer','Airport pick-up','10:30','driver net €80','TP1234');
set role anon;
do $$ begin perform count(*) from public.itineraries; raise exception 'FAILED: visitors read itineraries';
exception when insufficient_privilege then raise notice 'ok  visitors cannot read itinerary tables'; end $$;
select pg_temp.assert(public.client_itinerary('81000000-0000-0000-0000-000000000001') is not null,'shared itinerary opens with its link');
select pg_temp.assert(public.client_itinerary('81000000-0000-0000-0000-000000000002') is null,'draft itinerary is not visible');
select pg_temp.assert(public.client_itinerary('81000000-0000-0000-0000-000000000001')::text not like '%commission%','itinerary internal notes hidden');
select pg_temp.assert(public.client_itinerary('81000000-0000-0000-0000-000000000001')::text not like '%driver net%','item internal notes hidden');
select pg_temp.assert(public.client_itinerary('81000000-0000-0000-0000-000000000001')->'days'->0->'items'->0->>'start_time' = '10:30','times shown to traveller');
select pg_temp.assert((public.client_itinerary('81000000-0000-0000-0000-000000000001')->>'ref')::int >= 680735,'lead reference shown');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert((select count(*) from public.itineraries)=0,'client accounts cannot list itineraries');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select pg_temp.assert((select count(*) from public.itineraries)=2,'staff read itineraries');
insert into public.itinerary_library(title,kind) values ('Pestana Palace','hotel');
select pg_temp.assert((select count(*) from public.itinerary_library)=1,'staff add to library');
select public.save_itinerary('80000000-0000-0000-0000-000000000002', '{"title":"Porto weekend","pax":12,"destinations":["PT"]}',
  '[{"day_number":1,"title":"Arrival"},{"day_number":2,"title":"Douro"}]',
  '[{"day_number":2,"sort":1,"kind":"meal","title":"Lunch at Quinta","start_time":"13:00"},{"day_number":1,"sort":0,"kind":"transfer","title":"Pick-up"}]');
select pg_temp.assert((select title from public.itineraries where id='80000000-0000-0000-0000-000000000002')='Porto weekend','staff save itinerary header');
select pg_temp.assert((select count(*) from public.itinerary_items where itinerary_id='80000000-0000-0000-0000-000000000002')=2,'staff save itinerary items');
select pg_temp.assert((select count(*) from public.itinerary_days where itinerary_id='80000000-0000-0000-0000-000000000002')=2,'staff save itinerary days');
reset role;
set role anon;
do $$ begin perform public.save_itinerary('80000000-0000-0000-0000-000000000001','{"title":"hacked"}','[]','[]'); raise exception 'FAILED: visitor saved itinerary';
exception when insufficient_privilege then raise notice 'ok  visitors cannot save itineraries'; end $$;
reset role;
select pg_temp.assert((select title from public.itineraries where id='80000000-0000-0000-0000-000000000001')='Lisbon & Douro','itinerary untouched by visitor');
\echo ALL ITINERARY TESTS PASSED
