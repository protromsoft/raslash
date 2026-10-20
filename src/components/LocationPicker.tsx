import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { colors, shadows } from '@/theme/colors';

export type PickedLocation = { latitude: number; longitude: number };

/** Street-level zoom: close enough to put the pin on the right building. */
const PICK_DELTA = 0.006;

/**
 * Full-screen map with a fixed centre pin: the person drags the map under the
 * pin instead of dragging a marker, which is easier to aim with a thumb.
 * Plain RN views only — Reanimated layout animations freeze inside a Modal.
 */
export function LocationPicker({ visible, initial, onPick, onClose }: {
  visible: boolean;
  initial: PickedLocation;
  onPick: (location: PickedLocation) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const center = useRef<PickedLocation>(initial);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}
      onShow={() => { center.current = initial; }}>
      <View style={styles.screen}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          // The Modal mounts its content only while visible, so this is read on every open.
          initialRegion={{ ...initial, latitudeDelta: PICK_DELTA, longitudeDelta: PICK_DELTA }}
          onRegionChangeComplete={(next) => { center.current = { latitude: next.latitude, longitude: next.longitude }; }}
          showsUserLocation
          showsPointsOfInterests
          toolbarEnabled={false}
        />
        {/* The pin's tip sits on the map centre. */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <Ionicons name="location" size={44} color={colors.ink} style={styles.pin} />
        </View>
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={6}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.hint}>
            <Text style={styles.hintTitle}>Konumu seç</Text>
            <Text style={styles.hintBody}>Haritayı kaydır, iğneyi mekânın üstüne getir.</Text>
          </View>
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <Button label="Bu konumu kullan" onPress={() => onPick(center.current)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pinWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // Lift the icon by half its height so its point, not its middle, marks the spot.
  pin: { marginBottom: 44 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center',
    justifyContent: 'center', ...shadows.soft },
  hint: { flex: 1, backgroundColor: colors.white, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, ...shadows.soft },
  hintTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  hintBody: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0 },
});
