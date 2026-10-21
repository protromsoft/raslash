import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

/**
 * Nightly photo cleanup, called by pg_cron (job "cleanup-photos"). Removes the
 * files that public.photo_cleanup_candidates() lists: expired story photos and
 * review photos whose rating was never saved. Deploy with verify_jwt off; the
 * caller proves itself with PHOTO_CLEANUP_SECRET instead of a user session.
 */

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
/** Storage accepts at most this many paths per remove call. */
const REMOVE_BATCH = 100;
/** Upper bound per run, so one call stays well inside the function time limit. */
const MAX_ROUNDS = 10;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/** Constant-time compare, so the secret cannot be guessed byte by byte. */
function sameSecret(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { message: 'Method not allowed' });

  const secret = Deno.env.get('PHOTO_CLEANUP_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return json(500, { message: 'Server configuration missing' });
  }
  const given = req.headers.get('x-cleanup-secret') ?? '';
  if (!sameSecret(given, secret)) return json(401, { message: 'Unauthorized' });

  // { "dryRun": true } only counts what would be removed.
  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // An empty body is a normal scheduled run.
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const removed: Record<string, number> = { 'chat-photos': 0, 'review-photos': 0 };
  const failures: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, error } = await admin.rpc('photo_cleanup_candidates', { max_rows: 500 });
    if (error) return json(500, { message: 'Candidate lookup failed', removed });
    const rows = (data ?? []) as { bucket: string; path: string }[];
    if (rows.length === 0) break;
    if (dryRun) {
      const wouldRemove: Record<string, number> = {};
      for (const row of rows) wouldRemove[row.bucket] = (wouldRemove[row.bucket] ?? 0) + 1;
      return json(200, { dryRun: true, wouldRemove, capped: rows.length >= 500 });
    }

    const byBucket = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.bucket || !row.path) continue;
      byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
    }
    let progressed = false;
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const chunk = paths.slice(i, i + REMOVE_BATCH);
        const { data: gone, error: removeError } = await admin.storage.from(bucket).remove(chunk);
        if (removeError) {
          failures.push(`${bucket}: ${removeError.message}`);
          continue;
        }
        const count = gone?.length ?? 0;
        removed[bucket] = (removed[bucket] ?? 0) + count;
        if (count > 0) progressed = true;
      }
    }
    // Nothing could be removed this round: stop instead of looping on the same rows.
    if (!progressed) break;
  }

  return json(failures.length ? 207 : 200, { removed, failures: failures.slice(0, 5) });
});
