import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Appear } from '@/components/Motion';
import { ArtScreen } from '@/components/OnboardingArt';
import { Button } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import { EMPTY_WORK_PREFERENCES, PRIORITIES } from '@/lib/onboardingQuiz';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { OnboardingHeader, useOnboardingDraft } from './_layout';

/** What each priority changes for the member; facts only, no invented stats. */
const PROMISES: Record<string, string> = {
  wifi: 'Wi‑Fi puanı yüksek mekânları en üste alacağız',
  outlets: 'Prizi bol mekânlar listede önce gelecek',
  comfort: 'Rahatlık puanı yüksek yerleri öne çıkaracağız',
  quiet: 'Sakin ve rahat mekânları öne çıkaracağız',
  coffee: 'Kahvesiyle bilinen mekânları yorumlardan bulabileceksin',
  people: 'Şu an dolu mekânları “Şu an dolu” filtresiyle göreceksin',
};

/** Step 4: a breather between questions, made of the member's own answers. */
export default function OnboardingInsight() {
  const { draft } = useOnboardingDraft();
  const { places } = usePlaces();
  const priorities = (draft.workPreferences ?? EMPTY_WORK_PREFERENCES).priorities;
  const lines = priorities.map((key) => PROMISES[key]).filter(Boolean);
  if (!lines.length) lines.push('Mekânları gerçek kullanıcı puanlarına göre sıralayacağız');
  return (
    <ArtScreen
      art="plan"
      header={<OnboardingHeader step={4} onBack={() => router.back()} style={styles.header} />}
    >
      <View style={styles.copy}>
        <Appear>
          <Text style={styles.count} maxFontSizeMultiplier={1.2}>{places.length > 0 ? places.length.toLocaleString('tr-TR') : '900+'}</Text>
          <Text style={styles.countLabel} maxFontSizeMultiplier={1.3}>
            çalışma mekânı İstanbul, Ankara ve İzmir’de, Wi‑Fi’ı, prizi ve rahatlığı üyeler tarafından puanlanıyor.
          </Text>
        </Appear>
        <View style={styles.lines}>
          {lines.map((line, index) => (
            <Appear key={line} delay={160 + index * 120} style={styles.line}>
              <Text style={styles.tick}>✓</Text>
              <Text style={styles.lineText} maxFontSizeMultiplier={1.35}>{line}</Text>
            </Appear>
          ))}
        </View>
        <Text style={styles.note} maxFontSizeMultiplier={1.35}>
          {PRIORITIES.filter((p) => priorities.includes(p.key)).map((p) => p.label).join('  ·  ')}
        </Text>
      </View>
      <Button label="Devam" onPress={() => router.push('/onboarding/times')} />
    </ArtScreen>
  );
}

const styles = StyleSheet.create({
  header: { flex: 1 },
  copy: { gap: spacing.md },
  count: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 52, lineHeight: 56, letterSpacing: -1.6, color: colors.ink },
  countLabel: { fontFamily: 'DMSans_500Medium', fontSize: 17, lineHeight: 24, color: colors.muted },
  lines: { gap: 10 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tick: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.green, lineHeight: 22 },
  lineText: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 15.5, lineHeight: 22, color: colors.ink },
  note: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted },
});
