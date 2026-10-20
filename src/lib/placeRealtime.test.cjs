const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Mimics supabase-js: channel(name) returns the existing channel while it is
// still registered, and .on() throws once that channel has subscribed.
function fakeClient() {
  const channels = new Map();
  return {
    channels,
    channel(name) {
      if (channels.has(name)) return channels.get(name);
      const ch = { name, subscribed: false,
        on() { if (this.subscribed) throw new Error(`cannot add \`postgres_changes\` callbacks for ${name} after \`subscribe()\`.`); return this; },
        subscribe() { this.subscribed = true; return this; } };
      channels.set(name, ch);
      return ch;
    },
    removeChannel(ch) { return new Promise((resolve) => setTimeout(() => { channels.delete(ch.name); resolve(); }, 10)); },
  };
}

function load(client) {
  const filename = path.resolve(__dirname, 'checkIns.ts');
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, console, setTimeout, process: { env: {} },
    require: (name) => name === './supabase' || name === '@/lib/supabase'
      ? { supabase: client, isSupabaseConfigured: true } : {} }, { filename });
  return mod.exports;
}

test('re-subscribing to a place chat before the old channel is removed does not throw', () => {
  const client = fakeClient();
  const { subscribeToPlaceMessages } = load(client);
  const id = '758bbe19-cfb1-4460-a9cf-5567b9f052df';
  const first = subscribeToPlaceMessages(id, () => {});
  first(); // removal is async, like supabase-js
  assert.doesNotThrow(() => subscribeToPlaceMessages(id, () => {}));
  assert.equal(client.channels.size, 2, 'the second subscription uses its own channel');
});
