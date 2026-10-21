-- Nightly photo cleanup. Files are deleted through the Storage API by the
-- cleanup-photos Edge Function (deleting storage.objects rows in SQL would
-- leave the files behind); this migration only says WHICH files may go.
--
--   chat-photos   older than 48 h (stories show for 24 h), unless the message
--                 has a pending report an admin still needs to see.
--   review-photos older than 24 h and not used by any rating (an upload whose
--                 rating was never saved).
--
-- Message and rating rows are kept; only files are removed.

create or replace function public.photo_cleanup_candidates(max_rows integer default 500)
returns table(bucket text, path text)
language sql
stable
security definer
set search_path to ''
as $function$
  (
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id = 'chat-photos'
      and o.created_at < now() - interval '48 hours'
      and not exists (
        select 1
        from public.messages m
        join public.message_reports r on r.message_id = m.id and r.status = 'pending'
        where m.photo_path = o.name
      )
    order by o.created_at
    limit max_rows
  )
  union all
  (
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id = 'review-photos'
      and o.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.ratings r where r.photo_path = o.name)
    order by o.created_at
    limit max_rows
  );
$function$;

-- Only the Edge Function (service role) may ask.
revoke all on function public.photo_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.photo_cleanup_candidates(integer) to service_role;
