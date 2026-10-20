const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const { colors } = require('../theme/colors.ts');

function load(file, mocks) {
  const filename = path.resolve(__dirname, '../..', file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, console, setTimeout, process: { env: {} },
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name]
      : ['react', 'react/jsx-runtime'].includes(name) ? require(name)
      : (() => { throw new Error(`Unmocked ${name}`); })() }, { filename });
  return mod.exports;
}

function loadCheckIns(rows, { synced = false } = {}) {
  const calls = [];
  const client = { rpc: async (fn, args) => { calls.push({ fn, args }); return { data: rows.shift() ?? [], error: null }; } };
  const mod = load('src/lib/checkIns.ts', {
    '@/lib/supabase': { supabase: client, isSupabaseConfigured: true },
    '@/lib/purchases': { syncServerEntitlement: async () => synced },
    'expo-crypto': { randomUUID: () => '758bbe19-cfb1-4460-a9cf-5567b9f052df' },
  });
  return { ...mod, calls };
}

const PLACE = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const proRequired = [{ message_id: null, message_created_at: null, decision: 'pro_required', messages_remaining: 0, has_unlimited: false }];

test('a photo message without Pro maps to pro_required, not a generic send error', async () => {
  const { sendPlaceMessage, calls } = loadCheckIns([proRequired, proRequired]);
  const result = await sendPlaceMessage(PLACE, 'u', '', REQUEST, `${PLACE}/u/x.jpg`);
  assert.deepEqual({ ...result }, { status: 'pro_required', requestId: REQUEST });
  assert.equal(calls[0].args.message_photo_path, `${PLACE}/u/x.jpg`);
  assert.equal(calls.length, 1, 'no retry when the entitlement did not change');
});

test('a just-bought membership is synced and the same request retried once', async () => {
  const sent = [{ message_id: 'm1', message_created_at: '2026-10-20T10:00:00Z', decision: 'sent', messages_remaining: 0, has_unlimited: true }];
  const { sendPlaceMessage, calls } = loadCheckIns([proRequired, sent], { synced: true });
  const result = await sendPlaceMessage(PLACE, 'u', 'selam', REQUEST, `${PLACE}/u/x.jpg`);
  assert.equal(result.status, 'sent');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.request_id, REQUEST);
});

test('a locked photo keeps the photo footprint, loads no image and opens the paywall', async () => {
  const { LockedPhoto } = load('src/components/LockedPhoto.tsx', {
    'react-native': { Pressable: 'pressable', Text: 'text', StyleSheet: { create: (v) => v } },
    '@expo/vector-icons': { Ionicons: 'icon' },
    '@/theme/colors': { colors },
  });
  let opened = 0;
  const frame = { width: 220, aspectRatio: 3 / 4 };
  let tree;
  await act(() => { tree = create(React.createElement(LockedPhoto, { onPress: () => { opened += 1; }, style: frame })); });
  const button = tree.root.findByType('pressable');
  const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean));
  assert.equal(style.width, 220);
  assert.equal(style.aspectRatio, 3 / 4);
  assert.equal(style.backgroundColor, colors.bgSoft);
  assert.equal(tree.root.findByType('icon').props.name, 'lock-closed');
  assert.equal(tree.root.findByType('text').props.children, 'Pro ile gör');
  assert.ok(tree.root.findByType('text').props.style.fontSize >= 11);
  assert.equal(tree.root.findAll((n) => n.props && n.props.source).length, 0);
  button.props.onPress();
  assert.equal(opened, 1);
  await act(() => tree.update(React.createElement(LockedPhoto, { onPress() {}, label: false })));
  assert.equal(tree.root.findAllByType('text').length, 0);
  await act(() => tree.unmount());
});
