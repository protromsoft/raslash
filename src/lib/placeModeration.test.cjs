const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, mocks) {
  const filename = path.resolve(__dirname, file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, console, process: { env: {} }, require: (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unmocked import: ${name}`);
  } }, { filename });
  return mod.exports;
}

const loadModeration = (supabase = null) => load('placeModeration.ts', { '@/lib/supabase': { supabase } });
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Records rpc and storage calls in order; `storageError` / `rpcErrors` script failures. */
function fakeClient({ storageError = null, rpcErrors = {}, rpcData = {} } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push(['rpc', fn, args]);
      return { data: rpcData[fn] ?? null, error: rpcErrors[fn] ?? null };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push(['remove', bucket, paths]);
          return { data: null, error: storageError };
        },
      }),
    },
  };
}

const MESSAGE = '11111111-1111-4111-8111-111111111111';

test('reports come from admin_place_message_reports and are mapped for the screen', async () => {
  const client = fakeClient({ rpcData: { admin_place_message_reports: [{
    report_id: 'r1', reason: 'inappropriate_content', status: 'pending', reported_at: '2026-10-21T10:00:00Z',
    report_count: 3, message_id: MESSAGE, place_id: 'p1', place_name: 'Kafe', author_id: 'u1',
    author_name: '  ', body: 'selam', photo_path: 'p1/u1/a.jpg', message_created_at: '2026-10-21T09:00:00Z',
    removed_at: null,
  }] } });
  const { fetchPlaceMessageReports } = loadModeration();
  const rows = await fetchPlaceMessageReports(client);
  assert.deepEqual(client.calls.map((call) => call[1]), ['admin_place_message_reports']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].messageId, MESSAGE);
  assert.equal(rows[0].reportCount, 3);
  assert.equal(rows[0].authorName, 'Misafir');
  assert.equal(rows[0].photoPath, 'p1/u1/a.jpg');
  assert.equal(rows[0].removedAt, undefined);
});

test('a fetch error is surfaced', async () => {
  const { fetchPlaceMessageReports } = loadModeration();
  await assert.rejects(
    fetchPlaceMessageReports(fakeClient({ rpcErrors: { admin_place_message_reports: { message: 'Admin required' } } })),
    /Admin required/,
  );
});

test('removing a photo message deletes the file from chat-photos before the rpc', async () => {
  const client = fakeClient();
  const { removePlaceMessage } = loadModeration();
  await removePlaceMessage({ messageId: MESSAGE, photoPath: 'p1/u1/a.jpg' }, client);
  assert.deepEqual(plain(client.calls), [
    ['remove', 'chat-photos', ['p1/u1/a.jpg']],
    ['rpc', 'admin_remove_place_message', { target_message_id: MESSAGE }],
  ]);
});

test('removing a text message skips storage', async () => {
  const client = fakeClient();
  const { removePlaceMessage } = loadModeration();
  await removePlaceMessage({ messageId: MESSAGE }, client);
  assert.deepEqual(plain(client.calls), [['rpc', 'admin_remove_place_message', { target_message_id: MESSAGE }]]);
});

test('a photo that is already gone does not stop the removal', async () => {
  for (const storageError of [{ message: 'Object not found', statusCode: '404' }, { message: 'not_found' }, { message: 'x', statusCode: 404 }]) {
    const client = fakeClient({ storageError });
    const { removePlaceMessage } = loadModeration();
    await removePlaceMessage({ messageId: MESSAGE, photoPath: 'p1/u1/a.jpg' }, client);
    assert.equal(client.calls.at(-1)[1], 'admin_remove_place_message');
  }
});

test('any other storage error keeps the message and is reported', async () => {
  const client = fakeClient({ storageError: { message: 'permission denied', statusCode: '403' } });
  const { removePlaceMessage } = loadModeration();
  await assert.rejects(removePlaceMessage({ messageId: MESSAGE, photoPath: 'p1/u1/a.jpg' }, client), /permission denied/);
  assert.deepEqual(plain(client.calls.map((call) => call[0])), ['remove']);
});

test('an rpc error on remove or dismiss is surfaced', async () => {
  const { removePlaceMessage, dismissPlaceMessageReports } = loadModeration();
  await assert.rejects(
    removePlaceMessage({ messageId: MESSAGE }, fakeClient({ rpcErrors: { admin_remove_place_message: { message: 'boom' } } })),
    /boom/,
  );
  await assert.rejects(
    dismissPlaceMessageReports(MESSAGE, fakeClient({ rpcErrors: { admin_dismiss_place_message_reports: { message: 'nope' } } })),
    /nope/,
  );
});

test('dismissing calls admin_dismiss_place_message_reports with the message id', async () => {
  const client = fakeClient();
  const { dismissPlaceMessageReports } = loadModeration();
  await dismissPlaceMessageReports(MESSAGE, client);
  assert.deepEqual(plain(client.calls), [['rpc', 'admin_dismiss_place_message_reports', { target_message_id: MESSAGE }]]);
});

test('without a configured client the actions fail instead of pretending to work', async () => {
  const { dismissPlaceMessageReports } = loadModeration(null);
  await assert.rejects(dismissPlaceMessageReports(MESSAGE), /Sunucu bağlantısı yok/);
});

/** A tiny PostgREST stand-in: `messages` select, then the profiles rpc. */
function chatClient(rows, { missingColumns = [] } = {}) {
  const selects = [];
  return {
    selects,
    from: () => ({
      select: (columns) => {
        selects.push(columns);
        const missing = missingColumns.some((column) => columns.includes(column));
        const result = missing ? { data: null, error: { code: '42703', message: 'column missing' } } : { data: rows, error: null };
        const chain = { eq: () => chain, order: () => chain, limit: () => Promise.resolve(result) };
        return chain;
      },
    }),
    rpc: async () => ({ data: [], error: null }),
  };
}

function loadCheckIns(supabase) {
  return load('checkIns.ts', {
    'expo-crypto': { randomUUID: () => 'fixed-uuid' },
    '@/lib/purchases': { syncServerEntitlement: async () => {} },
    '@/lib/supabase': { supabase, isSupabaseConfigured: true },
  });
}

const PLACE = '22222222-2222-4222-8222-222222222222';
const row = (id, extra = {}) => ({ id, body: id, created_at: '2026-10-21T10:00:00Z', user_id: 'u1', ...extra });

test('fetchPlaceMessages asks for removed_at and hides removed rows (admins can read them)', async () => {
  const client = chatClient([row('keep'), row('gone', { removed_at: '2026-10-21T11:00:00Z' }), row('pic', { photo_path: 'x/u1/p.jpg' })]);
  const { fetchPlaceMessages } = loadCheckIns(client);
  const messages = await fetchPlaceMessages(PLACE);
  assert.match(client.selects[0], /removed_at/);
  assert.deepEqual(plain(messages.map((m) => m.id)), ['keep', 'pic']);
});

test('fetchPlaceMessages still loads before the moderation migration runs', async () => {
  const client = chatClient([row('a')], { missingColumns: ['removed_at'] });
  const { fetchPlaceMessages } = loadCheckIns(client);
  const messages = await fetchPlaceMessages(PLACE);
  assert.equal(client.selects.length, 2);
  assert.doesNotMatch(client.selects[1], /removed_at/);
  assert.match(client.selects[1], /photo_path/);
  assert.deepEqual(plain(messages.map((m) => m.id)), ['a']);
});

test('deleting your own story photo removes the file first, then hides the message', async () => {
  const calls = [];
  const fake = {
    rpc: async (fn, args) => { calls.push(['rpc', fn, JSON.stringify(args)]); return { data: null, error: null }; },
    storage: { from: (bucket) => ({ remove: async (paths) => { calls.push(['remove', bucket, paths.join(',')]); return { data: null, error: null }; } }) },
  };
  await loadModeration().removeOwnStoryPhoto({ messageId: 'm1', photoPath: 'p/u/x.jpg' }, fake);
  assert.deepEqual(calls.map((c) => c.join(' ')), [
    'remove chat-photos p/u/x.jpg',
    'rpc remove_own_story_photo {"target_message_id":"m1"}',
  ]);
});
