import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Sheet, SheetAppear } from '@/components/Sheet';
import { Button, TextButton } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export type CheckInPromptMode = 'too_far' | 'confirm' | 'loading' | null;

type Props = {
  visible: boolean;
  mode: CheckInPromptMode;
  placeName?: string;
  /** Measured distance to the venue, used to explain why check-in is blocked. */
  distanceM?: number | null;
  onConfirm: () => void;
  onDismiss: () => void;
};

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

export function CheckInPrompt({
  visible,
  mode,
  placeName,
  distanceM,
  onConfirm,
  onDismiss,
}: Props) {
  // Keep the last real mode so the sheet can animate out after it is cleared.
  const shown = useRef<Exclude<CheckInPromptMode, null>>('confirm');
  if (mode) shown.current = mode;

  const active = mode ?? shown.current;
  const isLoading = active === 'loading';
  const isFar = active === 'too_far';

  const title = isLoading
    ? undefined
    : isFar
      ? 'Mekana vardığından emin misin?'
      : 'Doğru mekanda mısın?';

  const subtitle = isLoading
    ? undefined
    : isFar
      ? 'Konumun mekanın yakınında görünmüyor. Check‑in yapmak için biraz daha yaklaşman gerekiyor.'
      : placeName
        ? `${placeName} için check‑in yapmak üzeresin. Onayladığında sohbet odası açılır.`
        : 'Onayladığında sohbet odası açılır.';

  return (
    <Sheet
      visible={visible && mode != null}
      onClose={onDismiss}
      title={title}
      subtitle={subtitle}
    >
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.loadingText}>Konumun kontrol ediliyor…</Text>
          {/* Always leave a way out: a stalled GPS lookup must not trap the user. */}
          <TextButton label="Vazgeç" onPress={onDismiss} />
        </View>
      ) : (
        <>
          {/* `SheetAppear` rather than Reanimated's `entering`: layout
              animations inside a native Modal freeze the sheet on Android. */}
          <SheetAppear style={[styles.icon, isFar ? styles.iconFar : styles.iconNear]}>
            <Ionicons
              name={isFar ? 'navigate-circle-outline' : 'checkmark-circle-outline'}
              size={30}
              color={isFar ? colors.amber : colors.green}
            />
          </SheetAppear>

          {distanceM != null ? (
            <SheetAppear delay={50}>
              <Text style={styles.distance}>
                Şu an yaklaşık {formatDistance(distanceM)} uzaktasın.
              </Text>
            </SheetAppear>
          ) : null}

          <SheetAppear delay={90}>
            {isFar ? (
              <Button label="Anladım" onPress={onDismiss} />
            ) : (
              <View style={styles.actions}>
                <Button label="Onaylıyorum, buradayım" onPress={onConfirm} />
                <TextButton label="Vazgeç" onPress={onDismiss} />
              </View>
            )}
          </SheetAppear>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 28,
    paddingBottom: 4,
  },
  loadingText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    fontSize: 14,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  iconFar: { backgroundColor: colors.amberSoft },
  iconNear: { backgroundColor: colors.greenSoft },
  distance: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  actions: { gap: 0 },
});
