import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Appear, PressableScale } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Field, Txt } from '@/components/ui';
import { useApp, type Profile } from '@/context/AppContext';
import { colors, shadows } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

const BIO_MAX = 160;

export default function ProfileEditScreen() {
  const { profile, updateProfile } = useApp();
  const [draft, setDraft] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const edited = useRef(false);

  // A late profile load (or a Supabase auth refresh) shouldn't wipe out fields
  // the user has already started typing.
  useEffect(() => {
    if (!edited.current) setDraft(profile);
  }, [profile]);

  const set = (patch: Partial<Profile>) => {
    edited.current = true;
    setDraft((p) => ({ ...p, ...patch }));
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Fotoğraf erişimi için izin gerekiyor.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      set({ avatarUrl: result.assets[0].uri });
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await updateProfile(draft);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt sırasında bir sorun oldu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      sheet
      scroll
      keyboard
      contentStyle={styles.content}
      footer={<Button label="Kaydet" loading={saving} onPress={() => void save()} />}
    >
      <HeaderBar onBack={() => router.back()} />

      <Appear>
        <Txt variant="h1">Profili düzenle</Txt>
      </Appear>

      <Appear delay={50} style={styles.avatarWrap}>
        <PressableScale onPress={() => void pickAvatar()} scaleTo={0.95}>
          <View style={styles.avatarShell}>
            {draft.avatarUrl ? (
              <Image source={{ uri: draft.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarEmpty}>
                <Ionicons name="person" size={32} color={colors.muted} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </View>
        </PressableScale>
      </Appear>

      <Appear delay={90} style={styles.form}>
        <Field label="Ad" value={draft.firstName} onChangeText={(firstName) => set({ firstName })} />
        <Field label="Soyad" value={draft.lastName} onChangeText={(lastName) => set({ lastName })} />
        <Field
          label="Meslek"
          value={draft.profession}
          onChangeText={(profession) => set({ profession })}
        />
        <Field
          label="Yaş"
          value={draft.age}
          keyboardType="number-pad"
          onChangeText={(age) => set({ age: age.replace(/[^0-9]/g, '').slice(0, 2) })}
        />
        <Field
          label="Bio"
          value={draft.bio ?? ''}
          onChangeText={(bio) => set({ bio: bio.slice(0, BIO_MAX) })}
          placeholder="Ne üzerine çalışıyorsun?"
          multiline
          hint={`${(draft.bio ?? '').length}/${BIO_MAX}`}
        />
        <Field
          label="Instagram"
          value={draft.instagram ?? ''}
          onChangeText={(instagram) => set({ instagram })}
          autoCapitalize="none"
          placeholder="kullaniciadi"
        />
        <Field
          label="LinkedIn"
          value={draft.linkedin ?? ''}
          onChangeText={(linkedin) => set({ linkedin })}
          autoCapitalize="none"
          placeholder="linkedin.com/in/..."
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Appear>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  avatarWrap: { alignItems: 'center' },
  avatarShell: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.white,
    ...shadows.card,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 54 },
  avatarEmpty: {
    width: '100%',
    height: '100%',
    borderRadius: 54,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  form: { gap: spacing.md },
  error: { fontFamily: 'DMSans_500Medium', fontSize: 13.5, color: colors.danger },
});
