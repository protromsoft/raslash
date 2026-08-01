import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Appear } from '@/components/Motion';
import { HeaderBar, Screen } from '@/components/Screen';
import { Button, Card, Chip, Field, ScreenTitle, TextButton } from '@/components/ui';
import { usePlaces } from '@/context/PlacesContext';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

const CATEGORIES = ['Cafe', 'Cowork', 'Kütüphane', 'Otel lobisi', 'Restoran'];

export default function AddPlaceScreen() {
  const { submitPlace } = usePlaces();
  const [name, setName] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [category, setCategory] = useState('Cafe');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await submitPlace({ name, city, category });
    setSaving(false);
    setSent(true);
  };

  if (sent) {
    return (
      <Screen sheet contentStyle={styles.center}>
        <Appear style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="paper-plane" size={26} color={colors.white} />
          </View>
          <ScreenTitle
            title="Onaya gönderildi"
            subtitle={`"${name.trim()}" admin onayından sonra haritada görünecek. Sonucu bildirimlerden takip edebilirsin.`}
          />
          <Button label="Tamam" onPress={() => router.back()} />
        </Appear>
      </Screen>
    );
  }

  return (
    <Screen sheet scroll keyboard contentStyle={styles.content}>
      <HeaderBar onBack={() => router.back()} />

      <ScreenTitle
        title="Mekan öner"
        subtitle="Çalışmaya uygun bir yer biliyorsan paylaş; onaylandığında herkes görebilecek."
      />

      <Appear delay={60} style={styles.form}>
        <Field
          label="Mekan adı"
          value={name}
          onChangeText={setName}
          placeholder="Örn. Kronotrop Bebek"
          autoCapitalize="words"
        />
        <Field label="Şehir" value={city} onChangeText={setCity} autoCapitalize="words" />

        <View style={styles.block}>
          <Text style={styles.label}>Kategori</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        </View>

        <Card style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
          <Text style={styles.noteText}>
            Gönderdiğin mekan hemen yayınlanmaz. Ekip kontrol ettikten sonra listeye eklenir.
          </Text>
        </Card>
      </Appear>

      <View style={styles.footer}>
        <Button
          label="Onaya gönder"
          disabled={!name.trim()}
          loading={saving}
          onPress={() => void submit()}
        />
        <TextButton label="Vazgeç" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  doneWrap: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: spacing.md },
  block: { gap: spacing.sm },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noteText: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  footer: { marginTop: 'auto', paddingTop: spacing.sm },
});
