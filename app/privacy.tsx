import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/ui';
import { colors } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || 'info@protrom.com';

const sections = [
  {
    title: 'Topladığımız bilgiler',
    body: 'Hesap e-postası ve giriş sağlayıcısı; ad, yaş, meslek, biyografi, sosyal profil bağlantıları ve isteğe bağlı profil fotoğrafı; yalnızca izin verdiğinde konum; check-in, mesaj, puanlama ve gönderdiğin mekân bilgileri işlenebilir.',
  },
  {
    title: 'Bilgileri neden kullanıyoruz?',
    body: 'Hesabını ve profilini çalıştırmak, yakındaki mekânları göstermek, mesafeye dayalı check-in özelliğini sunmak, mekân sohbetlerini ve puanlamaları işletmek, güvenliği sağlamak ve destek taleplerini çözmek için kullanırız.',
  },
  {
    title: 'Konum ve fotoğraflar',
    body: 'Konum yalnızca uygulama kullanımdayken yakındaki mekânlar ve check-in uygunluğu için kullanılır. Fotoğraf erişimi yalnızca seçtiğin profil görselini yüklemek içindir. Bu izinleri cihaz ayarlarından geri alabilirsin.',
  },
  {
    title: 'Hizmet sağlayıcılar',
    body: 'Hesap, veritabanı ve dosya hizmetleri için Supabase; tercih ettiğinde Apple veya Google ile giriş; ücretli özellikler etkinleştirildiğinde abonelik yönetimi için RevenueCat kullanılabilir. Bu sağlayıcılar verileri kendi güvenlik ve gizlilik koşulları altında işler.',
  },
  {
    title: 'Paylaşım ve reklam',
    body: 'Kişisel verilerini satmayız. Hedefli reklam amacıyla üçüncü taraflarla paylaşmayız. Yalnızca hizmeti sunmak, yasal yükümlülükleri yerine getirmek ve güvenliği korumak için gerekli ölçüde aktarım yaparız.',
  },
  {
    title: 'Topluluk güvenliği',
    body: 'Sohbette paylaşılan içerikler topluluk güvenliği amacıyla otomatik kontrollerden geçirilebilir. Bir mesajı şikâyet ettiğinde mesaj, gönderen kullanıcı ve şikâyet bilgisi inceleme için kaydedilir. Engellediğin kullanıcıların mesajları ve aktif kullanıcı kartları sana gösterilmez.',
  },
  {
    title: 'Saklama ve hesap silme',
    body: 'Bilgileri hesabın aktif olduğu ve hizmet için gerekli olduğu sürece saklarız. Profil > Hesap > Hesabı sil adımlarından hesabını kalıcı olarak silebilirsin. Profilin, avatarın, mesajların, check-in kayıtların ve puanların silinir; ortak mekân kayıtları kişisel bilgilerinden arındırılabilir.',
  },
  {
    title: 'Hakların',
    body: 'Verilerine erişme, düzeltme ve silme talebinde bulunabilirsin. Profil bilgilerini uygulama içinden güncelleyebilir, cihaz izinlerini ayarlardan yönetebilirsin.',
  },
];

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Gizlilik Politikası</Text>
        <View style={{ width: 42 }} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>RASLASH Gizlilik Politikası</Text>
        <Text style={styles.updated}>Son güncelleme: 16 Ağustos 2026</Text>
        <Text style={styles.intro}>
          RASLASH, Protrom Yazılım ve Ticaret Anonim Şirketi tarafından sunulur. Bu metin,
          mobil uygulamada kişisel verilerin nasıl işlendiğini açıklar.
        </Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>İletişim</Text>
          <Text style={styles.body}>
            {`Gizlilik, topluluk güvenliği ve hesap silme talepleri için: ${SUPPORT_EMAIL}`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: colors.ink,
  },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 30,
    letterSpacing: -1,
    color: colors.ink,
    marginTop: spacing.md,
  },
  updated: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.muted },
  intro: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 7,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    color: colors.ink,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
});
