import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from './Motion';
import { BackButton, Button, Txt } from './ui';
import { colors } from '@/theme/colors';

/**
 * Screen title row. With `leading` (an avatar) it becomes a compact
 * conversation header: smaller title plus a one-line subtitle, tappable.
 */
export function SocialHeader({ title, subtitle, leading, onTitlePress, right }: {
  title: string; subtitle?: string; leading?: React.ReactNode; onTitlePress?: () => void; right?: React.ReactNode;
}) {
  const compact = !!leading;
  const copy = <View style={socialStyles.headerCopy}>
    {/* One line beside the back button; long titles shrink instead of wrapping. */}
    <Txt variant={compact ? 'h3' : 'h1'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Txt>
    {subtitle ? <Text style={socialStyles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
  </View>;
  // Opened from a notification or link, there may be nothing to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  return <View style={[socialStyles.header, compact && socialStyles.headerCompact]}><BackButton onPress={back} />
    {onTitlePress ? <PressableScale style={socialStyles.headerTitle} onPress={onTitlePress} scaleTo={0.98}
      accessibilityRole="button" accessibilityLabel={`${title} profilini gör`}>{leading}{copy}</PressableScale>
      : <View style={socialStyles.headerTitle}>{leading}{copy}</View>}
    {right}</View>;
}
export function SocialNotice({ text, retry }: { text: string; retry?: () => void }) {
  return <View style={socialStyles.notice}><Text style={socialStyles.body}>{text}</Text>
    {retry ? <Button label="Tekrar dene" tone="outline" onPress={retry} /> : null}</View>;
}
export const socialStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  headerCompact: { marginBottom: 8 },
  headerTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerSubtitle: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.green, marginTop: 1 },
  subtitle: { fontFamily: 'DMSans_700Bold', fontSize: 18, color: colors.ink },
  body: { fontFamily: 'DMSans_400Regular', fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  muted: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 20, gap: 12, marginBottom: 16 },
  notice: { paddingVertical: 14, gap: 12 },
  input: { minHeight: 48, maxHeight: 130, padding: 14, borderRadius: 20, backgroundColor: colors.white,
    color: colors.ink, fontFamily: 'DMSans_400Regular', fontSize: 16, textAlignVertical: 'top' },
});
