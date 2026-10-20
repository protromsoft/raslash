import { Image } from 'expo-image';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/** Full-screen view of one venue photo; `uri` null keeps it closed. */
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            accessible
            accessibilityLabel="Mekân fotoğrafı"
          />
        ) : null}
        <IconButton
          icon="close"
          tone="blur"
          onPress={onClose}
          accessibilityLabel="Fotoğrafı kapat"
          style={[styles.close, { top: insets.top + spacing.sm }]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.night, justifyContent: 'center' },
  image: { flex: 1 },
  close: { position: 'absolute', right: spacing.md },
});
