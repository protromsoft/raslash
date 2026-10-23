const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('other members\' ratings are refetched, not only loaded at launch', () => {
  const src = read('src/context/PlacesContext.tsx');
  const refresh = src.slice(src.indexOf('const refreshRatings = useCallback'));
  assert.match(refresh, /fetchRatingsByPlace\(\)/);
  assert.match(refresh, /revision !== ratingsRevision\.current/, 'a stale list never replaces a newer one');
  // Foreground and a periodic poll while the app is open.
  assert.match(refresh, /AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active'\) void refreshRatings\(\);/);
  assert.match(refresh, /setInterval\(\(\) => \{\s*if \(AppState\.currentState === 'active'\) void refreshRatings\(\);/);
  // Saving a rating invalidates any list fetched before it.
  const submit = src.slice(src.indexOf('const submitRating = useCallback'));
  assert.match(submit.slice(0, submit.indexOf('setReviewsByPlace')), /ratingsRevision\.current \+= 1;/);
  // The launch refresh loads ratings on their own, outside the catalogue's
  // Promise.all, so a failing places or inbox request cannot drop them.
  const launch = src.slice(src.indexOf('const refreshFromSupabase = useCallback'));
  const all = launch.slice(launch.indexOf('await Promise.all(['), launch.indexOf(']);'));
  assert.doesNotMatch(all, /fetchRatingsByPlace/);
  assert.ok(launch.indexOf('void refreshRatings(true);') < launch.indexOf('await Promise.all(['));
  assert.match(refresh, /Sentry\.captureException\(error, \{ tags: \{ area: 'ratings-refresh' \} \}\)/);
  assert.match(read('app/place/[id].tsx'), /useEffect\(\(\) => \{\s*void refreshRatings\(\);\s*\}, \[refreshRatings\]\);/);
});

test('leaving a chat goes straight to the rating, never through the place modal', () => {
  const src = read('app/chat/[placeId].tsx');
  const leave = src.slice(src.indexOf('const confirmLeave'), src.indexOf('}, [checkOut, place]);'));
  assert.ok(leave.indexOf('setLeaving(true)') < leave.indexOf('checkOut(place.id)'), 'flagged before the check-in ends');
  assert.match(leave, /router\.replace\(`\/rate\/\$\{placeId\}`\)/);
  // While leaving the chat keeps rendering (its sheet's Modal must finish
  // dismissing): no redirect, and no other early return on `leaving`.
  assert.match(src, /if \(!checkedInHere && !leaving\) \{\s*return <Redirect href=\{\{ pathname: '\/place\/\[id\]'/);
  assert.doesNotMatch(src, /if \(!checkedInHere && leaving\)/);
});
