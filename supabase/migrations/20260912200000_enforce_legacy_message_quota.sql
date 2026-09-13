-- Keep the approved 1.0 client working while making the 15-message lifetime
-- allowance authoritative for both legacy table inserts and the new RPC.
-- New clients send through public.send_place_message() with a non-null
-- client_request_id; legacy clients omit that field.

begin;

-- Close the race with RPC sends and legacy inserts while existing rows are
-- reconciled and the trigger/policy become active.
select pg_advisory_xact_lock(hashtextextended('message-quota-cutover', 0));
lock table public.messages in share row exclusive mode;

insert into private.message_usage as usage (user_id, sent_count, updated_at)
select m.user_id, count(*)::integer, now()
from public.messages m
group by m.user_id
on conflict (user_id) do update
set sent_count = greatest(usage.sent_count, excluded.sent_count),
    updated_at = now();

create or replace function private.enforce_legacy_message_quota()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  next_sent_count integer;
  caller_is_admin boolean := false;
  caller_has_pro boolean := false;
  caller_has_review_access boolean := false;
  caller_has_unlimited boolean := false;
begin
  -- Trusted service jobs have no end-user JWT. The new RPC supplies a request
  -- id and owns its counter update, so only legacy rows reach the branch below.
  if current_user_id is null or new.client_request_id is not null then
    return new;
  end if;

  if new.user_id is distinct from current_user_id then
    raise exception 'Message ownership must match the authenticated user'
      using errcode = '42501';
  end if;

  new.body := btrim(new.body);
  if new.body is null or char_length(new.body) = 0 then
    raise exception 'Message body is required' using errcode = '22023';
  end if;
  if char_length(new.body) > 500 then
    raise exception 'Message body exceeds 500 characters' using errcode = '22001';
  end if;

  perform pg_advisory_xact_lock_shared(
    hashtextextended('message-quota-cutover', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('message-quota:' || current_user_id::text, 0)
  );

  select coalesce(p.is_admin, false)
  into caller_is_admin
  from public.profiles p
  where p.id = current_user_id;
  caller_is_admin := coalesce(caller_is_admin, false);

  select exists (
    select 1
    from private.subscription_entitlements e
    where e.user_id = current_user_id
      and e.entitlement_id = 'pro'
      and e.is_active = true
      and e.environment in ('production', 'sandbox')
      and (e.expires_at is null or e.expires_at > now())
  ) into caller_has_pro;

  caller_has_review_access := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'app_review_access') = 'true',
    false
  );
  caller_has_unlimited := caller_is_admin or caller_has_pro or caller_has_review_access;

  -- The row update is the concurrency boundary. A rejected sixteenth insert
  -- rolls this increment back together with the message row.
  insert into private.message_usage as usage (user_id, sent_count, updated_at)
  values (current_user_id, 1, now())
  on conflict (user_id) do update
  set sent_count = usage.sent_count + 1,
      updated_at = now()
  returning sent_count into next_sent_count;

  if not caller_has_unlimited and next_sent_count > 15 then
    raise exception 'Free message limit reached' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_legacy_message_quota()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_legacy_message_quota on public.messages;
create trigger enforce_legacy_message_quota
before insert on public.messages
for each row
when (new.client_request_id is null)
execute function private.enforce_legacy_message_quota();

-- A direct client must remain on the null request-id legacy path. The
-- security-definer RPC bypasses RLS and is the only writer allowed to attach
-- an idempotency key.
drop policy if exists "Users send messages" on public.messages;
drop policy if exists "Checked-in users send messages" on public.messages;
create policy "Checked-in users send messages"
on public.messages
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and client_request_id is null
  and private.has_active_checkin(place_id)
);

commit;
