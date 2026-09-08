-- Data-preserving emergency rollback. Disable EXPO_PUBLIC_ENABLE_CHECKIN_CREDITS
-- in the app first. Tables and usage history are intentionally retained.
begin;
grant select, insert, update on public.check_ins to authenticated;

drop function if exists public.get_check_in_access();
drop function if exists private.read_check_in_access();
drop function if exists public.end_check_in(uuid);
drop function if exists private.perform_check_out(uuid);
drop function if exists public.attempt_check_in(uuid, uuid);
drop function if exists private.perform_check_in(uuid, uuid);
drop function if exists public.sync_revenuecat_entitlement(uuid, text, boolean, timestamptz, text, text, text);
drop function if exists private.sync_subscription_entitlement(uuid, text, boolean, timestamptz, text, text, text);
commit;
