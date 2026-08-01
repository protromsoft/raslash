import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

type Kind = 'light' | 'medium' | 'success' | 'select';

/** Fire-and-forget haptic feedback; silently no-ops on web and unsupported devices. */
export function haptic(kind: Kind = 'light') {
  if (Platform.OS === 'web') return;
  const run = async () => {
    switch (kind) {
      case 'select':
        return Haptics.selectionAsync();
      case 'medium':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'success':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      default:
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };
  void run().catch(() => undefined);
}
