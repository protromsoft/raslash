const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { createClient } = require('@supabase/supabase-js');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(relativePath, mocks, globals = {}) {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: mod.exports, URL, URLSearchParams, Date, setInterval, clearInterval,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      throw new Error(`Unmocked dependency: ${name}`);
    },
    ...globals,
  }, { filename });
  return mod.exports;
}

const link = 'raslash://auth/email-callback?code=single-use-test-code';
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
function service(auth) {
  return load('src/lib/emailAuth.ts', { '@/lib/supabase': { supabase: { auth } } });
}

test('email callback accepts only the exact app route and a single PKCE code', async () => {
  let exchanges = 0;
  const api = service({ exchangeCodeForSession: async () => { exchanges++; return { data: {} }; } });
  for (const invalid of [
    'https://example.com/auth/email-callback?code=single-use-test-code',
    'other://auth/email-callback?code=single-use-test-code',
    'raslash://auth/callback?code=single-use-test-code',
    'raslash://auth/email-callback/?code=single-use-test-code',
    'raslash://intruder@auth/email-callback?code=single-use-test-code',
    `${link}&code=another-test-code`, `${link}&type=recovery`,
    `${link}&error=access_denied`, `${link}#access_token=secret`,
    `${link}&access_token=secret`, `${link}&refresh_token=secret`,
    `${link}&token_hash=secret`, `${link}&type=magiclink&type=recovery`,
    'raslash://auth/email-callback', 'not a URL',
  ]) {
    assert.equal((await api.completeEmailSignIn(invalid)).ok, false);
  }
  assert.equal(exchanges, 0, 'untrusted links never reach the auth exchange');
  assert.equal(api.parseEmailAuthLink(link).code, 'single-use-test-code');
  assert.equal(api.parseEmailAuthLink(link.replace('://auth', ':///auth')).code, 'single-use-test-code');
});

test('repeated warm links and Strict Mode share one exchange, including failures', async () => {
  const pending = deferred();
  let calls = 0;
  const api = service({ exchangeCodeForSession: () => { calls++; return pending.promise; } });
  const first = api.completeEmailSignIn(link);
  const second = api.completeEmailSignIn(link);
  assert.equal(first, second);
  pending.resolve({ data: { session: { user: { id: 'member' } } }, error: null });
  assert.equal((await first).userId, 'member');
  await api.completeEmailSignIn(link);
  assert.equal(calls, 1);

  const failed = service({ exchangeCodeForSession: async () => ({ data: {}, error: { code: 'otp_expired', message: 'secret-provider-details' } }) });
  const result = await failed.completeEmailSignIn(link);
  assert.equal(result.ok, false);
  assert.equal(result.message.includes('secret-provider-details'), false);
  assert.match(result.message, /Yeni bir bağlantı/);
});

test('sending normalizes email, disables silent registration, deduplicates and enforces cooldown', async () => {
  const pending = deferred();
  const calls = [];
  const api = service({ signInWithOtp: (input) => { calls.push(input); return pending.promise; } });
  assert.equal((await api.sendEmailSignInLink('invalid')).ok, false);
  const first = api.sendEmailSignInLink(' MEMBER@EXAMPLE.COM ');
  const second = api.sendEmailSignInLink('member@example.com');
  assert.equal(first, second);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].email, 'member@example.com');
  assert.equal(calls[0].options.shouldCreateUser, false);
  assert.equal(calls[0].options.emailRedirectTo, 'raslash://auth/email-callback');
  pending.resolve({ error: null });
  const sent = await first;
  assert.equal(sent.ok, true);
  assert.ok(sent.retryAt > Date.now());
  assert.equal((await api.sendEmailSignInLink('member@example.com')).ok, false);
  assert.equal(calls.length, 1);
});

test('SMTP, rate limit, network and missing verifier failures are safe and actionable', async () => {
  for (const error of [{ status: 429 }, { code: 'email_address_not_authorized', message: 'private SMTP details' }]) {
    const api = service({ signInWithOtp: async () => ({ error }) });
    const result = await api.sendEmailSignInLink('member@example.com');
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('private SMTP'), false);
    if (error.status === 429) assert.ok(result.retryAt > Date.now());
  }
  const api = service({ signInWithOtp: async () => { throw new Error('sensitive network info'); } });
  assert.match((await api.sendEmailSignInLink('member@example.com')).message, /İnternetini/);
  assert.match(api.emailLinkError({ code: 'bad_code_verifier' }), /istediğin telefonda/);
  assert.match(api.emailLinkError({ code: 'pkce_code_verifier_not_found' }), /istediğin telefonda/);
});

