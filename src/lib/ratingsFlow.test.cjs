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
  // Sentry gets a real Error with the server's text; dropped connections are not reported.
  assert.match(refresh, /Sentry\.captureException\(new Error\(`Ratings refresh failed: \$\{message \|\| code\}`\)/);
  // Network failures (no code, often an empty message) are never reported.
  assert.match(refresh, /if \(typeof code === 'string' && code && !\/network\|fetch\|abort/);
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
  assert.match(src, /if \(dotMode && place\.id !== selectedId && place\.id !== activePlace\?\.id\) \{\s*return \[<PlaceDot/);
  assert.doesNotMatch(src, /<ClusterMarker key=\{`cluster:/);
  // The map opens on the remembered city: it waits for the read, starts on that
  // city's centre, and re-applies a city chosen before the map was ready.
  assert.match(src, /if \(!cityRestored\) \{\s*return <View style=\{styles\.screen\} \/>;/);
  assert.match(src, /const anchor = selected \?\? cityCentre \?\? cityPlaces\[0\]/);
  assert.match(src, /if \(shown && nearestSupportedCityKey\(shown\) === selectedCity\) return;\s*animateToCity\(selectedCity\);/);
  // The centre used to pick visible venues follows the map at every zoom.
  // Follows real moves at any zoom but ignores sub-pixel jitter (exact equality
  // remounted tracking markers over and over and froze the screen).
  assert.match(src, /const centreJitter = r\.longitudeDelta \/ 50;/);
  // New markers redraw through their first layout on iOS too.
  assert.equal((src.match(/setTimeout\(\(\) => setTracksViewChanges\(false\), MARKER_FIRST_TRACK_MS\)/g) || []).length, 3);
  // Tapping a venue never zooms back out.
  assert.match(src, /Math\.min\(0\.03, current\?\.longitudeDelta \?\? 0\.03\)/);
  assert.match(src, /const pinSpread = useMemo\(\(\) => separateIdenticalPoints\(placeMarkers\), \[placeMarkers\]\);/);
});

test('TestFlight feedback: old reminders, rating text, nearby, leaving the venue, pin names, friend DMs', () => {
  const places = read('src/context/PlacesContext.tsx');
  // An old "still here?" reminder never reopens the prompt after checking out.
  assert.match(places, /if \(activeRef\.current\?\.placeId !== placeId\) return false;/);
  assert.match(read('app/(tabs)/notifications.tsx'), /n\.type === 'still_here' && n\.placeId && openStillHerePrompt\(n\.placeId\)\) return;/);
  // Two clearly-away fixes in a row end the check-in.
  assert.match(places, /const away = await checkAwayFrom\(place\);/);
  assert.match(places, /if \(strikes < AWAY_STRIKES_TO_CHECK_OUT\) return;/);
  // Ratings without text say so; every rating shows its three scores.
  const place = read('app/place/[id].tsx');
  assert.match(place, /Yalnızca puan verdi, yorum yazmadı\./);
  assert.match(place, /Wi‑Fi \$\{formatScore\(review\.wifi\)\}/);
  // "Yakınımda" always moves the map to the member.
  const map = read('app/(tabs)/index.tsx');
  assert.match(map, /if \(option\.key === 'near'\) \{ void goToMyLocation\(\); return; \}/);
  assert.match(map, /\{shortPlaceName\(place\.name\)\}/);
  // Names are their own markers: a pin view widened by its caption swallowed taps
  // on iOS and venues stopped opening (found in the simulator).
  const pin = map.slice(map.indexOf('const PlaceMarker = memo'), map.indexOf('function clusterSize'));
  assert.doesNotMatch(pin, /shortPlaceName|markerLabel/);
  assert.match(map, /markerStack: \{ paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center' \}/);
  assert.match(map, /<PlaceLabel key=\{`label:\$\{paintEpoch\}:\$\{place\.id\}`\}/);
  // Ankara opened with the venue window still centred on İstanbul: no dots until a drag.
  assert.match(map, /if \(cityRestored && !initialRegionRef\.current && anchor\)/);
  assert.match(map, /getCamera\(\)\.then\(\(\{ center \}\)/);
  // Friends open a DM directly; sheets stay above the keyboard.
  assert.match(read('app/person/[id].tsx'), /socialAction<\{ thread_id: string \}>\('open_thread', \{ peer_id: id \}\)/);
  assert.match(read('src/components/Sheet.tsx'), /marginBottom: Math\.max\(0, keyboard\.value - bottomPad\)/);
  const sheet = read('src/components/Sheet.tsx');
  assert.ok(sheet.indexOf('const keyboard = useKeyboardLift(0);') < sheet.indexOf('if (!mounted) return null;'), 'hooks before the early return');
});

test('leaving-venue rule and pin captions', () => {
  const ts = require('typescript');
  const load = (file, mocks) => {
    const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    new Function('exports', 'require', 'module', code)(mod.exports, (n) => mocks[n] ?? {}, mod);
    return mod.exports;
  };
  const { isAwayFromVenue } = load('src/lib/checkInProximity.ts', {});
  assert.equal(isAwayFromVenue(800, 30), true);
  assert.equal(isAwayFromVenue(360, 30), false, 'inside the uncertainty');
  assert.equal(isAwayFromVenue(2000, 500), false, 'too vague to tell');
  assert.equal(isAwayFromVenue(2000, null), false);
  const { shortPlaceName } = load('src/lib/placeLabel.ts', { '@/data/neighbourhoods': { NEIGHBOURHOODS: [] } });
  assert.equal(shortPlaceName('Coffee Project | İncek'), 'Coffee Project');
  assert.equal(shortPlaceName('Kahve Dünyası - Kızılay'), 'Kahve Dünyası');
  assert.equal(shortPlaceName('Arabica Coffee House Bilkent'), 'Arabica Coffee…');
});

test('background geofence: leaving the venue ends exactly that check-in', async () => {
  const ts = require('typescript');
  const code = ts.transpileModule(read('src/lib/checkInGeofence.ts'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const store = new Map([['raslash.activeCheckIn', JSON.stringify({ placeId: 'p1', userId: 'u1', reminderNotificationId: 'r1' })]]);
  const calls = [];
  const mocks = {
    '@react-native-async-storage/async-storage': { default: {
      getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); },
      removeItem: async (k) => { store.delete(k); } } },
    'expo-location': { GeofencingEventType: { Enter: 1, Exit: 2 },
      hasStartedGeofencingAsync: async () => true, stopGeofencingAsync: async () => { calls.push('stop'); } },
    'expo-notifications': { cancelScheduledNotificationAsync: async (id) => { calls.push(`cancel:${id}`); },
      scheduleNotificationAsync: async (n) => { calls.push(`notify:${n.content.data.type}`); } },
    'expo-task-manager': { isTaskDefined: () => false, defineTask: (name) => calls.push(`define:${name}`) },
    'react-native': { Alert: { alert() {} } },
    '@/lib/checkIns': { endRemoteCheckIn: async (placeId, userId) => { calls.push(`end:${placeId}:${userId}`); } },
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', code)(mod.exports, (n) => mocks[n], mod);
  assert.deepEqual(calls.splice(0), ['define:raslash-check-in-geofence'], 'task registered at load');
  const seen = [];
  mod.exports.onGeofenceExit((id) => seen.push(id));
  // A stale region from another venue changes nothing but the watcher.
  await mod.exports.handleGeofenceExit('other');
  assert.deepEqual(calls.splice(0), ['stop']);
  assert.ok(store.has('raslash.activeCheckIn'));
  await mod.exports.handleGeofenceExit('p1');
  assert.deepEqual(calls, ['stop', 'cancel:r1', 'end:p1:u1', 'notify:left_venue']);
  assert.equal(store.has('raslash.activeCheckIn'), false);
  assert.deepEqual(seen, ['p1']);
  // Wiring: started after check-in, stopped on check-out, registered at launch.
  const places = read('src/context/PlacesContext.tsx');
  assert.match(places, /if \(venue\) void enableLeaveDetection\(venue\);/);
  assert.match(places, /void stopCheckInGeofence\(\);/);
  assert.match(read('app/_layout.tsx'), /import '@\/lib\/checkInGeofence';/);
  const app = JSON.parse(read('app.json')).expo;
  assert.equal(app.version, '1.0.7');
  assert.ok(app.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription);
  // The App Store "Languages" line reads the binary: Turkish, not Expo's default English.
  assert.equal(app.ios.infoPlist.CFBundleDevelopmentRegion, 'tr');
  assert.deepEqual(app.ios.infoPlist.CFBundleLocalizations, ['tr']);
  // Android: no foreground service (geofencing does not need one; Play asks to
  // declare it), and the camera stays optional so camera-less devices remain supported.
  const location = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-location')[1];
  assert.equal(location.isAndroidForegroundServiceEnabled, false);
  assert.match(read('app.config.js'), /'android:required': 'false'/);
});

test('map markers cover the whole map, a new city draws at once, and Mekân öner is always there', () => {
  const src = read('app/(tabs)/index.tsx');
  // One marker per screen cell before the budget, so a dense city does not leave districts empty.
  assert.match(src, /const cellPt = dotMode \? DOT_CELL_PT : PIN_CELL_PT;/);
  assert.ok(src.indexOf('if (taken.has(cell)) return false;') < src.indexOf('if (list.length <= limit) return list;'));
  // Switching city moves the marker window there without waiting for a map callback.
  const apply = src.slice(src.indexOf('const applyCitySelection = useCallback'), src.indexOf('const animateToCity'));
  assert.match(apply, /setMapCenter\(\{ latitude: city\.latitude, longitude: city\.longitude \}\);/);
  assert.match(apply, /setMapZoom\(\{ longitudeDelta: CITY_LNG_DELTA, latitude: city\.latitude \}\);/);
  // The suggest button is back on the map.
  assert.match(src, /onPress=\{\(\) => router\.push\('\/add-place'\)\}\s*accessibilityRole="button"\s*accessibilityLabel="Mekân öner"/);
});

test('check-in stays on the venue, scores always show, and the photo is reachable', () => {
  const place = read('app/place/[id].tsx');
  const confirm = place.slice(place.indexOf('const onConfirmCheckIn'), place.indexOf('const [leaveOpen'));
  assert.doesNotMatch(confirm, /router\.push\(`\/chat\//);
  assert.match(place, /label=\{isCheckedInHere \? 'Sohbete katıl' : 'Check‑in yap'\}/);
  assert.match(place, /router\.replace\(`\/rate\/\$\{leftId\}`\)/);
  // Icons with "–" even before the first rating.
  assert.doesNotMatch(place, /place\.reviewCount > 0 \? <Appear delay=\{90\}/);
  assert.match(place, /value > 0 \? value\.toFixed\(1\) : '–'/);
  assert.match(place, /Mekânın sahibi misin\? Fotoğraflarını gönder/);
  const rate = read('app/rate/[placeId].tsx');
  assert.ok(rate.indexOf('Fotoğraf ekle') < rate.indexOf('<Field'), 'photo comes before the comment');
  assert.match(rate, /submitBehavior="blurAndSubmit"/);
});

test('rating asks three clear questions with stars that start empty', () => {
  const rate = read('app/rate/[placeId].tsx');
  assert.match(rate, /useState<Record<ScoreKey, number>>\(\{ outlets: 0, wifi: 0, comfort: 0 \}\)/);
  assert.match(rate, /disabled=\{remaining > 0\}/);
  assert.match(rate, /'Priz bulmak kolay mıydı\?'/);
  assert.match(rate, /'Çok kötü', 'Kötü', 'Fena değil', 'İyi', 'Harika'/);
  // Simulator hangs from test runs stay out of Sentry.
  assert.match(read('src/lib/sentry.ts'), /enabled: Boolean\(dsn\) && Device\.isDevice/);
  // The focused input is revealed after the footer has risen with the keyboard.
  assert.match(read('src/components/Screen.tsx'), /setTimeout\(\(\) => list\.scrollTo\(\{ y, animated: true \}\), liftMs \+ 30\)/);
});
