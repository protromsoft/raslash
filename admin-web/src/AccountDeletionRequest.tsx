const supportEmail =
  (import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL as string | undefined)?.trim() || 'info@protrom.com';

const deletionSubject = 'RASLASH hesap silme talebi';
const deletionBody = [
  'Merhaba,',
  '',
  'RASLASH hesabımın ve hesapla ilişkili kişisel verilerimin kalıcı olarak silinmesini istiyorum.',
  '',
  'Hesap e-posta adresi:',
  '',
  'Not: Bu e-postaya parola, doğrulama kodu, kimlik belgesi, ödeme bilgisi veya konum bilgisi eklemedim.',
].join('\n');
const deletionMailto = `mailto:${supportEmail}?subject=${encodeURIComponent(
  deletionSubject,
)}&body=${encodeURIComponent(deletionBody)}`;

export default function AccountDeletionRequest() {
  return (
    <main className="privacyPage">
      <div className="privacyBrand">raslash</div>
      <article className="privacyDocument">
        <p className="privacyEyebrow">HESAP VE VERİ</p>
        <h1>RASLASH hesabını sil</h1>
        <p className="privacyUpdated">Son güncelleme: 12 Eylül 2026</p>
        <p className="privacyLead">
          RASLASH hesabını ve hesapla ilişkili kişisel verileri uygulama içinden silebilir
          veya uygulamaya erişemiyorsan aşağıdaki e-posta bağlantısıyla silme talebi
          gönderebilirsin.
        </p>

        <section>
          <h2>Uygulama içinden silme</h2>
          <p>
            Uygulamada <strong>Profil → Hesap → Hesabı sil</strong> yolunu izle ve ekrandaki
            kalıcı silme onayını tamamla.
          </p>
        </section>

        <section id="request-by-email">
          <h2>Uygulamaya erişemiyorsan</h2>
          <p>
            Mümkünse hesabı açarken kullandığın e-posta adresinden bize ulaş. Başka bir
            adresten yazıyorsan silinmesini istediğin RASLASH hesabının e-posta adresini
            belirt. Hesap sahipliğini güvenli şekilde doğruladıktan sonra talebin hakkında
            aynı e-posta üzerinden bilgi veririz.
          </p>
          <div className="privacyActions">
            <a className="privacyPrimaryLink" href={deletionMailto}>
              Hesap silme e-postası oluştur
            </a>
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </div>
        </section>

        <section>
          <h2>Neler silinir?</h2>
          <p>Hesap silme işlemi şunları kapsar:</p>
          <ul className="privacyList">
            <li>Giriş hesabı ve profil bilgileri</li>
            <li>Profil fotoğrafı ve kayıtlı bildirim cihazı bilgileri</li>
            <li>Mesajlar, check-in kayıtları ve puanlamalar</li>
          </ul>
          <p>
            Topluluğa eklediğin ortak mekân kayıtları kişisel bilgilerinden arındırılabilir.
            Yasal yükümlülük, güvenlik veya dolandırıcılığı önleme amacıyla sınırlı bir kaydı
            tutmamız gerekirse bunu geçerli mevzuat çerçevesinde saklarız.
          </p>
        </section>

        <section>
          <h2>Aboneliğini ayrıca yönet</h2>
          <p>
            RASLASH hesabını silmek App Store veya Google Play aboneliğini otomatik olarak
            iptal etmez. Aktif aboneliğin varsa hesap silmeden önce mağazanın abonelikler
            bölümünden iptal et.
          </p>
        </section>

        <section>
          <h2>Güvenliğin için</h2>
          <p>
            E-postana parola, tek kullanımlık doğrulama kodu, kimlik belgesi, ödeme bilgisi
            veya hassas konum bilgisi ekleme. RASLASH destek ekibi bu bilgileri talep etmez.
          </p>
        </section>

        <section>
          <h2>Gizlilik</h2>
          <p>
            Verilerin nasıl işlendiğine ilişkin ayrıntıları{' '}
            <a href="/privacy">RASLASH Gizlilik Politikası</a> sayfasında bulabilirsin.
          </p>
        </section>
      </article>
    </main>
  );
}
