-- Minimal, server-only subscription lifecycle history for churn analysis.
-- We intentionally store no email, IP address, device identifier or raw
-- RevenueCat payload. Rows disappear when the corresponding auth user is
-- deleted.
create table if not exists private.subscription_lifecycle_events (
  event_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  product_id text,
  entitlement_ids text[] not null default '{}',
  cancel_reason text,
  expiration_reason text,
  store text,
  environment text not null default 'production'
    check (environment in ('production', 'sandbox')),
  event_at timestamptz not null,
  expires_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists subscription_lifecycle_events_user_time_idx
  on private.subscription_lifecycle_events (user_id, event_at desc);
create index if not exists subscription_lifecycle_events_type_time_idx
  on private.subscription_lifecycle_events (event_type, event_at desc);

alter table private.subscription_lifecycle_events enable row level security;
revoke all on private.subscription_lifecycle_events from public, anon, authenticated;
grant select, insert on private.subscription_lifecycle_events to service_role;

create or replace function private.record_subscription_lifecycle_event(
  target_event_id text,
  target_user_id uuid,
  target_event_type text,
  target_product_id text,
  target_entitlement_ids text[],
  target_cancel_reason text,
  target_expiration_reason text,
  target_store text,
  target_environment text,
  target_event_at timestamptz,
  target_expires_at timestamptz
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.subscription_lifecycle_events (
    event_id,
    user_id,
    event_type,
    product_id,
    entitlement_ids,
    cancel_reason,
    expiration_reason,
    store,
    environment,
    event_at,
    expires_at
  ) values (
    target_event_id,
    target_user_id,
    upper(target_event_type),
    target_product_id,
    coalesce(target_entitlement_ids, '{}'),
    target_cancel_reason,
    target_expiration_reason,
    target_store,
    case when lower(target_environment) = 'sandbox' then 'sandbox' else 'production' end,
    target_event_at,
    target_expires_at
  )
  on conflict (event_id) do nothing;
$$;

revoke all on function private.record_subscription_lifecycle_event(
  text, uuid, text, text, text[], text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function private.record_subscription_lifecycle_event(
  text, uuid, text, text, text[], text, text, text, text, timestamptz, timestamptz
) to service_role;

create or replace function public.record_revenuecat_lifecycle_event(
  target_event_id text,
  target_user_id uuid,
  target_event_type text,
  target_product_id text,
  target_entitlement_ids text[],
  target_cancel_reason text,
  target_expiration_reason text,
  target_store text,
  target_environment text,
  target_event_at timestamptz,
  target_expires_at timestamptz
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_subscription_lifecycle_event(
    target_event_id,
    target_user_id,
    target_event_type,
    target_product_id,
    target_entitlement_ids,
    target_cancel_reason,
    target_expiration_reason,
    target_store,
    target_environment,
    target_event_at,
    target_expires_at
  );
$$;

revoke all on function public.record_revenuecat_lifecycle_event(
  text, uuid, text, text, text[], text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_revenuecat_lifecycle_event(
  text, uuid, text, text, text[], text, text, text, text, timestamptz, timestamptz
) to service_role;
