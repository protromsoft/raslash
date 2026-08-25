# RASLASH — App Store Connect taslağı

## Ürün sayfası (Türkçe)

- Ad: `RASLASH`
- Alt başlık: `Çalış, keşfet, sosyalleş`
- Birincil kategori: `Social Networking`
- İkincil kategori: `Productivity`
- Anahtar kelimeler: `coworking,kafe,çalışma,wifi,priz,check-in,sohbet,networking,uzaktan çalışma`
- Destek URL: `https://raslash-privacy.expo.app/privacy`
- Gizlilik Politikası URL: `https://raslash-privacy.expo.app/privacy`
- Copyright: `2026 Protrom Yazılım ve Ticaret Anonim Şirketi`

### Promotional text

Çalışmaya uygun mekânları keşfet, gerçek kullanıcı puanlarını gör, check-in yap ve aynı mekândaki insanlarla tanış.

### Description

RASLASH, çalışmak için doğru mekânı bulmana ve aynı ortamda çalışan insanlarla tanışmana yardımcı olur.

Yakındaki çalışma dostu kafe ve mekânları haritada keşfet. Wi-Fi, priz ve rahatlık puanlarını gerçek kullanıcı deneyimlerinden incele. Mekâna vardığında check-in yap; o anda aynı yerde bulunan kişilerle sohbete katıl.

RASLASH ile:

• Yakındaki çalışma mekânlarını haritada gör
• Wi-Fi, priz ve rahatlık puanlarını karşılaştır
• Mesafeye dayalı güvenli check-in yap
• Aynı mekândaki kişilerle canlı sohbete katıl
• Mekândan ayrıldıktan sonra deneyimini puanla
• Yeni mekân öner ve topluluğa katkıda bulun
• Profilini ve hesabını uygulama içinden yönet veya kalıcı olarak sil

Konum yalnızca izin verdiğinde yakındaki mekânları, check-in uygunluğunu ve anonimleştirilmiş aktif kullanıcı sayısını sunmak için kullanılır. Uygulama hedefli reklam içermez ve kişisel verileri satmaz.

Kullanım Koşulları (Apple Standard EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

Gizlilik Politikası: https://raslash-privacy.expo.app/privacy

## App Review notları

- App Review e-posta hesabı: `appreview@protrom.com`
- Parola yalnızca App Store Connect'in inceleme alanına girilir; kaynak kodda veya
  bu dosyada tutulmaz.
- Ücretli abonelik/paywall bu sürümde devre dışıdır; uygulama içi satın alma sunulmaz.
- App Review için sağlanan e-posta/parola hesabında sunucu taraflı `app_review_access`
  yetkisi bulunur. Bu yetki yalnızca inceleme hesabında konum kapısını atlayarak
  check-in ve sohbetin test edilmesini sağlar; normal kullanıcıların 150 metre
  yakınlık kontrolü değişmez.
- Konum izni reddedilirse katalog incelenebilir; mesafeye dayalı check-in özelliği kullanılamaz.
- Sohbet yalnızca aynı mekânda aktif check-in'i bulunan kullanıcılara açıktır.
- Bir sohbet mesajına basılı tutarak mesaj şikâyet edilebilir veya gönderen kullanıcı engellenebilir.
- Hesap silme: `Profil > Hesap > Hesabı sil`.

## App Privacy cevapları

Takip: `Hayır`

Kullanıcıya bağlı, yalnızca uygulama işlevselliği/güvenlik amaçlı toplanan veriler:

- Contact Info: Email Address, Name
- Location: Precise Location
- User Content: Photos or Videos, Other User Content
- Identifiers: User ID
- Usage Data: Product Interaction
- Other Data: yaş, meslek, cinsiyet, biyografi ve isteğe bağlı sosyal profil bağlantıları

Toplanmayanlar:

- Advertising Data
- Browsing History
- Search History
- Diagnostics / crash analytics
- Payment Info veya Purchases (paywall kapalı olduğu sürece)

## Ekran görüntüleri

- iPhone 6.9 inç: 1–10 adet; tercih edilen dikey ölçülerden biri `1290×2796`, `1320×2868` veya `1260×2736`.
- Saydamlık/alpha olmamalı.
- Önerilen sıra: Harita → Mekân detayı → Check-in/sohbet → Puanlama → Profil.

## Review öncesi doğrulama

- Yeni opak 1024×1024 ikon içeren iOS `1.0.0 (4)` production build'i Apple'a
  yüklendi; App Store sürüm ekranında bu build seçilmeli.
- Privacy/support sitesi herkese açık HTTPS URL'de yayınlandı ve doğrulandı.
- Supabase chat moderation migration'ı production'a uygulandı; raporlama ve
  engelleme akışı yeni build üzerinde iki gerçek kullanıcıyla son kez test edilmeli.
- App Review hesabı Supabase'de oluşturuldu, e-postası doğrulandı, onboarding'i
  tamamlandı ve yalnızca bu hesaba `app_review_access` yetkisi verildi.
- App Store Connect yaş sınırı beyanı kullanıcı üretimli içerik, mesajlaşma ve
  hafif/kullanıcı kaynaklı uygunsuz dil ihtimaliyle doğru biçimde senkronlandı.
