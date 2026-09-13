begin;

select plan(9);

select has_function(
  'private',
  'enforce_legacy_message_quota',
  array[]::text[],
  'Legacy sends use a private quota trigger'
);

select ok(
  (select p.prosecdef from pg_catalog.pg_proc p
   where p.oid = 'private.enforce_legacy_message_quota()'::regprocedure),
  'The legacy trigger can inspect private entitlement data'
);

select ok(
  not has_function_privilege(
    'authenticated', 'private.enforce_legacy_message_quota()', 'EXECUTE'
  ),
  'Clients cannot invoke the trigger directly'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.messages'::regclass
      and t.tgname = 'enforce_legacy_message_quota'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ),
  'The legacy quota trigger is enabled'
);

select ok(
  (select p.with_check like '%client_request_id IS NULL%'
   from pg_catalog.pg_policies p
   where p.schemaname = 'public'
     and p.tablename = 'messages'
     and p.policyname = 'Checked-in users send messages'),
  'Direct inserts cannot impersonate the RPC path'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '11000000-0000-4000-8000-000000000001',
  'legacy-message-quota@example.invalid',
  '{}'::jsonb
);

insert into public.profiles (id, first_name, last_name, is_admin)
values (
  '11000000-0000-4000-8000-000000000001', 'Legacy', 'Tester', false
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    is_admin = excluded.is_admin;

insert into public.places (
  id, name, category, city, latitude, longitude, source, status
)
values (
  '21000000-0000-4000-8000-000000000001',
  'Legacy message quota test place', 'Cafe', 'Istanbul',
  41.0001, 29.0001, 'google', 'approved'
);

insert into public.check_ins (id, place_id, user_id, is_active)
values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';

do $$
begin
  for message_number in 1..15 loop
    insert into public.messages (place_id, user_id, body)
    values (
      '21000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      'Legacy message ' || message_number::text
    );
  end loop;
end;
$$;

select is(
  (select count(*)::bigint from public.messages
   where user_id = '11000000-0000-4000-8000-000000000001'),
  15::bigint,
  'The old client can still send its first fifteen messages'
);

select results_eq(
  $$ select messages_remaining, has_unlimited, access_tier
     from public.get_message_access() $$,
  $$ values (0::integer, false, 'free'::text) $$,
  'Legacy sends update the shared lifetime counter'
);

select throws_ok(
  $$ insert into public.messages (place_id, user_id, body)
     values (
       '21000000-0000-4000-8000-000000000001',
       '11000000-0000-4000-8000-000000000001',
       'Legacy message 16'
     ) $$,
  '42501',
  'Free message limit reached',
  'The sixteenth legacy message is rejected'
);

select throws_ok(
  $$ insert into public.messages (place_id, user_id, body, client_request_id)
     values (
       '21000000-0000-4000-8000-000000000001',
       '11000000-0000-4000-8000-000000000001',
       'Cannot spoof RPC path',
       '41000000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  null,
  'A direct client cannot bypass the trigger with a request id'
);

select * from finish();
rollback;
