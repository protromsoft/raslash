import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from '@/components/Motion';
import { colors, shadows } from '@/theme/colors';
import { radii } from '@/theme/spacing';

/** Shared message composer: growing input + round send button on one baseline. */
export function ChatComposer({ value, onChangeText, onSend, placeholder, sending = false, disabled = false,
  inputLabel, style }: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  sending?: boolean;
  /** Extra reason the send button is unavailable (an empty draft is handled here). */
  disabled?: boolean;
  inputLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const canSend = !sending && !disabled && value.trim().length > 0;
  const [inputHeight, setInputHeight] = useState(46);
  useEffect(() => { if (!value) setInputHeight(46); }, [value]);
  return (
    <View style={[styles.composer, style]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedSoft}
        accessibilityLabel={inputLabel}
        style={[styles.input, { height: inputHeight }]}
        multiline
        maxLength={500}
        editable={!sending}
        onContentSizeChange={({ nativeEvent }) => {
          const height = nativeEvent.contentSize.height;
          if (Number.isFinite(height)) setInputHeight(Math.min(120, Math.max(46, Math.ceil(height))));
        }}
        scrollEnabled
        accessibilityHint="En fazla 500 karakter. Uzun mesajı yazı alanında kaydırabilirsin."
      />
      <PressableScale
        style={[styles.send, !canSend && !sending && styles.sendDisabled]}
        disabled={!canSend}
        disabledOpacity={1}
        onPress={onSend}
        accessibilityRole="button"
        accessibilityLabel="Gönder"
        accessibilityState={{ disabled: !canSend, busy: sending }}
      >
        {sending ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Ionicons name="arrow-up" size={19} color={canSend ? colors.white : colors.muted} />
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: colors.ink,
    ...shadows.soft,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  sendDisabled: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.lineStrong, shadowOpacity: 0, elevation: 0 },
});
