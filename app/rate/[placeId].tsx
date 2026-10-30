import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Appear, PressableScale } from '@/components/Motion';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Screen } from '@/components/Screen';
import { Button, Card, Field, ScreenTitle, TextButton } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { usePlaces } from '@/context/PlacesContext';
import { haptic } from '@/lib/haptics';
import { hasPhotoAccess, takeCameraPhoto } from '@/lib/placePhotos';
import { colors, shadows } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';
import { goBackOrHome } from '@/lib/navigation';

// Members said the 1–5 dots (pre-set to 4) were unclear: each row is now a
// question with an icon, five stars that start empty, and the chosen meaning.
const QUESTIONS = [
  { key: 'wifi', label: 'Wi‑Fi', question: 'Wi‑Fi nasıldı?', icon: 'wifi' },
  { key: 'outlets', label: 'Priz', question: 'Priz bulmak kolay mıydı?', icon: 'flash-outline' },
  { key: 'comfort', label: 'Rahatlık', question: 'Çalışmak için rahat mıydı?', icon: 'cafe-outline' },
] as const;

type ScoreKey = (typeof QUESTIONS)[number]['key'];

const MEANINGS = ['Çok kötü', 'Kötü', 'Fena değil', 'İyi', 'Harika'];

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={`${label} puanı`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n;
        return (
          <PressableScale
            key={n}
            onPress={() => {
              haptic('select');
              onChange(n);
            }}
            scaleTo={0.85}
            hitSlop={4}
            style={styles.star}
            accessibilityLabel={`${label} ${n} yıldız, ${MEANINGS[n - 1]}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
          >
            <Ionicons name={n <= value ? 'star' : 'star-outline'} size={34} color={n <= value ? colors.ink : colors.mutedSoft} />
          </PressableScale>
        );
      })}
    </View>
  );
}

export default function RatePlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const { getPlace, labelFor, submitRating } = usePlaces();
  const { user, isSubscribed, isAdmin } = useApp();
  // Review photos are Pro; the ratings policy rejects a photo without access.
  const photoAccess = hasPhotoAccess({
    isSubscribed,
    isAdmin,
    appReviewAccess: user?.app_metadata?.app_review_access,
  });
  const place = getPlace(placeId);

  const [scores, setScores] = useState<Record<ScoreKey, number>>({ outlets: 0, wifi: 0, comfort: 0 });
  const remaining = QUESTIONS.filter((q) => scores[q.key] === 0).length;
  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  if (!place) {
    return (
      <Screen contentStyle={styles.center}>
        <Text style={styles.missing}>Mekân bulunamadı.</Text>
        <Button label="Haritaya dön" tone="outline" full={false} onPress={goBackOrHome} />
      </Screen>
    );
  }

  const publish = async () => {
    if (submitting.current || remaining > 0) return;
    submitting.current = true; setSaving(true); setError('');
    try { await submitRating(place.id, scores, text, (photoAccess && photoUri) || undefined); setDone(true); }
    catch { setError('Puanın kaydedilemedi. Biraz sonra tekrar dene.'); }
    finally { submitting.current = false; setSaving(false); }
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
            subtitle={`${labelFor(place)} ortalaması güncellendi. Teşekkürler!`}
          />
          <Button label="Haritaya dön" onPress={goBackOrHome} />
        </Appear>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboard contentStyle={styles.content} footer={<View style={styles.footer}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button
        label={remaining > 0 ? `${remaining} soru kaldı` : 'Puanı yayınla'}
        loading={saving}
        disabled={remaining > 0}
        onPress={() => void publish()}
      />
      <TextButton label="Şimdi değil" onPress={goBackOrHome} />
    </View>}>
      <ScreenTitle
        title={`${labelFor(place)} nasıldı?`}
        subtitle="Üç kısa soru. Yıldıza dokunarak puan ver."
        align="left"
      />

      <Appear delay={60}>
        <Card style={styles.questions}>
          {QUESTIONS.map((q, i) => (
            <View key={q.key} style={[styles.question, i < QUESTIONS.length - 1 && styles.questionDivider]}>
              <View style={styles.questionHead}>
                <Ionicons name={q.icon} size={18} color={colors.ink} />
                <Text style={styles.questionLabel}>{q.question}</Text>
              </View>
              <View style={styles.answer}>
                <StarPicker
                  label={q.label}
                  value={scores[q.key]}
                  onChange={(n) => setScores((prev) => ({ ...prev, [q.key]: n }))}
                />
                <Text style={[styles.meaning, scores[q.key] === 0 && styles.meaningEmpty]}>
                  {scores[q.key] > 0 ? MEANINGS[scores[q.key] - 1] : 'Seç'}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </Appear>

      <Appear delay={120}>
        {photoUri && photoAccess ? (
          <View style={styles.photoRow}>
            <PressableScale
              onPress={() => setViewing(true)}
              accessibilityRole="imagebutton"
              accessibilityLabel="Eklediğin fotoğrafı tam ekran aç"
              style={styles.photoThumb}
            >
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </PressableScale>
            <View style={styles.photoCopy}>
              <Text style={styles.photoTitle}>Fotoğraf eklendi</Text>
              <Text style={styles.photoSub}>Puanınla birlikte mekân sayfasında Pro üyelere görünür.</Text>
            </View>
            <PressableScale
              onPress={() => setPhotoUri(null)}
              disabled={saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fotoğrafı kaldır"
              style={styles.photoRemove}
            >
              <Ionicons name="close" size={18} color={colors.ink} />
            </PressableScale>
          </View>
        ) : (
          <PressableScale
            onPress={() => {
              if (!photoAccess) {
                router.push('/paywall');
                return;
              }
              void takeCameraPhoto().then((uri) => { if (uri) setPhotoUri(uri); });
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={photoAccess ? 'Fotoğraf ekle' : 'Fotoğraf ekle, Pro özelliği'}
            accessibilityHint={
              photoAccess
                ? 'Kamerayı açar. Fotoğraf isteğe bağlıdır.'
                : 'Raslash Pro ekranını açar.'
            }
            style={styles.photoRow}
          >
            <View style={styles.photoIcon}>
              <Ionicons name="camera-outline" size={20} color={colors.ink} />
            </View>
            <View style={styles.photoCopy}>
              <View style={styles.photoTitleRow}>
                <Text style={styles.photoTitle}>Fotoğraf ekle</Text>
                {!photoAccess ? (
                  <View style={styles.proTag}>
                    <Text style={styles.proTagText}>Pro</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.photoSub}>
                {photoAccess
                  ? 'İsteğe bağlı, mekânda kamerayla çekilir.'
                  : 'Pro ile mekândan anlık fotoğraf ekle.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </PressableScale>
        )}
      </Appear>

      <Appear delay={160}>
        <Field
          label="Yorum (isteğe bağlı)"
          value={text}
          onChangeText={setText}
          placeholder="Diğerlerine bir ipucu bırak"
          multiline
          maxLength={500}
          // Multiline has no Return-to-close; "Bitti" closes the keyboard so the
          // rest of the screen can be reached on small phones (user feedback).
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          editable={!saving}
        />
      </Appear>

      <PhotoViewer uri={viewing ? photoUri : null} onClose={() => setViewing(false)} />

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
  question: { gap: 8, paddingVertical: 14 },
  questionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  answer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stars: { flexDirection: 'row', gap: 2 },
  star: { padding: 2 },
  meaning: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.ink },
  meaningEmpty: { fontFamily: 'DMSans_400Regular', color: colors.mutedSoft },
  questionDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  questionLabel: { flexShrink: 1, fontFamily: 'DMSans_700Bold', fontSize: 16, color: colors.ink },


  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  photoIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoThumb: { width: 56, height: 56, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.bgSoft },
  photoCopy: { flex: 1, gap: 2 },
  photoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: colors.ink },
  proTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  proTagText: { fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.white },
  photoSub: { fontFamily: 'DMSans_400Regular', fontSize: 12.5, lineHeight: 17, color: colors.muted },
  photoRemove: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: { gap: 4, paddingTop: spacing.sm },
  error: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, color: colors.danger },
});
