-- Run only after every supported client uses attempt_check_in/end_check_in.
-- Until this cutover, older clients can bypass the daily quota with direct SQL.
begin;
revoke insert, update, delete on public.check_ins from authenticated;
commit;
