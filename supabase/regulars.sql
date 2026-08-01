-- Optional helpers for monthly regulars (müdavimler). Safe to re-run.
-- App also tracks visits locally and resets each calendar month.

create or replace view public.place_regulars_month as
select
  c.place_id,
  c.user_id,
  count(*)::int as visits,
  date_trunc('month', timezone('utc', now())) as month_start
from public.check_ins c
where c.checked_in_at >= date_trunc('month', timezone('utc', now()))
group by c.place_id, c.user_id;
