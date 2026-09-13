import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

type PushDevice = { expo_push_token: string };
type ExpoTicket = {
  status?: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json(500, { message: 'Server configuration missing' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const callerId = authData.user?.id;
  if (authError || !callerId) return json(401, { message: 'Invalid session' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', callerId)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) return json(403, { message: 'Admin required' });

  let input: { title?: unknown; body?: unknown };
  try {
    input = await req.json();
  } catch {
    return json(400, { message: 'Invalid JSON' });
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title || !body || title.length > 80 || body.length > 240) {
    return json(400, { message: 'Title or body is invalid' });
  }

  const { data: devices, error: devicesError } = await admin
    .from('push_devices')
    .select('expo_push_token')
    .eq('enabled', true);
  if (devicesError) return json(500, { message: 'Device lookup failed' });

  const rows = (devices ?? []) as PushDevice[];
  let accepted = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(
        batch.map(({ expo_push_token }) => ({
          to: expo_push_token,
          sound: 'default',
          title,
          body,
          data: { type: 'system' },
          channelId: 'activity',
        })),
      ),
    });
    if (!response.ok) return json(502, { message: `Expo Push ${response.status}` });

    const payload = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = payload.data ?? [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') accepted += 1;
      else {
        failed += 1;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = batch[index]?.expo_push_token;
          if (token) invalidTokens.push(token);
        }
      }
    });
  }

  if (invalidTokens.length > 0) {
    await admin.from('push_devices').update({ enabled: false }).in('expo_push_token', invalidTokens);
  }

  // Keep the same announcement in the app's notification inbox as well.
  const { data: profiles } = await admin.from('profiles').select('id');
  if (profiles && profiles.length > 0) {
    await admin.from('notifications').insert(
      profiles.map(({ id }) => ({
        user_id: id,
        title,
        body,
        type: 'system',
        read: false,
      })),
    );
  }

  return json(200, { devices: rows.length, accepted, failed });
});
