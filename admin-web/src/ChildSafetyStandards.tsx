const childSafetyEmail =
  (import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL as string | undefined)?.trim() || 'info@protrom.com';

const standards = [
  [
    'Sıfır tolerans',
    'RASLASH; çocukların cinsel istismarı, sömürülmesi veya cinselleştirilmesi dahil olmak üzere çocuklara zarar veren hiçbir içerik ya da davranışa izin vermez. Çocukların cinsel istismarı niteliğindeki materyaller (CSAM) kesinlikle yasaktır.',
  ],
  [
    'Bildirim ve engelleme',
    'Kullanıcılar, uygulamadaki sohbet mesajlarını uygulama içinden şikâyet edebilir ve ilgili kullanıcıyı engelleyebilir. Çocuk güvenliğiyle ilgili acil bir endişe ayrıca aşağıdaki iletişim adresine gönderilebilir.',
  ],
  [
    'İnceleme ve yaptırım',
    'Şikâyet edilen içerik ve hesaplar incelenir. Bu standartları ihlal eden içerikler kaldırılabilir; ilgili hesaplar kısıtlanabilir veya kalıcı olarak kapatılabilir. Gerekli durumlarda ilgili kayıtlar, yürürlükteki hukuka uygun biçimde yetkili makamlarla paylaşılır.',
  ],
  [
    'Yasal uyum ve bildirim',
    'RASLASH, çocuk güvenliğiyle ilgili yürürlükteki mevzuata uyar. CSAM veya çocukların cinsel istismarı ve sömürülmesine ilişkin doğrulanmış vakalar, yasal yükümlülükler doğrultusunda ilgili ulusal veya bölgesel makamlara bildirilir.',
  ],
] as const;

export default function ChildSafetyStandards() {
  return (
    <main className="privacyPage">
      <div className="privacyBrand">raslash</div>
      <article className="privacyDocument">
        <p className="privacyEyebrow">GÜVENLİK</p>
        <h1>RASLASH Çocuk Güvenliği Standartları</h1>
        <p className="privacyUpdated">Son güncelleme: 26 Ağustos 2026</p>
        <p className="privacyLead">
          RASLASH yalnızca 18 yaş ve üzerindeki kullanıcılar için tasarlanmıştır. Buna rağmen,
          platformda çocukların güvenliğini korumaya yönelik aşağıdaki standartlar her zaman
          geçerlidir.
        </p>

        {standards.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}

        <section>
          <h2>Çocuk güvenliği iletişim noktası</h2>
          <p>{`Çocuk güvenliği ve CSAM/CSAE uyumuyla ilgili bildirimler için: ${childSafetyEmail}`}</p>
        </section>
      </article>
    </main>
  );
}
