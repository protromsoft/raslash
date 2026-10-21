const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(supabase = null) {
  const filename = path.resolve(__dirname, 'placePhotos.ts');
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const mocks = {
    'expo-crypto': { randomUUID: () => 'fixed-uuid' }, 'expo-image-picker': {},
    'react-native': { Alert: { alert() {} } },
    '@/lib/supabase': { supabase, isSupabaseConfigured: !!supabase },
  };
  vm.runInNewContext(code, { exports: mod.exports, console, setTimeout, clearTimeout, fetch: (...args) => global.fetch(...args), require: (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unmocked import: ${name}`);
  } }, { filename });
  return mod.exports;
}

test('photo paths put the place and user folders where the storage policies read them', () => {
  const { chatPhotoPath, reviewPhotoPath } = load();
  assert.equal(chatPhotoPath('place-1', 'user-1', 'abc'), 'place-1/user-1/abc.jpg');
  assert.equal(chatPhotoPath('place-1', 'user-1'), 'place-1/user-1/fixed-uuid.jpg');
  assert.equal(reviewPhotoPath('user-1'), 'user-1/fixed-uuid.jpg');
});

test('signed URLs are fetched once per path, in one batch, and shared with concurrent callers', async () => {
  const { createSignedUrlCache } = load();
  const batches = [];
  const cache = createSignedUrlCache(async (paths) => {
    batches.push([...paths]);
    return paths.map((p) => (p === 'bad' ? { path: p, signedUrl: null, error: 'not found' } : { path: p, signedUrl: `https://s/${p}` }));
  });
  const [first, second] = await Promise.all([cache.resolve(['a', 'b', 'a', 'bad']), cache.resolve(['b'])]);
  assert.deepEqual(batches, [['a', 'b', 'bad']]);
  assert.deepEqual({ ...first }, { a: 'https://s/a', b: 'https://s/b' });
  assert.deepEqual({ ...second }, { b: 'https://s/b' });
  // Cached paths are skipped; only the new one (and the failed one) are signed again.
  await cache.resolve(['a', 'c', 'bad']);
  assert.deepEqual(batches[1], ['c', 'bad']);
});

test('expired signed URLs are signed again and a failed batch does not poison the cache', async () => {
  const { createSignedUrlCache } = load();
  let clock = 0;
  let fail = true;
  let calls = 0;
  const cache = createSignedUrlCache(async (paths) => {
    calls += 1;
    if (fail) throw new Error('offline');
    return paths.map((p) => ({ path: p, signedUrl: `https://s/${p}?t=${clock}` }));
  }, { ttlMs: 1000, now: () => clock });
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.deepEqual({ ...(await cache.resolve(['a'])) }, {}); } finally { console.warn = originalWarn; }
  fail = false;
  assert.equal((await cache.resolve(['a'])).a, 'https://s/a?t=0');
  clock = 1500;
  assert.equal((await cache.resolve(['a'])).a, 'https://s/a?t=1500');
  assert.equal(calls, 3);
});

test('uploads read the camera file and never overwrite an existing object', async () => {
  const uploads = [];
  const supabase = { storage: { from: (bucket) => ({
    upload: async (p, body, opts) => { uploads.push({ bucket, p, size: body.byteLength, opts }); return { error: null }; },
  }) } };
  const { uploadJpeg } = load(supabase);
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try { await uploadJpeg('chat-photos', 'p/u/x.jpg', 'file:///x.jpg'); } finally { global.fetch = originalFetch; }
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, 'chat-photos');
  assert.equal(uploads[0].size, 8);
  assert.deepEqual({ ...uploads[0].opts }, { contentType: 'image/jpeg', upsert: false });
});

test('photo access mirrors the server rule: Pro, admin or App Review access', () => {
  const { hasPhotoAccess } = load();
  assert.equal(hasPhotoAccess({ isSubscribed: false, isAdmin: false }), false);
  assert.equal(hasPhotoAccess({ isSubscribed: false, isAdmin: false, appReviewAccess: 'true' }), false);
  assert.equal(hasPhotoAccess({ isSubscribed: true, isAdmin: false }), true);
  assert.equal(hasPhotoAccess({ isSubscribed: false, isAdmin: true }), true);
  assert.equal(hasPhotoAccess({ isSubscribed: false, isAdmin: false, appReviewAccess: true }), true);
});

test('review photos are private: signed through their own bucket, never a public URL', async () => {
  const calls = [];
  const supabase = { storage: { from: (bucket) => ({
    createSignedUrls: async (paths, ttl) => {
      calls.push({ bucket, paths: [...paths], ttl });
      return { data: paths.map((p) => ({ path: p, signedUrl: `https://s/${bucket}/${p}` })), error: null };
    },
    getPublicUrl: () => { throw new Error('review photos must not use public URLs'); },
  }) } };
  const mod = load(supabase);
  assert.equal(mod.reviewPhotoUrl, undefined);
  const urls = await mod.reviewPhotoUrls.resolve(['u/a.jpg', 'u/b.jpg']);
  assert.deepEqual({ ...urls }, { 'u/a.jpg': 'https://s/review-photos/u/a.jpg', 'u/b.jpg': 'https://s/review-photos/u/b.jpg' });
  await mod.chatPhotoUrls.resolve(['p/u/c.jpg']);
  assert.deepEqual(calls.map((c) => c.bucket), ['review-photos', 'chat-photos']);
  assert.equal(calls[0].ttl, 3600);
});

test('a signing request that never answers is dropped so the next call signs again', async () => {
  const { createSignedUrlCache } = load();
  let calls = 0;
  const cache = createSignedUrlCache(async (paths) => {
    calls += 1;
    if (calls === 1) return new Promise(() => {}); // stalls forever
    return paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null }));
  }, { timeoutMs: 20 });
  // Objects come from the vm realm; compare by value.
  assert.equal(JSON.stringify(await cache.resolve(['a.jpg'])), '{}');
  assert.equal(JSON.stringify(await cache.resolve(['a.jpg'])), JSON.stringify({ 'a.jpg': 'https://signed/a.jpg' }));
  assert.equal(calls, 2);
});
