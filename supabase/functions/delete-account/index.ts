import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: jsonHeaders });
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return json(401, { message: 'Authentication required' });
  }

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { message: 'Invalid request body' });
  }
  if (body.confirmation !== 'DELETE') {
    return json(400, { message: 'Deletion confirmation missing' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { message: 'Server configuration missing' });
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json(401, { message: 'Invalid or expired session' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Remove personal content that should not be retained or anonymized.
  const { error: ratingsError } = await admin.from('ratings').delete().eq('user_id', user.id);
  if (ratingsError) return json(500, { message: 'Could not remove ratings' });

  const { error: placesError } = await admin
    .from('places')
    .update({ created_by: null, submitted_by_name: null })
    .eq('created_by', user.id);
  if (placesError) return json(500, { message: 'Could not anonymize submitted places' });

  const { data: avatarObjects, error: avatarListError } = await admin.storage
    .from('avatars')
    .list(user.id, { limit: 100 });
  if (avatarListError) return json(500, { message: 'Could not inspect avatar files' });

  if (avatarObjects.length > 0) {
    const paths = avatarObjects.map((object: { name: string }) => `${user.id}/${object.name}`);
    const { error: avatarDeleteError } = await admin.storage.from('avatars').remove(paths);
    if (avatarDeleteError) return json(500, { message: 'Could not remove avatar files' });
  }

  // profiles(id) references auth.users with ON DELETE CASCADE. Messages,
  // check-ins, notifications and presence cascade through the profile row.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
  if (deleteError) return json(500, { message: 'Could not delete account' });

  return json(200, { deleted: true });
});
