import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

type RevenueCatWebhook = {
  event?: {
    id?: string;
    app_user_id?: string;
    type?: string;
    product_id?: string;
    entitlement_ids?: string[] | null;
    cancel_reason?: string | null;
    expiration_reason?: string | null;
    environment?: string;
    store?: string;
    event_timestamp_ms?: number;
    expiration_at_ms?: number | null;
  };
};

type RevenueCatSubscriber = {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null }>;
  };
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const revenueCatApiKey = Deno.env.get('REVENUECAT_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !revenueCatApiKey || !supabaseUrl || !serviceRoleKey) {
    return json(500, { message: 'Server configuration missing' });
  }
  if (req.headers.get('Authorization') !== `Bearer ${webhookSecret}`) {
    return json(401, { message: 'Invalid webhook authorization' });
  }

  let payload: RevenueCatWebhook;
  try {
    payload = await req.json();
  } catch {
    return json(400, { message: 'Invalid JSON' });
  }

  const event = payload.event;
  const appUserId = event?.app_user_id;
  if (!event?.id || !event.type || !appUserId || !UUID_RE.test(appUserId)) {
    return json(400, { message: 'Supabase UUID app_user_id, event id and type are required' });
  }

  // Fetch the current subscriber snapshot instead of deriving access from one
  // webhook event. This keeps cancellation, renewal, transfer and out-of-order
  // deliveries from leaving stale entitlement state in Supabase.
  const subscriberResponse = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${revenueCatApiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );
  if (!subscriberResponse.ok) {
    return json(502, { message: 'RevenueCat subscriber lookup failed' });
  }
  const subscriber = (await subscriberResponse.json()) as RevenueCatSubscriber;
  const pro = subscriber.subscriber?.entitlements?.pro;
  const expiresAt = pro?.expires_date ?? null;
  const active = Boolean(pro && (!expiresAt || new Date(expiresAt).getTime() > Date.now()));

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc('sync_revenuecat_entitlement', {
    target_user_id: appUserId,
    target_entitlement_id: 'pro',
    target_is_active: active,
    target_expires_at: expiresAt,
    target_store: event.store?.toLowerCase() ?? null,
    target_environment: event.environment?.toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
    target_event_id: event.id,
  });
  if (error) return json(500, { message: 'Entitlement sync failed' });

  const eventAt = Number.isFinite(event.event_timestamp_ms)
    ? new Date(event.event_timestamp_ms!).toISOString()
    : new Date().toISOString();
  const eventExpiresAt = Number.isFinite(event.expiration_at_ms)
    ? new Date(event.expiration_at_ms!).toISOString()
    : null;
  const { error: lifecycleError } = await admin.rpc('record_revenuecat_lifecycle_event', {
    target_event_id: event.id,
    target_user_id: appUserId,
    target_event_type: event.type,
    target_product_id: event.product_id ?? null,
    target_entitlement_ids: event.entitlement_ids ?? [],
    target_cancel_reason: event.cancel_reason ?? null,
    target_expiration_reason: event.expiration_reason ?? null,
    target_store: event.store?.toLowerCase() ?? null,
    target_environment: event.environment ?? 'production',
    target_event_at: eventAt,
    target_expires_at: eventExpiresAt,
  });
  if (lifecycleError) return json(500, { message: 'Lifecycle event recording failed' });

  return json(200, { received: true, active });
});
