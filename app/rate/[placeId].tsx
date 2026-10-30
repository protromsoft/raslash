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
  const { user, isSubscribed, isAdmin } = useApp();
  // Review photos are Pro; the ratings policy rejects a photo without access.
  const photoAccess = hasPhotoAccess({
    isSubscribed,
    isAdmin,
    appReviewAccess: user?.app_metadata?.app_review_access,
  });
  const place = getPlace(placeId);

  const [scores, setScores] = useState({ outlets: 4, wifi: 4, comfort: 4 });
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
    if (submitting.current) return;
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
