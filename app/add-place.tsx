import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Appear } from '@/components/Motion';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Field, ScreenTitle } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import { haversineKm } from '@/lib/presence';
import { districtForPlace } from '@/lib/placeLabel';
import { SCAN_CITIES } from '@/lib/placeScanGrid';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * `places.category` is free text (no enum/check), so "Diğer" is stored as-is;
 * the admin can recategorise on approval. Anything not Cowork gets cafe photos.
 */
const CATEGORIES = [
  { value: 'Cafe', label: 'Cafe' },
  { value: 'Cowork', label: 'Cowork' },
  { value: 'Diğer', label: 'Diğer' },
] as const;

/** Suggestions are limited to the cities the app covers; a little beyond the scan radius is fine. */
const CITY_MARGIN_KM = 15;

function cityFor(location: PickedLocation) {
  return SCAN_CITIES.find((city) => haversineKm(location, city) <= city.radiusKm + CITY_MARGIN_KM)?.city;
}

export default function AddPlaceScreen() {
  const { submitPlace } = usePlaces();
  const [name, setName] = useState('');
  const [location, setLocation] = useState<PickedLocation>();
  const [picking, setPicking] = useState(false);
  // Where the picker opens: the person's last known position, else İstanbul.
  const [start, setStart] = useState<PickedLocation>({ latitude: SCAN_CITIES[0].latitude, longitude: SCAN_CITIES[0].longitude });
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('Cafe');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const city = location ? cityFor(location) : undefined;
  const outside = !!location && !city;

  // Last known position never prompts; without permission the picker opens on İstanbul.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
        if (pos && mounted) setStart({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // The picker still works from the city centre.
      }
    })();
    return () => { mounted = false; };
  }, []);

  const submit = async () => {
    if (!name.trim() || !location || !city || submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    try { await submitPlace({ name, city, category, latitude: location.latitude, longitude: location.longitude }); setSent(true); }
    catch { setError('Önerin kaydedilemedi. Biraz sonra tekrar dene.'); }
    finally { submitting.current = false; setSaving(false); }
  };

  if (sent) {
    return (
      <Screen sheet contentStyle={styles.center}>
        <Appear style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="paper-plane" size={26} color={colors.white} />
          </View>
          <ScreenTitle
            title="Onaya gönderildi"
            subtitle={`"${name.trim()}" admin onayından sonra haritada görünecek. Sonucu bildirimlerden takip edebilirsin.`}
          />
          <Button label="Tamam" onPress={() => router.back()} />
        </Appear>
      </Screen>
    );
  }

  return (
    <Screen sheet scroll keyboard contentStyle={styles.content} footer={<View style={styles.footer}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label="Onaya gönder" disabled={!name.trim() || !city} loading={saving} onPress={() => void submit()} />
    </View>}>
      <HeaderBar onBack={() => router.back()} />

      <ScreenTitle
        title="Mekân öner"
        subtitle="Ekibimiz onaylayınca haritada görünür."
        align="left"
      />

      <Appear delay={60} style={styles.form}>
        <Field
          label="Mekân adı"
          value={name}
          onChangeText={setName}
          placeholder="Örn. Kronotrop Cihangir"
          autoCapitalize="words"
          maxLength={120}
          editable={!saving}
        />
        <View style={styles.block}>
          <Text style={styles.label}>Konum</Text>
          <Pressable onPress={() => setPicking(true)} disabled={saving} style={styles.locationRow}
            accessibilityRole="button" accessibilityLabel={location ? 'Konumu değiştir' : 'Konumu haritadan seç'}>
            <Ionicons name={location ? 'location' : 'map-outline'} size={20} color={colors.ink} />
            <Text style={[styles.locationText, !location && styles.locationPlaceholder]} numberOfLines={1}>
              {location
                ? [city, districtForPlace({ name: name.trim(), ...location })].filter(Boolean).join(' · ') || 'Konum seçildi'
                : 'Haritadan seç'}
            </Text>
            {location ? <Text style={styles.locationAction}>Değiştir</Text>
              : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
          </Pressable>
          {outside ? <Text style={styles.error}>Şimdilik İstanbul, Ankara ve İzmir'deki mekânları ekleyebiliyoruz.</Text> : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Tür</Text>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Tür">
            {CATEGORIES.map((c) => {
              const selected = category === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  disabled={saving}
                  style={[styles.segmentItem, selected && styles.segmentItemActive]}
                  accessibilityRole="radio"
                  accessibilityLabel={c.label}
                  accessibilityState={{ selected, checked: selected, disabled: saving }}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Appear>

      <LocationPicker visible={picking} initial={location ?? start} onClose={() => setPicking(false)}
        onPick={(picked) => { setLocation(picked); setPicking(false); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  doneWrap: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: spacing.md },
  block: { gap: spacing.sm },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 22,
    backgroundColor: colors.bgSoft,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: { backgroundColor: colors.ink },
  segmentText: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.inkSoft },
  segmentTextActive: { color: colors.white },
  locationRow: { minHeight: 56, borderRadius: 16, backgroundColor: colors.white, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationText: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 16, color: colors.ink },
  locationPlaceholder: { color: colors.muted },
  locationAction: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  footer: { gap: 4, paddingTop: spacing.sm },
  error: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, color: colors.danger },
});
