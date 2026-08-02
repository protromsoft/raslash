import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Linking, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Field, ScreenTitle, TextButton } from '@/components/ui';
import { colors, shadows } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { useDraftFlush, useOnboardingDraft } from './_layout';

const BIO_MAX = 160;

export default function OnboardingSocial() {
  const { draft, patch } = useOnboardingDraft();
  const [avatarUrl, setAvatarUrl] = useState(draft.avatarUrl ?? '');
  const [bio, setBio] = useState(draft.bio ?? '');
  const [instagram, setInstagram] = useState(draft.instagram ?? '');
  const [linkedin, setLinkedin] = useState(draft.linkedin ?? '');
  const [photoError, setPhotoError] = useState('');
  const [picking, setPicking] = useState(false);

  const answers = {
    avatarUrl,
    bio: bio.trim(),
    instagram: instagram.trim().replace(/^@/, ''),
    linkedin: linkedin.trim(),
  };
  useDraftFlush(answers);

  /**
   * The picker crops to a square and re-encodes, so even a 50 MP original comes
   * back as a small local file. Every failure is recoverable — this step is
   * optional — so nothing here blocks the flow.
   */
  const pickAvatar = async () => {
    if (picking) return;
    setPicking(true);
    setPhotoError('');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoError(
          perm.canAskAgain
            ? 'Fotoğraf seçebilmemiz için galeri iznine ihtiyacımız var.'
            : 'Galeri izni kapalı. Ayarlardan açıp tekrar deneyebilirsin.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setAvatarUrl(result.assets[0].uri);
      }
    } catch {
      setPhotoError('Fotoğraf açılamadı, tekrar dener misin?');
    } finally {
      setPicking(false);
    }
  };

  const next = () => {
    patch(answers);
    // Nothing on the gender step takes text, so the keyboard has no business
    // following the user there.
    Keyboard.dismiss();
    router.push('/onboarding/gender');
  };

  // Shown only while the step is untouched. It does the same thing as "Devam" —
  // it is there to say out loud that none of this is required.
  const hasInput = Boolean(avatarUrl || answers.bio || answers.instagram || answers.linkedin);

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button label="Devam" onPress={next} />
          {hasInput ? null : <TextButton label="Şimdilik geç" onPress={next} />}
        </View>
      }
    >
      <HeaderBar onBack={() => router.back()} progress={0.6} />

      <ScreenTitle
        animate={false}
        title="Profil fotoğrafını ekle"
        subtitle="Fotoğrafın ve bion, aynı mekandaki insanlar seni tanısın diye görünür."
      />

      <View style={styles.avatarWrap}>
        <PressableScale
          onPress={() => void pickAvatar()}
          scaleTo={0.95}
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? 'Profil fotoğrafını değiştir' : 'Profil fotoğrafı ekle'}
        >
          <View style={styles.avatarShell}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={220}
              />
            ) : (
              <View style={styles.avatarEmpty}>
                <Ionicons name="person-add-outline" size={28} color={colors.muted} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={15} color={colors.white} />
            </View>
          </View>
        </PressableScale>
        <Text style={styles.avatarHint}>
          {avatarUrl ? 'Değiştirmek için dokun' : 'Fotoğraf eklemek için dokun'}
        </Text>
        {photoError ? (
          <View style={styles.photoError}>
            <Text style={styles.errorText}>{photoError}</Text>
            <TextButton label="Ayarları aç" onPress={() => void Linking.openSettings()} />
          </View>
        ) : null}
      </View>

      <View style={styles.form}>
        <Field
          label="Bio"
          value={bio}
          onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
          placeholder="Ne üzerine çalışıyorsun, kimlerle tanışmak istersin?"
          multiline
          hint={`${bio.length}/${BIO_MAX}`}
        />
        <Field
          label="Instagram (isteğe bağlı)"
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="kullanici_adi"
        />
        <Field
          label="LinkedIn (isteğe bağlı)"
          value={linkedin}
          onChangeText={setLinkedin}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="linkedin.com/in/..."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  avatarWrap: { alignItems: 'center', gap: 10 },
  avatarShell: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: colors.white,
    ...shadows.card,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 58 },
  avatarEmpty: {
    width: '100%',
    height: '100%',
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSoft,
  },
  avatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  avatarHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
  },
  photoError: { alignItems: 'center' },
  errorText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  form: { gap: spacing.md },
  footer: { gap: 2 },
});
