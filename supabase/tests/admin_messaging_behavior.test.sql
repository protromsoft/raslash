begin;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'message-free-user@example.invalid',
    '{}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'message-admin-user@example.invalid',
    '{}'::jsonb
  );

insert into public.profiles (id, first_name, last_name, is_admin)
values
  ('10000000-0000-4000-8000-000000000001', 'Free', 'Tester', false),
  ('10000000-0000-4000-8000-000000000002', 'Admin', 'Tester', true)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    is_admin = excluded.is_admin;

insert into public.places (
  id,
  name,
  category,
  city,
  latitude,
  longitude,
  source,
  status
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'Message quota test place',
    'Cafe',
    'Istanbul',
    41.0001,
    29.0001,
    'google',
    'approved'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'No check-in test place',
    'Cafe',
    'Istanbul',
    41.0002,
    29.0002,
    'google',
    'approved'
  );

insert into public.check_ins (id, place_id, user_id, is_active)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select * from public.send_place_message(
      '20000000-0000-4000-8000-000000000002',
      'No active check-in',
      '40000000-0000-4000-8000-000000000099'
    )
  $$,
  '42501',
  'Active check-in required',
  'A normal user cannot message a place without an active check-in'
);

select results_eq(
  $$
    select messages_remaining, has_unlimited, access_tier
    from public.get_message_access()
  $$,
  $$ values (15::integer, false, 'free'::text) $$,
  'A new free account starts with fifteen lifetime messages'
);

select results_eq(
  $$
    select decision, messages_remaining, has_unlimited
    from public.send_place_message(
      '20000000-0000-4000-8000-000000000001',
      'Message 1',
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('sent'::text, 14::integer, false) $$,
  'The first free message consumes one credit'
);

select results_eq(
  $$
    select decision, messages_remaining, has_unlimited
    from public.send_place_message(
      '20000000-0000-4000-8000-000000000001',
      'Message 1',
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('already_processed'::text, 14::integer, false) $$,
  'Retrying the same request is idempotent'
);

select is(
  (
    select count(*)::bigint
    from public.messages
    where user_id = '10000000-0000-4000-8000-000000000001'
      and client_request_id = '40000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'An idempotent retry creates only one message row'
);

select throws_ok(
  $$
    select * from public.send_place_message(
      '20000000-0000-4000-8000-000000000001',
      'Changed payload',
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'request_id was already used with different message data',
  'A request id cannot be reused with a different payload'
);

do $$
begin
  for message_number in 2..15 loop
    perform *
    from public.send_place_message(
      '20000000-0000-4000-8000-000000000001',
      'Message ' || message_number::text,
      (
        '40000000-0000-4000-8000-' ||
        lpad(message_number::text, 12, '0')
      )::uuid
    );
  end loop;
end;
$$;

select results_eq(
  $$
    select messages_remaining, has_unlimited, access_tier
    from public.get_message_access()
  $$,
  $$ values (0::integer, false, 'free'::text) $$,
  'The free balance reaches zero after fifteen sends'
);

select results_eq(
  $$
    select decision, messages_remaining, has_unlimited
    from public.send_place_message(
      '20000000-0000-4000-8000-000000000001',
      'Message 16 is blocked',
      '40000000-0000-4000-8000-000000000016'
    )
  $$,
  $$ values ('limit_reached'::text, 0::integer, false) $$,
  'The sixteenth free message is rejected without an exception'
);

select is(
  (
    select count(*)::bigint
    from public.messages
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  15::bigint,
  'A rejected sixteenth message is not stored'
);

reset role;

insert into private.subscription_entitlements (
  user_id,
  entitlement_id,
  is_active,
  expires_at,
  store,
  environment,
  revenuecat_event_id
)
values (
  '10000000-0000-4000-8000-000000000001',
  'pro',
  true,
  now() + interval '30 days',
  'app_store',
  'sandbox',
  'message-quota-test-pro'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select decision, messages_remaining, has_unlimited
    from public.send_place_message(
      '20000000-0000-4000-8000-000000000001',
      'Pro message 16',
      '40000000-0000-4000-8000-000000000017'
    )
  $$,
  $$ values ('sent'::text, 0::integer, true) $$,
  'A trusted active Pro entitlement removes the send limit'
);

select results_eq(
  $$
    select messages_remaining, has_unlimited, access_tier
    from public.get_message_access()
  $$,
  $$ values (0::integer, true, 'pro'::text) $$,
  'Message access reports the trusted Pro tier'
);

reset role;

select is(
  (
    select sent_count
    from private.message_usage
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  16,
  'Lifetime usage remains monotonic while the user is Pro'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select results_eq(
  $$
    select messages_remaining, has_unlimited, access_tier
    from public.get_message_access()
  $$,
  $$ values (15::integer, true, 'admin'::text) $$,
  'A database admin receives unlimited message access'
);

select results_eq(
  $$
    select decision, has_unlimited
    from public.send_place_message(
      '20000000-0000-4000-8000-000000000002',
      'Admin moderation test',
      '40000000-0000-4000-8000-000000000018'
    )
  $$,
  $$ values ('sent'::text, true) $$,
  'An admin can send a moderation test message without a check-in'
);

select ok(
  (
    select max(total_count) >= 17
    from public.admin_list_messages(50, 0, null)
  ),
  'An admin can list the complete message audit stream'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from public.admin_list_messages(50, 0, null) $$,
  '42501',
  'Admin required',
  'A non-admin cannot read the message audit stream'
);

select throws_ok(
  $$ select * from public.admin_list_notifications(50, 0, null) $$,
  '42501',
  'Admin required',
  'A non-admin cannot read the notification audit stream'
);

select throws_ok(
  $$
    select public.admin_delete_notification(
      '50000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Admin required',
  'A non-admin cannot delete another user notification'
);

reset role;

insert into public.notifications (
  id,
  user_id,
  title,
  body,
  type,
  place_id
)
values (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Admin notification test',
  'Delete this test notification',
  'system',
  '20000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select ok(
  exists (
    select 1
    from public.admin_list_notifications(50, 0, 'Admin notification test') n
    where n.notification_id = '50000000-0000-4000-8000-000000000001'
  ),
  'An admin can find a notification through the bounded audit RPC'
);

select is(
  public.admin_delete_notification('50000000-0000-4000-8000-000000000001'),
  true,
  'An admin can permanently delete one application inbox notification'
);

reset role;

select is(
  (
    select count(*)::bigint
    from public.notifications
    where id = '50000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'The deleted notification row is gone'
);

select * from finish();

rollback;
