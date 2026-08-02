import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { Sheet, SheetAppear } from '@/components/Sheet';
import { TextButton } from '@/components/ui';
import { colors, shadows } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

type Props = {
  visible: boolean;
  placeName?: string;
  onStay: () => void;
  onLeave: () => void;
  onDismiss: () => void;
};

export function StillHerePrompt({ visible, placeName, onStay, onLeave, onDismiss }: Props) {
  return (
    <Sheet
      visible={visible}
      onClose={onDismiss}
      title="Hâlâ mekanda mısın?"
      subtitle={
        placeName
          ? `${placeName} check‑in'in 3 saattir açık. Devam ediyorsan bir dokunuş yeterli.`
          : "Check‑in'in 3 saattir açık. Hâlâ orada mısın?"
      }
    >
      {/* `SheetAppear` rather than Reanimated's `entering`: layout animations
          inside a native Modal freeze the sheet on Android. */}
      <SheetAppear style={styles.row}>
        <PressableScale onPress={onStay} style={styles.choice} scaleTo={0.95}>
          <View style={[styles.icon, styles.stay]}>
            <Ionicons name="cafe" size={26} color={colors.white} />
          </View>
          <Text style={styles.label}>Mekandayım</Text>
          <Text style={styles.hint}>Check‑in açık kalsın</Text>
        </PressableScale>

        <PressableScale onPress={onLeave} style={styles.choice} scaleTo={0.95}>
          <View style={[styles.icon, styles.leave]}>
            <Ionicons name="exit-outline" size={26} color={colors.ink} />
          </View>
          <Text style={styles.label}>Çıktım</Text>
          <Text style={styles.hint}>Puanlamaya geç</Text>
        </PressableScale>
      </SheetAppear>

      <SheetAppear delay={80}>
        <TextButton label="Sonra sorarsın" onPress={onDismiss} />
      </SheetAppear>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.xs,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    ...shadows.soft,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stay: { backgroundColor: colors.green },
  leave: { backgroundColor: colors.bgSoft },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  hint: { fontFamily: 'DMSans_400Regular', fontSize: 11.5, color: colors.muted },
});
