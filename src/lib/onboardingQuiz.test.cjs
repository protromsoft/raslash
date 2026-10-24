const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', code)(mod.exports, () => ({}), mod);
  return mod.exports;
}
const quiz = load('src/lib/onboardingQuiz.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('answers from storage or the server keep only known keys', () => {
  assert.deepEqual(plain(quiz.cleanWorkPreferences({
    goals: ['meet', 'nope', 'focus'], workStyle: 'pirate', priorities: ['coffee', 'wifi', 'outlets', 'comfort'],
    workTimes: 'morning',
  })), { goals: ['focus', 'meet'], workStyle: '', priorities: ['wifi', 'outlets', 'comfort'], workTimes: [] });
  assert.deepEqual(plain(quiz.cleanWorkPreferences(null)), plain(quiz.EMPTY_WORK_PREFERENCES));
  for (const list of [quiz.GOALS, quiz.WORK_STYLES, quiz.PRIORITIES, quiz.WORK_TIMES]) {
    for (const option of list) assert.match(option.key, /^[a-z_]+$/);
  }
});

test('priorities weight the order; unrated places come last', () => {
  const p = (id, wifi, comfort, outlets, reviewCount = 1) => ({ id, wifi, comfort, outlets, overall: (wifi + comfort + outlets) / 3, reviewCount });
  const places = [p('comfy', 3, 5, 3), p('fast', 5, 3, 3), p('none', 0, 0, 0, 0), p('plugs', 3, 3, 5)];
  assert.deepEqual(quiz.sortByPriorities(places, ['wifi']).map((x) => x.id), ['fast', 'comfy', 'plugs', 'none']);
  assert.deepEqual(quiz.sortByPriorities(places, ['outlets']).map((x) => x.id)[0], 'plugs');
  assert.deepEqual(quiz.sortByPriorities(places, ['quiet']).map((x) => x.id)[0], 'comfy', 'quiet weighs comfort');
  assert.equal(quiz.priorityScore({ wifi: 5, comfort: 5, outlets: 5, overall: 5, reviewCount: 0 }, ['wifi']), 0);
});

test('onboarding runs questions → profile → plan → permissions → Pro', () => {
  const next = (file) => (read(`app/onboarding/${file}.tsx`).match(/router\.push\('([^']+)'\)/g) || []).map((m) => m.slice(13, -2));
  assert.deepEqual(next('index'), ['/onboarding/goals']);
  const chain = ['goals', 'work', 'priorities', 'insight', 'times', 'city', 'languages', 'interests', 'meet'];
  chain.forEach((step, i) => {
    const to = i + 1 < chain.length ? `/onboarding/${chain[i + 1]}` : '/onboarding/name';
    assert.ok(next(step).includes(to), `${step} → ${to}`);
  });
  // Each step saves on Devam: the next screen is pushed on top, so an unmount
  // flush alone never ran and later steps saw empty answers (found in the simulator).
  for (const step of ['goals', 'work', 'priorities', 'times', 'city', 'meet']) {
    assert.match(read(`app/onboarding/${step}.tsx`), /onContinue=\{\(\) => \{ patch\(answers\); router\.push\(/, step);
  }
  for (const step of ['languages', 'interests']) {
    assert.match(read(`app/onboarding/${step}.tsx`), /const next = \(\) => \{ patch\(\{ \w+ \}\); router\.push\(/, step);
  }
  assert.ok(next('social').includes('/onboarding/plan'));
  assert.ok(next('plan').includes('/onboarding/location'));
  // Every step shows its place in one count.
  const steps = { goals: 1, work: 2, priorities: 3, insight: 4, times: 5, city: 6, languages: 7, interests: 8, meet: 9,
    name: 10, social: 11, plan: 12, location: 13, notifications: 14 };
  for (const [file, step] of Object.entries(steps)) {
    assert.match(read(`app/onboarding/${file}.tsx`), new RegExp(`step=\\{${step}\\}`), file);
  }
  assert.match(read('app/onboarding/_layout.tsx'), /export const ONBOARDING_STEPS = 14;/);
  const finish = read('app/onboarding/notifications.tsx');
  assert.match(finish, /AsyncStorage\.setItem\(MAP_CITY_KEY, draft\.city\)/);
  assert.match(finish, /socialAction\('set_preferences', \{ map_visible: true, allow_dm_requests: true \}\)/);
  assert.match(finish, /if \(isPaywallEnabled && !isSubscribed\) setTimeout\(\(\) => router\.push\('\/paywall'\), 450\);/);
  // Answers reach the server and the map.
  assert.match(read('src/lib/profile.ts'), /row\.work_preferences = cleanWorkPreferences\(profile\.workPreferences\)/);
  assert.match(read('app/(tabs)/index.tsx'), /sortByPriorities\(list, profile\.workPreferences\?\.priorities\)/);
});
