-- Run only after every supported client sends messages through
-- public.send_place_message(). Running this earlier will break message sending
-- in the currently approved App Store / Play Store build.
--
-- The table lock closes the race between the final legacy direct INSERT and the
-- counter backfill. Once this transaction commits, authenticated clients can
-- send messages only through the quota-enforcing RPC. Service-role operations
-- keep their trusted table access.
--
-- The compatibility trigger installed by
-- 20260912200000_enforce_legacy_message_quota.sql already enforces the limit
-- for old builds. This later cutover only retires their direct-write API.

begin;

-- The table lock drains existing inserts and blocks new ones until the final
-- backfill, trigger removal, and privilege cutover commit. Do not take the
-- advisory lock first here: a legacy INSERT owns its table lock before its
-- BEFORE trigger takes the shared advisory lock, and reversing that order can
-- deadlock the cutover.
lock table public.messages in share row exclusive mode;

insert into private.message_usage as usage (user_id, sent_count, updated_at)
select m.user_id, count(*)::integer, now()
from public.messages m
group by m.user_id
on conflict (user_id) do update
set sent_count = greatest(usage.sent_count, excluded.sent_count),
    updated_at = now();

drop policy if exists "Users send messages" on public.messages;
drop policy if exists "Checked-in users send messages" on public.messages;
drop trigger if exists enforce_legacy_message_quota on public.messages;
revoke insert on public.messages from authenticated;

commit;
