// Local PostgreSQL (PGlite), synthetic users only. Never connects to Supabase.
// PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node --test scripts/test-social-database.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');

test('social RPC authorization, discovery and DM lifecycle (isolated PostgreSQL)', async (t) => {
  const db = new PGlite();
  const a = randomUUID(), b = randomUUID(), c = randomUUID(), admin = randomUUID();
  const place = randomUUID(), otherPlace = randomUUID();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth, public to anon, authenticated;
    create table public.profiles(id uuid primary key, first_name text, avatar_url text,
      bio text, profession text, is_admin boolean default false);
    create table public.places(id uuid primary key, name text, city text, city_slug text,
      latitude double precision, longitude double precision, status text);
    create table public.check_ins(id uuid primary key default gen_random_uuid(), user_id uuid,
      place_id uuid, is_active boolean, checked_in_at timestamptz default now());
    create table public.user_blocks(blocker_id uuid references public.profiles(id),
      blocked_id uuid references public.profiles(id), created_at timestamptz default now(),
      primary key(blocker_id, blocked_id), check(blocker_id <> blocked_id));
    create table private.message_usage(user_id uuid primary key, sent_count integer default 0, updated_at timestamptz);
    create table private.subscription_entitlements(user_id uuid, entitlement_id text, is_active boolean,
      environment text, expires_at timestamptz);
    create table public.messages(id uuid primary key default gen_random_uuid(), place_id uuid,
      user_id uuid, body text, client_request_id uuid, created_at timestamptz default now());
  `);
  const legacy = fs.readFileSync(path.join(root, 'supabase/migrations/20260911211108_admin_messaging_controls.sql'), 'utf8');
  for (const name of ['get_message_access', 'send_place_message']) {
    const match = legacy.match(new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
    assert.ok(match, `real existing ${name} must be loaded, not mocked`);
    await db.exec(match[0]);
  }
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261003184437_add_opt_in_discovery_and_direct_messages.sql'), 'utf8'));
  for (const [id, name] of [[a, 'Ada'], [b, 'Bora'], [c, 'Can'], [admin, 'Admin']]) {
    await db.query('insert into public.profiles(id, first_name, is_admin) values($1,$2,$3)', [id, name, id === admin]);
  }
  await db.query(`insert into public.places values($1,'Test Cafe','Ankara','ankara',39.9,32.8,'approved'),
    ($2,'Test Izmir','İzmir','izmir',38.4,27.1,'approved')`, [place, otherPlace]);
  for (const id of [a, b, c]) await db.query('insert into public.check_ins(user_id,place_id,is_active) values($1,$2,true)', [id, place]);
  async function as(id, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('test.uid',$1,false)", [id || '']);
    await db.exec(`set role ${role}`);
  }
  async function owner(sql, params = []) {
    await db.exec('reset role'); return db.query(sql, params);
  }
  async function rpc(id, action, payload = {}) {
    await as(id);
    const result = await db.query('select public.social_action($1,$2::jsonb) as data', [action, JSON.stringify(payload)]);
    return result.rows[0].data;
  }
  const fail = (fn, message) => assert.rejects(fn, new RegExp(message));
  const visible = { map_visible: true, allow_dm_requests: true };
  let thread, firstMessage;
  const request = randomUUID();

  await t.test('anonymous cannot execute; null auth cannot bypass via private function', async () => {
    await as(null, 'anon');
    await fail(() => db.query("select public.social_action('discover','{}')"), 'permission denied');
    await as(null);
    await fail(() => db.query("select private.social_action('preferences','{}')"), 'authentication_required');
  });
  await t.test('all new tables deny direct authenticated reads and writes; RLS enabled', async () => {
    for (const table of ['social_preferences', 'direct_threads', 'direct_messages', 'direct_message_reports']) {
      await as(a);
      await fail(() => db.query(`select * from private.${table}`), 'permission denied');
      await fail(() => db.query(`delete from private.${table}`), 'permission denied');
    }
    await as(a);
    await fail(() => db.query('select * from private.social_people()'), 'permission denied');
    const r = await owner("select count(*)::int as n from pg_class where relnamespace='private'::regnamespace and relrowsecurity");
    assert.equal(r.rows[0].n, 4);
  });
  await t.test('existing users default invisible; malformed preferences rejected', async () => {
    assert.deepEqual(await rpc(a, 'preferences'), { map_visible: false, allow_dm_requests: false });
    assert.deepEqual((await rpc(a, 'discover', { city: 'ankara' })).people, []);
    await fail(() => rpc(a, 'set_preferences', { map_visible: 'true' }), 'invalid_preferences');
  });
  await t.test('only venue coordinates and limited profile fields, city scoped', async () => {
    await rpc(b, 'set_preferences', visible);
    const rows = (await rpc(a, 'discover', { city: 'ankara' })).people;
    assert.equal(rows.length, 1); assert.equal(rows[0].id, b);
    assert.equal(rows[0].latitude, 39.9); assert.equal(rows[0].longitude, 32.8);
    assert.equal(rows[0].email, undefined); assert.equal(rows[0].last_name, undefined);
    assert.equal((await rpc(a, 'discover', { city: 'izmir' })).people.length, 0);
    await fail(() => rpc(a, 'discover', { city: 'any' }), 'invalid_city');
  });
  await t.test('expiry, check-out and unapproved venue exclude users', async () => {
    await owner("update public.check_ins set checked_in_at=now()-interval '4 hours' where user_id=$1", [b]);
    assert.equal((await rpc(a, 'discover', { city: 'ankara' })).people.length, 0);
    await owner('update public.check_ins set checked_in_at=now(),is_active=false where user_id=$1', [b]);
    assert.equal((await rpc(a, 'discover', { city: 'ankara' })).people.length, 0);
    await owner('update public.check_ins set is_active=true where user_id=$1', [b]);
    await owner("update public.places set status='pending' where id=$1", [place]);
    assert.equal((await rpc(a, 'discover', { city: 'ankara' })).people.length, 0);
    await owner("update public.places set status='approved' where id=$1", [place]);
  });
  await t.test('cannot enumerate invisible profiles or DM non-consenting recipient', async () => {
    await fail(() => rpc(a, 'profile', { peer_id: c }), 'person_unavailable');
    await fail(() => rpc(a, 'send', { peer_id: c, body: 'Hi', request_id: randomUUID() }), 'requests_closed');
    await rpc(b, 'set_preferences', { ...visible, allow_dm_requests: false });
    await fail(() => rpc(a, 'send', { peer_id: b, body: 'Hi', request_id: randomUUID() }), 'requests_closed');
    await rpc(b, 'set_preferences', visible);
  });
  await t.test('first message creates request; duplicate retry consumes only once', async () => {
    const sent = await rpc(a, 'send', { peer_id: b, body: 'Merhaba', request_id: request });
    thread = sent.thread_id; firstMessage = sent.message_id;
    const retry = await rpc(a, 'send', { peer_id: b, body: 'Merhaba', request_id: request });
    assert.equal(retry.message_id, firstMessage); assert.equal(retry.replayed, true);
    const count = await owner('select sent_count from private.message_usage where user_id=$1', [a]);
    assert.equal(count.rows[0].sent_count, 1);
    await fail(() => rpc(a, 'send', { peer_id: b, body: 'Changed', request_id: request }), 'request_conflict');
  });
  await t.test('pending blocks repeated messages, cross-request, and sender self-accept', async () => {
    for (const [from, to] of [[a, b], [b, a]]) {
      await fail(() => rpc(from, 'send', { peer_id: to, body: 'Again', request_id: randomUUID() }), 'request_not_accepted');
    }
    await fail(() => rpc(a, 'respond', { thread_id: thread, response: 'accepted' }), 'invalid_response');
  });
  await t.test('outsider cannot read, accept, report or send to another thread', async () => {
    for (const action of ['read', 'respond', 'report', 'send']) {
      await fail(() => rpc(c, action, { thread_id: thread, response: 'accepted', message_id: firstMessage,
        reason: 'spam', body: 'Hacked', request_id: randomUUID() }), 'conversation_unavailable');
    }
  });
  await t.test('inbox unread count and read acknowledgements', async () => {
    let list = (await rpc(b, 'inbox')).threads;
    assert.equal(list.length, 1); assert.equal(list[0].unread, 1); assert.equal(list[0].status, 'pending');
    const r = await rpc(b, 'read', { thread_id: thread });
    assert.equal(r.messages[0].body, 'Merhaba');
    list = (await rpc(b, 'inbox')).threads; assert.equal(list[0].unread, 0);
    assert.equal((await rpc(c, 'inbox')).threads.length, 0);
  });
  await t.test('accept allows both directions; opt-out/check-out preserves accepted DM only', async () => {
    await rpc(b, 'respond', { thread_id: thread, response: 'accepted' });
    await rpc(b, 'set_preferences', { map_visible: false, allow_dm_requests: false });
    await owner('update public.check_ins set is_active=false where user_id=$1', [b]);
    await rpc(b, 'send', { thread_id: thread, body: 'Selam', request_id: randomUUID() });
    await rpc(a, 'send', { thread_id: thread, body: 'Nasılsın?', request_id: randomUUID() });
    assert.equal((await rpc(a, 'discover', { city: 'ankara' })).people.length, 0);
    assert.equal((await rpc(a, 'profile', { peer_id: b })).person.latitude, undefined);
  });
  await t.test('15-message shared quota includes existing venue chat', async () => {
    await owner('update private.message_usage set sent_count=14 where user_id=$1', [a]);
    await as(a);
    const result = await db.query('select * from private.send_place_message($1,$2,$3)', [place, 'Venue message', randomUUID()]);
    assert.equal(result.rows[0].decision, 'sent');
    await fail(() => rpc(a, 'send', { thread_id: thread, body: 'Sixteenth', request_id: randomUUID() }), 'message_limit_reached');
    await owner("insert into private.subscription_entitlements values($1,'pro',true,'production',null)", [a]);
    await rpc(a, 'send', { thread_id: thread, body: 'Pro message', request_id: randomUUID() });
  });
  await t.test('message constraints and profanity validated on server', async () => {
    for (const body of ['', '   ', '\n\t', 'a'.repeat(501)]) {
      await fail(() => rpc(a, 'send', { thread_id: thread, body, request_id: randomUUID() }), 'invalid_message');
    }
    await fail(() => rpc(a, 'send', { thread_id: thread, body: 'amk', request_id: randomUUID() }), 'inappropriate_content');
  });
  await t.test('report is idempotent; only admins see explicitly reported content', async () => {
    const payload = { thread_id: thread, message_id: firstMessage, reason: 'spam' };
    await rpc(b, 'report', payload); await rpc(b, 'report', payload);
    await fail(() => rpc(a, 'report', payload), 'message_unavailable');
    await fail(() => rpc(a, 'admin_reports'), 'access_denied');
    const result = await rpc(admin, 'admin_reports');
    assert.equal(result.reports.length, 1); assert.equal(result.reports[0].body, 'Merhaba');
  });
  await t.test('block hides both directions and prevents read/send/idempotent replay', async () => {
    await rpc(b, 'block', { peer_id: a }); await rpc(b, 'block', { peer_id: a });
    for (const who of [a, b]) {
      assert.equal((await rpc(who, 'inbox')).threads.length, 0);
      await fail(() => rpc(who, 'read', { thread_id: thread }), 'conversation_unavailable');
      await fail(() => rpc(who, 'send', { thread_id: thread, body: 'No', request_id: randomUUID() }), 'conversation_unavailable');
    }
    await fail(() => rpc(a, 'send', { peer_id: b, body: 'Merhaba', request_id: request }), 'conversation_unavailable');
    assert.equal((await rpc(b, 'blocks')).people[0].id, a);
    await rpc(a, 'unblock', { peer_id: b }); // cannot remove other's block
    await fail(() => rpc(a, 'read', { thread_id: thread }), 'conversation_unavailable');
    await rpc(b, 'unblock', { peer_id: a });
    assert.ok((await rpc(a, 'read', { thread_id: thread })).messages.length > 0);
  });
  await t.test('declined request cannot be reopened or read', async () => {
    await rpc(c, 'set_preferences', visible);
    const sent = await rpc(b, 'send', { peer_id: c, body: 'Request', request_id: randomUUID() });
    await rpc(c, 'respond', { thread_id: sent.thread_id, response: 'declined' });
    await fail(() => rpc(b, 'send', { peer_id: c, body: 'Again', request_id: randomUUID() }), 'request_not_accepted');
    await fail(() => rpc(b, 'read', { thread_id: sent.thread_id }), 'conversation_unavailable');
  });
  await t.test('spoofed user_id cannot change another user’s preferences', async () => {
    await rpc(a, 'set_preferences', { user_id: b, ...visible });
    assert.equal((await rpc(b, 'preferences')).map_visible, false);
    assert.equal((await rpc(a, 'preferences')).map_visible, true);
  });
  await t.test('both directions of blocks hide discoverable users', async () => {
    await rpc(a, 'block', { peer_id: c });
    assert.equal((await rpc(a, 'discover', { city: 'ankara' })).people.some(p => p.id === c), false);
    assert.equal((await rpc(c, 'discover', { city: 'ankara' })).people.some(p => p.id === a), false);
    await rpc(a, 'unblock', { peer_id: c });
  });
  await t.test('admin report resolution is role-restricted and validates status', async () => {
    const report = (await rpc(admin, 'admin_reports')).reports[0];
    await fail(() => rpc(a, 'resolve_report', { report_id: report.id, status: 'dismissed' }), 'access_denied');
    await fail(() => rpc(admin, 'resolve_report', { report_id: report.id, status: 'anything' }), 'invalid_report_status');
    await rpc(admin, 'resolve_report', { report_id: report.id, status: 'reviewed' });
    assert.equal((await rpc(admin, 'admin_reports')).reports[0].status, 'reviewed');
  });
  await t.test('discovery pagination is bounded with no duplicate IDs across pages', async () => {
    for (let i = 0; i < 55; i++) {
      const id = randomUUID();
      await owner('insert into public.profiles(id,first_name) values($1,$2)', [id, `Fixture ${i}`]);
      await owner('insert into public.check_ins(user_id,place_id,is_active) values($1,$2,true)', [id, place]);
      await rpc(id, 'set_preferences', visible);
    }
    const first = (await rpc(b, 'discover', { city: 'ankara' })).people;
    assert.equal(first.length, 51);
    const next = (await rpc(b, 'discover', { city: 'ankara', after: first[49].id })).people;
    assert.ok(next.length > 0);
    assert.equal(next.some(p => first.slice(0, 50).some(q => q.id === p.id)), false);
  });
  await t.test('new-request rate limit also applies to paid accounts', async () => {
    const targets = (await rpc(a, 'discover', { city: 'ankara' })).people.filter(p => ![a, b, c].includes(p.id));
    // A already created one thread. Four more requests are allowed, not five.
    for (const person of targets.slice(0, 4)) await rpc(a, 'send', { peer_id: person.id, body: 'Hello', request_id: randomUUID() });
    await fail(() => rpc(a, 'send', { peer_id: targets[4].id, body: 'Excess request', request_id: randomUUID() }), 'request_rate_limit');
  });
  await t.test('history pagination and message-rate limit', async () => {
    for (let i = 0; i < 55; i++) await owner(`insert into private.direct_messages(thread_id,sender_id,body,request_id,created_at)
      values($1,$2,$3,$4,now()-interval '2 hours' + ($5 * interval '1 second'))`, [thread, b, `Historical ${i}`, randomUUID(), i]);
    const first = (await rpc(a, 'read', { thread_id: thread })).messages;
    assert.equal(first.length, 51);
    const next = (await rpc(a, 'read', { thread_id: thread, before_time: first[49].created_at, before_id: first[49].id })).messages;
    assert.ok(next.length > 0); assert.equal(next.some(p => first.slice(0, 50).some(q => q.id === p.id)), false);
    await owner("insert into private.subscription_entitlements values($1,'pro',true,'production',null)", [b]);
    for (let i = 0; i < 20; i++) await owner('insert into private.direct_messages(thread_id,sender_id,body,request_id) values($1,$2,$3,$4)', [thread, b, 'Fixture', randomUUID()]);
    await fail(() => rpc(b, 'send', { thread_id: thread, body: 'Too fast', request_id: randomUUID() }), 'message_rate_limit');
  });
  await t.test('function privilege and search_path audit', async () => {
    const r = await owner(`select n.nspname, p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as authed
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('social_action','social_people') order by n.nspname,p.proname`);
    for (const row of r.rows) {
      assert.equal(row.anon, false); assert.ok(row.proconfig.some(c => c.startsWith('search_path=')));
      if (row.nspname === 'public') assert.equal(row.prosecdef, false);
      if (row.proname === 'social_people') assert.equal(row.authed, false);
    }
  });
  await db.close();
});
