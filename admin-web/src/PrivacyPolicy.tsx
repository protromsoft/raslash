const supportEmail =
  (import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL as string | undefined)?.trim() || 'info@protrom.com';

const sections = [
  [
    'Topladığımız bilgiler',
    'Hesap e-postası ve giriş sağlayıcısı; ad, yaş, meslek, biyografi, sosyal profil bağlantıları ve isteğe bağlı profil fotoğrafı; yalnızca izin verdiğinde konum; check-in, mesaj, puanlama ve gönderdiğin mekân bilgileri işlenebilir.',
  ],
  [
    'Bilgileri neden kullanıyoruz?',
    'Hesabını ve profilini çalıştırmak, yakındaki mekânları göstermek, mesafeye dayalı check-in özelliğini sunmak, mekân sohbetlerini ve puanlamaları işletmek, güvenliği sağlamak ve destek taleplerini çözmek için kullanırız.',
  ],
  [
    'Konum ve fotoğraflar',
    'Konum yalnızca uygulama kullanımdayken yakındaki mekânlar ve check-in uygunluğu için kullanılır. Fotoğraf erişimi yalnızca seçtiğin profil görselini yüklemek içindir. İzinleri cihaz ayarlarından geri alabilirsin.',
  ],
  [
    'Hizmet sağlayıcılar',
    'Hesap, veritabanı ve dosya hizmetleri için Supabase; tercih ettiğinde Apple veya Google ile giriş; ücretli özellikler etkinleştirildiğinde abonelik yönetimi için RevenueCat kullanılabilir. Bu sağlayıcılar verileri kendi güvenlik ve gizlilik koşulları altında işler.',
  ],
  [
    'Paylaşım ve reklam',
    'Kişisel verilerini satmayız. Hedefli reklam amacıyla üçüncü taraflarla paylaşmayız. Yalnızca hizmeti sunmak, yasal yükümlülükleri yerine getirmek ve güvenliği korumak için gerekli ölçüde aktarım yaparız.',
  ],
  [
    'Topluluk güvenliği',
    'Sohbette paylaşılan içerikler topluluk güvenliği amacıyla otomatik kontrollerden geçirilebilir. Bir mesajı şikâyet ettiğinde mesaj, gönderen kullanıcı ve şikâyet bilgisi inceleme için kaydedilir. Engellediğin kullanıcıların mesajları ve aktif kullanıcı kartları sana gösterilmez.',
  ],
  [
    'Saklama ve hesap silme',
    'Bilgileri hesabın aktif olduğu ve hizmet için gerekli olduğu sürece saklarız. Uygulamada Profil > Hesap > Hesabı sil adımlarından hesabını kalıcı olarak silebilirsin. Profilin, avatarın, mesajların, check-in kayıtların ve puanların silinir; ortak mekân kayıtları kişisel bilgilerinden arındırılabilir.',
  ],
  [
    'Hakların',
    'Verilerine erişme, düzeltme ve silme talebinde bulunabilirsin. Profil bilgilerini uygulama içinden güncelleyebilir, cihaz izinlerini ayarlardan yönetebilirsin.',
  ],
] as const;

export default function PrivacyPolicy() {
  return (
    <main className="privacyPage">
      <div className="privacyBrand">raslash</div>
      <article className="privacyDocument">
        <p className="privacyEyebrow">GİZLİLİK</p>
        <h1>RASLASH Gizlilik Politikası</h1>
        <p className="privacyUpdated">Son güncelleme: 26 Ağustos 2026</p>
        <p className="privacyLead">
          RASLASH, Protrom Yazılım ve Ticaret Anonim Şirketi tarafından sunulur. Bu metin,
          mobil uygulamada kişisel verilerin nasıl işlendiğini açıklar.
        </p>

        {sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}

        <section>
          <h2>İletişim</h2>
          <p>
            {`Gizlilik, topluluk güvenliği ve hesap silme talepleri için: ${supportEmail}`}
          </p>
          <p>
            Çocuk güvenliği standartlarımızı{' '}
            <a href="/child-safety">Çocuk Güvenliği Standartları</a> sayfasında bulabilirsin.
          </p>
        </section>
      </article>
    </main>
  );
}
