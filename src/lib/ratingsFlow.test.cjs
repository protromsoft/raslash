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

test('three-stop sheet: a drag moves one stop, a short drag settles on the nearest', () => {
  const ts = require('typescript');
  const code = ts.transpileModule(read('src/lib/discoveryGestures.ts'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', code)(mod.exports, mod);
  const { sheetSnapStop } = mod.exports;
  const stops = [76, 270, 560];
  assert.equal(sheetSnapStop(270, 200, 70, 0, stops), 76, 'list dragged down closes to the header');
  assert.equal(sheetSnapStop(270, 330, -60, 0, stops), 560);
  assert.equal(sheetSnapStop(76, 90, -14, 0, stops), 76, 'small drag stays');
  assert.equal(sheetSnapStop(560, 520, 40, 900, stops), 270, 'a flick moves one stop');
  assert.equal(sheetSnapStop(76, 76, 60, 0, stops), 76, 'never past the ends');
  // Places panel wiring.
  const panel = read('src/components/MapPlacesPanel.tsx');
  assert.match(panel, /minimum=\{canPeek \? peekHeight : listHeight\} middle=\{canPeek \? listHeight : undefined\}/);
  assert.match(read('app/(tabs)/index.tsx'), /peekHeight=\{placesPeekHeight\} collapsed=\{placesCollapsed\} onCollapse=\{setPlacesCollapsed\}/);
});

test('the map remembers its city and asks for location once', () => {
  const src = read('app/(tabs)/index.tsx');
  assert.match(src, /AsyncStorage\.getItem\(MAP_CITY_KEY\)/);
  assert.match(src, /rememberCity\(key\);\s*applyCitySelection\(key\);/);
  // One prompt ever (iOS "Allow Once" used to re-prompt every launch); the city
  // comes from a cached fix first, so a slow GPS fix cannot leave the map on İstanbul.
  assert.match(src, /const asked = await AsyncStorage\.getItem\(LOCATION_ASKED_KEY\)/);
  assert.match(src, /: \(await requestForegroundLocationAccess\(\)\)\.granted;/);
  assert.ok(src.indexOf('getLastKnownPositionAsync({ maxAge: 24 * 60 * 60_000 })') < src.indexOf('const pos = await getForegroundPosition({'));
  // Venues are dots when zoomed out and pins when zoomed in, never count bubbles.
  assert.match(src, /dotMode && place\.id !== selectedId && place\.id !== activePlace\?\.id \? \(\s*<PlaceDot/);
  assert.doesNotMatch(src, /<ClusterMarker key=\{`cluster:/);
  // The map opens on the remembered city: it waits for the read, starts on that
  // city's centre, and re-applies a city chosen before the map was ready.
  assert.match(src, /if \(!cityRestored\) \{\s*return <View style=\{styles\.screen\} \/>;/);
  assert.match(src, /const anchor = selected \?\? cityCentre \?\? cityPlaces\[0\]/);
  assert.match(src, /if \(shown && nearestSupportedCityKey\(shown\) === selectedCity\) return;\s*animateToCity\(selectedCity\);/);
  // The centre used to pick visible venues follows the map at every zoom.
  assert.match(src, /if \(previous && previous\.latitude === r\.latitude && previous\.longitude === r\.longitude\) return previous;/);
  // New markers redraw through their first layout on iOS too.
  assert.equal((src.match(/setTimeout\(\(\) => setTracksViewChanges\(false\), MARKER_FIRST_TRACK_MS\)/g) || []).length, 2);
  // Tapping a venue never zooms back out.
  assert.match(src, /Math\.min\(0\.03, current\?\.longitudeDelta \?\? 0\.03\)/);
  assert.match(src, /const pinSpread = useMemo\(\(\) => separateIdenticalPoints\(placeMarkers\), \[placeMarkers\]\);/);
});
