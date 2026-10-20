import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { avatarAppearance } from '@/lib/avatarAppearance';
import { colors } from '@/theme/colors';

export function Avatar({ uri, name, size = 40, ring, style }: {
  uri?: string;
  name?: string;
  size?: number;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const appearance = avatarAppearance(name, uri);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const source = appearance.uri;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name?.trim() ? `${name.trim()} profil görseli` : 'Profil görseli'}
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        ring && styles.ring,
        style,
      ]}
    >
      <View style={[styles.face, { borderRadius: size / 2, backgroundColor: appearance.backgroundColor }]}>
        <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{appearance.initial}</Text>
        {source && source !== failedUri ? (
          <Image
            key={source}
            source={{ uri: source }}
            recyclingKey={source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            onError={() => setFailedUri(source)}
          />
        ) : null}
      </View>
    </View>
  );
}

export function AvatarStack({ people, size = 24, max = 3 }: {
  people: { id?: string; avatarUrl?: string; firstName?: string }[];
  size?: number;
  max?: number;
}) {
  return (
    <View style={styles.stack}>
      {people.slice(0, max).map((person, index) => (
        <Avatar
          key={person.id ?? `${person.firstName}-${index}`}
          uri={person.avatarUrl}
          name={person.firstName}
          size={size}
          ring
          style={index > 0 ? { marginLeft: -size * 0.28 } : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: colors.white, backgroundColor: colors.white },
  face: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: 'DMSans_700Bold', color: colors.white },
  stack: { flexDirection: 'row', alignItems: 'center' },
});
