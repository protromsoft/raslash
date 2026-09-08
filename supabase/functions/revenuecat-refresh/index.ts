import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

type RevenueCatSubscriber = {
  subscriber?: {
    entitlements?: Record<
      string,
      { expires_date?: string | null; product_identifier?: string | null }
    >;
    subscriptions?: Record<
      string,
      { expires_date?: string | null; is_sandbox?: boolean; store?: string | null }
    >;
  };
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const revenueCatApiKey = Deno.env.get('REVENUECAT_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!revenueCatApiKey || !supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json(500, { message: 'Server configuration missing' });
  }

  // The requested RevenueCat customer is always derived from the verified
  // Supabase session. Clients cannot ask the function to unlock another user.
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const appUserId = authData.user?.id;
  if (authError || !appUserId) return json(401, { message: 'Invalid session' });

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

  const snapshot = (await subscriberResponse.json()) as RevenueCatSubscriber;
  const pro = snapshot.subscriber?.entitlements?.pro;
  const expiresAt = pro?.expires_date ?? null;
  const active = Boolean(pro && (!expiresAt || new Date(expiresAt).getTime() > Date.now()));
  const productId = pro?.product_identifier ?? '';
  const subscription = snapshot.subscriber?.subscriptions?.[productId];
  const environment = subscription?.is_sandbox ? 'sandbox' : 'production';

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc('sync_revenuecat_entitlement', {
    target_user_id: appUserId,
    target_entitlement_id: 'pro',
    target_is_active: active,
    target_expires_at: expiresAt,
    target_store: subscription?.store?.toLowerCase() ?? null,
    target_environment: environment,
    target_event_id: `refresh:${appUserId}:${crypto.randomUUID()}`,
  });
  if (error) return json(500, { message: 'Entitlement sync failed' });

  return json(200, { active, environment });
});
