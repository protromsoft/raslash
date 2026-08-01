import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Appear, PressableScale } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Card, Field, ScreenTitle, TextButton } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import { haptic } from '@/lib/haptics';
import { colors, shadows } from '@/theme/colors';
import { duration, stagger } from '@/theme/motion';
import { radii, spacing } from '@/theme/spacing';

const QUESTIONS = [
  { key: 'outlets', label: 'Priz yeterli miydi?', icon: 'flash-outline' as const },
  { key: 'wifi', label: 'Wi‑Fi hızı nasıldı?', icon: 'wifi' as const },
  { key: 'comfort', label: 'Mekan çalışmak için rahat mıydı?', icon: 'cafe-outline' as const },
] as const;

const SCALE_HINT = ['Kötü', 'İdare eder', 'Fena değil', 'İyi', 'Harika'];

function ScorePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View>
      <View style={styles.scoreRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <PressableScale
              key={n}
              onPress={() => {
                haptic('select');
                onChange(n);
              }}
              scaleTo={0.9}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityLabel={`${n} puan`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{n}</Text>
            </PressableScale>
          );
        })}
      </View>
      <Animated.Text key={value} entering={FadeIn.duration(duration.fast)} style={styles.scaleHint}>
        {SCALE_HINT[value - 1]}
      </Animated.Text>
    </View>
  );
}

export default function RatePlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { getPlace, submitRating } = usePlaces();
  const place = getPlace(placeId);

  const [scores, setScores] = useState({ outlets: 4, wifi: 4, comfort: 4 });
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const overall = useMemo(
    () => ((scores.outlets + scores.wifi + scores.comfort) / 3).toFixed(1),
    [scores],
  );

  if (!place) {
    return (
      <Screen contentStyle={styles.center}>
        <Text style={styles.missing}>Mekan bulunamadı.</Text>
        <Button label="Haritaya dön" tone="outline" full={false} onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  const publish = async () => {
    setSaving(true);
    await submitRating(place.id, scores, text);
    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <Screen contentStyle={styles.center}>
        <Appear style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={30} color={colors.white} />
          </View>
          <ScreenTitle
            title="Puanın yayınlandı"
            subtitle={`${place.name} ortalaması güncellendi. Teşekkürler!`}
          />
          <Button label="Haritaya dön" onPress={() => router.replace('/(tabs)')} />
        </Appear>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboard contentStyle={styles.content}>
      <HeaderBar onBack={() => router.back()} />

      <ScreenTitle
        title="Mekandan ayrıldın"
        subtitle={`${place.name} nasıldı? Puanlar sadece Raslash kullanıcılarından toplanır.`}
      />

      <Appear delay={60}>
        <Card style={styles.overallCard}>
          <View>
            <Text style={styles.overallLabel}>Ortalama puanın</Text>
            <Text style={styles.overallHint}>Üç başlığın ortalaması</Text>
          </View>
          <Animated.Text key={overall} entering={FadeIn.duration(duration.fast)} style={styles.overallValue}>
            {overall}
          </Animated.Text>
        </Card>
      </Appear>

      <View style={styles.questions}>
        {QUESTIONS.map((q, i) => (
          <Appear key={q.key} delay={stagger(i, 60) + 90}>
            <Card style={styles.question}>
              <View style={styles.questionHead}>
                <View style={styles.questionIcon}>
                  <Ionicons name={q.icon} size={15} color={colors.ink} />
                </View>
                <Text style={styles.questionLabel}>{q.label}</Text>
              </View>
              <ScorePicker
                value={scores[q.key]}
                onChange={(n) => setScores((prev) => ({ ...prev, [q.key]: n }))}
              />
            </Card>
          </Appear>
        ))}
      </View>

      <Appear delay={280}>
        <Field
          label="Yorum (isteğe bağlı)"
          value={text}
          onChangeText={setText}
          placeholder="Kısa bir not bırak — masalar, gürültü, kahve…"
          multiline
        />
      </Appear>

      <View style={styles.footer}>
        <Button label="Puanı yayınla" loading={saving} onPress={() => void publish()} />
        <TextButton label="Şimdi değil" onPress={() => router.replace('/(tabs)')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  missing: { fontFamily: 'DMSans_500Medium', color: colors.muted },

  doneWrap: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  doneIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },

  overallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overallLabel: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  overallHint: { fontFamily: 'DMSans_400Regular', fontSize: 12.5, color: colors.muted, marginTop: 2 },
  overallValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    letterSpacing: -1,
    color: colors.ink,
  },

  questions: { gap: 10 },
  question: { gap: 12 },
  questionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionLabel: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 14.5, color: colors.ink },

  scoreRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    height: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.inkSoft },
  chipTextActive: { color: colors.white },
  scaleHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },

  footer: { marginTop: 'auto', paddingTop: spacing.sm },
});