test('actual Supabase client uses persisted S256 PKCE and exchanges into a session', async () => {
  const storage = new Map();
  const requests = [];
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'member', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
  const client = createClient('https://auth.example.test', 'test-only-anon', {
    auth: {
      flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    },
    global: { fetch: async (url, options) => {
      requests.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : null });
      return new Response(JSON.stringify(String(url).includes('/token') ? {
        access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'member' },
      } : {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const api = load('src/lib/emailAuth.ts', { '@/lib/supabase': { supabase: client } });
  assert.equal((await api.sendEmailSignInLink('member@example.com')).ok, true);
  assert.equal(requests[0].body.code_challenge_method, 's256');
  assert.equal(requests[0].body.create_user, false);
  const verifierEntry = [...storage.entries()].find(([key]) => key.endsWith('-code-verifier'));
  assert.ok(verifierEntry, 'cold app launch can recover the verifier from persistent storage');
  const verifier = JSON.parse(verifierEntry[1]).split('/')[0];
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  assert.equal(requests[0].body.code_challenge, Buffer.from(digest).toString('base64url'));
  assert.equal((await api.completeEmailSignIn(link)).userId, 'member');
  assert.equal(requests[1].body.code_verifier, verifier);
  assert.equal((await client.auth.getSession()).data.session.user.id, 'member');
});

test('native crypto adapter preserves full Web Crypto and securely fills the missing implementation', async () => {
  const expo = {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digest: (algorithm, data) => webcrypto.subtle.digest(algorithm, data),
    getRandomValues: (data) => webcrypto.getRandomValues(data),
  };
  const native = {};
  const api = load('src/lib/authCrypto.ts', { 'expo-crypto': expo }, { globalThis: native });
  api.installAuthCrypto();
  const bytes = new Uint32Array(56);
  assert.equal(native.crypto.getRandomValues(bytes), bytes);
  assert.ok(bytes.some((v) => v !== 0));
  const digest = await native.crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'));
  assert.equal(Buffer.from(digest).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(native.crypto.subtle.digest('MD5', bytes), /Unsupported/);
  const existing = { crypto: webcrypto };
  load('src/lib/authCrypto.ts', { 'expo-crypto': expo }, { globalThis: existing }).installAuthCrypto();
  assert.equal(existing.crypto, webcrypto);
  assert.equal(existing.crypto.subtle, webcrypto.subtle);
});

function callbackHarness() {
  let url = link;
  let state = { ready: false, syncing: false, session: null };
  const pending = deferred();
  const routes = [];
  let completions = 0;
  const component = load('app/auth/email-callback.tsx', {
    'expo-linking': { useLinkingURL: () => url },
    'expo-router': { router: { replace: (path) => routes.push(path) } },
    'react-native': { ActivityIndicator: 'spinner', View: 'view', StyleSheet: { create: (v) => v } },
    '@/components/Screen': { Screen: 'screen' },
    '@/components/ui': { Button: 'button', TextButton: 'text-button', Txt: 'text' },
    '@/context/AppContext': { useApp: () => state },
    '@/lib/emailAuth': { completeEmailSignIn: () => { completions++; return pending.promise; }, EMAIL_LINK_INVALID: 'invalid' },
    '@/theme/colors': { colors: { ink: '#000' } }, '@/theme/spacing': { spacing: { lg: 20 } },
  }).default;
  return { component, pending, routes, completions: () => completions, setUrl: (v) => { url = v; }, setState: (v) => { state = v; } };
}

test('cold callback waits for auth bootstrap and matching profile sync before routing', async () => {
  const h = callbackHarness();
  let rendered;
  await act(() => { rendered = create(React.createElement(h.component)); });
  assert.equal(h.completions(), 0);
  await act(() => {
    h.setState({ ready: true, syncing: false, session: null });
    rendered.update(React.createElement(h.component));
  });
  assert.equal(h.completions(), 1);
  await act(async () => { h.pending.resolve({ ok: true, userId: 'member' }); });
  assert.equal(h.routes.length, 0);
  await act(() => {
    h.setState({ ready: true, syncing: true, session: { user: { id: 'member' } } });
    rendered.update(React.createElement(h.component));
  });
  assert.equal(h.routes.length, 0);
  await act(() => {
    h.setState({ ready: true, syncing: false, session: { user: { id: 'other-member' } } });
    rendered.update(React.createElement(h.component));
  });
  assert.equal(h.routes.length, 0);
  await act(() => {
    h.setState({ ready: true, syncing: false, session: { user: { id: 'member' } } });
    rendered.update(React.createElement(h.component));
  });
  assert.deepEqual(h.routes, ['/'], 'existing onboarding state stays with the root profile gate');
  await act(() => rendered.unmount());
});

test('expired warm callback offers a new link and never navigates into the app', async () => {
  const h = callbackHarness();
  h.setState({ ready: true, syncing: false, session: null });
  let rendered;
  await act(() => { rendered = create(React.createElement(h.component)); });
  await act(async () => { h.pending.resolve({ ok: false, message: 'expired-test' }); });

  assert.ok(rendered.root.findAllByType('text').some((v) => v.props.children === 'expired-test'));
  assert.equal(h.routes.length, 0);
  await act(() => rendered.root.findByType('button').props.onPress());
  assert.deepEqual(h.routes, ['/auth/email-link']);
  await act(() => rendered.unmount());
});

test('auth URLs, bearer tokens and email addresses are removed from crash messages', () => {
  const redact = load('src/lib/redactAuthSecrets.ts', {}).redactAuthSecrets;
  for (const input of [
    'opening raslash://auth/email-callback?code=private-code&next=foo',
    'https://auth.example.test/verify?token_hash=private-token&type=magiclink',
    'access_token=private-access refresh_token:private-refresh code_verifier=private-verifier',
    'Authorization Bearer private.jwt.token member@example.com',
  ]) {
    const result = redact(input);
    assert.equal(/private-|member@example\.com/.test(result), false);
  }
  assert.equal(redact('Profile sync failed: HTTP 503'), 'Profile sync failed: HTTP 503');
});

test('Google existing browser-session handler still exchanges PKCE codes', async () => {
  let providerInput;
  let exchanged;
  let sessionSet = false;
  const api = load('src/lib/socialAuth.ts', {
    'expo-apple-authentication': {}, 'expo-crypto': {},
    'expo-linking': { createURL: () => 'raslash://auth/callback' },
    'expo-web-browser': { maybeCompleteAuthSession: () => {}, openAuthSessionAsync: async () => ({ type: 'success', url: 'raslash://auth/callback?code=google-test-code' }) },
    '@/lib/supabase': { isSupabaseConfigured: true, supabase: { auth: {
      signInWithOAuth: async (input) => { providerInput = input; return { data: { url: 'https://provider.example.test' }, error: null }; },
      exchangeCodeForSession: async (code) => { exchanged = code; return { data: { user: { id: 'google-member' } }, error: null }; },
      setSession: async () => { sessionSet = true; },
    } } },
  });
  assert.equal((await api.signInWithGoogle()).user.id, 'google-member');
  assert.equal(providerInput.provider, 'google');
  assert.equal(providerInput.options.redirectTo, 'raslash://auth/callback');
  assert.equal(exchanged, 'google-test-code');
  assert.equal(sessionSet, false, 'PKCE must not fall back to trusting bearer tokens from the URL');
});

test('signup confirmation uses the dedicated email route without changing password login', async () => {
  let signup;
  let signin;
  const emailAuth = service({});
  const api = load('src/lib/auth.ts', {
    '@/lib/emailAuth': emailAuth,
    '@/lib/supabase': { isSupabaseConfigured: true, supabase: { auth: {
      signUp: async (input) => { signup = input; return { data: { user: { id: 'new-member' } }, error: null }; },
      signInWithPassword: async (input) => { signin = input; return { data: { user: { id: 'old-member' } }, error: null }; },
    } } },
  });
  assert.equal((await api.signUp(' NEW@EXAMPLE.COM ', 'test-only-password')).ok, true);
  assert.equal(signup.options.emailRedirectTo, 'raslash://auth/email-callback');
  assert.equal(signup.email, 'new@example.com');
  assert.equal((await api.signIn(' OLD@EXAMPLE.COM ', 'test-only-password')).ok, true);
  assert.equal(signin.email, 'old@example.com');
  assert.equal(signin.password, 'test-only-password');
});

test('request screen blocks double tap, displays the cooldown and cleans up its interval', async () => {
  const pending = deferred();
  let sends = 0;
  let cleared = 0;
  const routes = [];
  const component = load('app/auth/email-link.tsx', {
    'expo-router': { router: { replace: (v) => routes.push(v), push: (v) => routes.push(v) } },
    'react-native': { Keyboard: { dismiss: () => {} }, View: 'view', StyleSheet: { create: (v) => v } },
    '@/components/AuthHero': { AuthHero: 'hero' }, '@/components/Motion': { Appear: 'appear' },
    '@/components/Screen': { Screen: (props) => React.createElement('screen', {}, props.children, props.footer) },
    '@/components/ui': { Button: 'button', Field: 'field', TextButton: 'text-button', Txt: 'text' },
    '@/lib/emailAuth': {
      validAuthEmail: (v) => /@/.test(v), emailLinkRetryAt: () => 0,
      sendEmailSignInLink: () => { sends++; return pending.promise; },
    },
    '@/theme/colors': { colors: { danger: 'red', green: 'green' } }, '@/theme/spacing': { spacing: { lg: 20, md: 12 } },
    '../../assets/photos/welcome.jpg': 'test-image',
  }, { setInterval: () => 1, clearInterval: () => { cleared++; } }).default;
  let rendered;
  await act(() => { rendered = create(React.createElement(component)); });
  await act(() => rendered.root.findByType('field').props.onChangeText('member@example.com'));
  await act(async () => {
    const send = rendered.root.findByType('button').props.onPress;
    send(); send();
  });
  assert.equal(sends, 1);
  assert.equal(rendered.root.findByType('button').props.loading, true);
  await act(async () => { pending.resolve({ ok: true, retryAt: Date.now() + 60_000 }); });
  assert.match(rendered.root.findByType('button').props.label, /60 sn/);
  assert.equal(rendered.root.findByType('button').props.disabled, true);
  assert.ok(rendered.root.findAllByType('text').some((v) => String(v.props.children).startsWith('Bağlantı gönderildi.')));
  await act(() => rendered.unmount());
  assert.equal(cleared, 1);
});
