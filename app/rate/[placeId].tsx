import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Appear, PressableScale } from '@/components/Motion';
import { Screen } from '@/components/Screen';
import { Button, Card, Field, ScreenTitle, TextButton } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import { haptic } from '@/lib/haptics';
import { colors, shadows } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { goBackOrHome } from '@/lib/navigation';

const QUESTIONS = [
  { key: 'wifi', label: 'Wi‑Fi' },
  { key: 'comfort', label: 'Rahatlık' },
  { key: 'outlets', label: 'Priz' },
] as const;

function ScorePicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.scoreRow} accessibilityRole="radiogroup" accessibilityLabel={`${label} puanı`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n;
        const filled = n <= value;
        return (
          <PressableScale
            key={n}
            onPress={() => {
              haptic('select');
              onChange(n);
            }}
            scaleTo={0.9}
            hitSlop={2}
            style={[styles.dot, filled && styles.dotFilled]}
            accessibilityLabel={`${label} ${n} puan`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
          >
            <Text style={[styles.dotText, filled && styles.dotTextFilled]} maxFontSizeMultiplier={1.3}>{n}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export default function RatePlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { getPlace, labelFor, submitRating } = usePlaces();
  const place = getPlace(placeId);

  const [scores, setScores] = useState({ outlets: 4, wifi: 4, comfort: 4 });
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  if (!place) {
    return (
      <Screen sheet contentStyle={styles.center}>
        <Text style={styles.missing}>Mekân bulunamadı.</Text>
        <Button label="Haritaya dön" tone="outline" full={false} onPress={goBackOrHome} />
      </Screen>
    );
  }

  const publish = async () => {
    if (submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    try { await submitRating(place.id, scores, text); setDone(true); }
    catch { setError('Puanın kaydedilemedi. Biraz sonra tekrar dene.'); }
    finally { submitting.current = false; setSaving(false); }
  };

  if (done) {
    return (
      <Screen sheet contentStyle={styles.center}>
        <Appear style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={30} color={colors.white} />
          </View>
          <ScreenTitle
            title="Puanın yayınlandı"
            subtitle={`${labelFor(place)} ortalaması güncellendi. Teşekkürler!`}
          />
          <Button label="Haritaya dön" onPress={goBackOrHome} />
        </Appear>
      </Screen>
    );
  }

  return (
    <Screen sheet scroll keyboard contentStyle={styles.content} footer={<View style={styles.footer}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label="Puanı yayınla" loading={saving} onPress={() => void publish()} />
      <TextButton label="Şimdi değil" onPress={goBackOrHome} />
    </View>}>
      <ScreenTitle
        title={`${labelFor(place)} nasıldı?`}
        subtitle="Üç kısa soru, 10 saniye."
        align="left"
      />

      <Appear delay={60}>
        <Card style={styles.questions}>
          {QUESTIONS.map((q, i) => (
            <View key={q.key} style={[styles.question, i < QUESTIONS.length - 1 && styles.questionDivider]}>
              <Text style={styles.questionLabel} numberOfLines={1}>{q.label}</Text>
              <ScorePicker
                label={q.label}
                value={scores[q.key]}
                onChange={(n) => setScores((prev) => ({ ...prev, [q.key]: n }))}
              />
            </View>
          ))}
        </Card>
      </Appear>

      <Appear delay={120}>
        <Field
          label="Yorum (isteğe bağlı)"
          value={text}
          onChangeText={setText}
          placeholder="Diğerlerine bir ipucu bırak"
          multiline
          maxLength={500}
          editable={!saving}
        />
      </Appear>

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

  questions: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: 20 },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
  },
  questionDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  questionLabel: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },

  scoreRow: { flexDirection: 'row', gap: 4 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFilled: { backgroundColor: colors.ink },
  dotText: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.inkSoft },
  dotTextFilled: { color: colors.white },

  footer: { gap: 4, paddingTop: spacing.sm },
  error: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, color: colors.danger },
});
