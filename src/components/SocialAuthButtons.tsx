import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { signInWithApple, signInWithGoogle } from '@/lib/socialAuth';
import { colors } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

export function SocialAuthButtons({
  mode,
  disabled,
  onSuccess,
}: {
  mode: 'login' | 'signup';
  disabled?: boolean;
  onSuccess: () => void;
}) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const run = async (provider: 'apple' | 'google') => {
    if (disabled || activeProvider) return;
    setActiveProvider(provider);
    setError('');
    const result =
      provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
    setActiveProvider(null);
    if (result.ok) {
      onSuccess();
      return;
    }
    if (!result.cancelled) setError(result.message);
  };

  return (
    <View style={styles.wrap}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'signup'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.md}
          style={[styles.apple, (disabled || activeProvider) && styles.disabled]}
          onPress={() => void run('apple')}
        />
      ) : null}
      <Button
        label={mode === 'signup' ? 'Google ile kaydol' : 'Google ile devam et'}
        icon="logo-google"
        tone="light"
        loading={activeProvider === 'google'}
        disabled={disabled || activeProvider !== null}
        onPress={() => void run('google')}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.divider} accessibilityElementsHidden>
        <View style={styles.line} />
        <Text style={styles.dividerText}>veya e-posta ile</Text>
        <View style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  apple: { width: '100%', height: 52 },
  disabled: { opacity: 0.45 },
  error: {
    fontFamily: 'DMSans_500Medium',
    color: colors.danger,
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  dividerText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.muted,
  },
});
