-- profiles uses column-level grants. The languages, interests and
-- work_preferences columns were added without them, so every save that wrote
-- them (onboarding's last step, profile edit) failed with "permission denied".
-- Same rights as the other member-editable columns. Idempotent.

grant insert (languages, interests, work_preferences) on public.profiles to authenticated;
grant update (languages, interests, work_preferences) on public.profiles to authenticated;
