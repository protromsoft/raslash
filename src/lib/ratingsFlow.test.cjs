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
  assert.match(read('app/place/[id].tsx'), /useEffect\(\(\) => \{\s*void refreshRatings\(\);\s*\}, \[refreshRatings\]\);/);
});

test('leaving a chat goes straight to the rating, never through the place modal', () => {
  const src = read('app/chat/[placeId].tsx');
  const leave = src.slice(src.indexOf('const confirmLeave'), src.indexOf('}, [checkOut, place]);'));
  assert.ok(leave.indexOf('setLeaving(true)') < leave.indexOf('checkOut(place.id)'), 'flagged before the check-in ends');
  assert.match(leave, /router\.replace\(`\/rate\/\$\{placeId\}`\)/);
  // The leaving guard must come before the "not checked in" redirect.
  const guard = src.indexOf('if (!checkedInHere && leaving)');
  const redirect = src.indexOf("pathname: '/place/[id]', params: { id: placeId, intent: 'checkin' }");
  assert.ok(guard > 0 && redirect > guard);
});
