-- PostgREST includes the conflict key in the UPDATE part of an upsert.
-- Profile rows already exist by the time onboarding finishes, so the client
-- needs UPDATE on `id` even though its value does not change. RLS still
-- requires both the old and new id to equal auth.uid(), keeping the key
-- immutable from the user's point of view.
grant update (id) on public.profiles to authenticated;
