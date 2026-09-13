# RASLASH yönetim paneli

Mekân onayı, yorum ve mesaj denetimi, uygulama içi bildirim kaydı yönetimi ve Google Places eşitlemesi için ayrı React/Vite uygulaması.

## Yerelde çalıştırma

```bash
cd admin-web
npm ci
cp .env.example .env
npm run dev
```

`.env` içine **üretim projesinin** `VITE_SUPABASE_URL` ve yayımlanabilir/anon anahtarını (`VITE_SUPABASE_ANON_KEY`) girin. `VITE_` önekli bütün değerler tarayıcı paketine girer: **service-role, secret key veya veritabanı parolası koymayın.** Google Places eşitlemesi kullanılacaksa yalnızca uygun şekilde kısıtlanmış bir tarayıcı anahtarı ekleyin.

Supabase değişkenleri yoksa **yalnızca yerel geliştirme sırasında** tarayıcıdaki demo verisi gösterilir. Üretim paketinde bu durumda giriş kapalıdır ve yapılandırma hatası görünür. Demo şifresi üretim hesabına erişim sağlamaz; demo ekranını gerçek moderasyon sonucu olarak kullanmayın.

## Canlı yetkilendirme

Yönetici kendi Supabase e-posta/şifresiyle giriş yapar. `profiles.is_admin = true` olmalıdır. Mesaj ve bildirim denetimi, sunucuda yetkiyi tekrar doğrulayan `admin_list_messages`, `admin_list_notifications` ve `admin_delete_notification` RPC'lerini kullanır. Bunlar `supabase/migrations/20260911211108_admin_messaging_controls.sql` migration'ında tanımlıdır; migration üretim veritabanına uygulanmadan bu ekranlar çalışmaz. İstemcideki giriş ekranı veya demo şifresi tek başına erişim kontrolü değildir.

Bildirim silme yalnızca uygulama içi veritabanı kaydını kaldırır. Önceden telefona teslim edilmiş sistem bildirimlerini uzaktan geri çekmez.

## Kontrol ve yayın

```bash
npm run lint
npm run build
```

Üretim paketi `dist/` klasörüne çıkar. `wrangler.jsonc` Cloudflare Workers statik asset yapılandırmasıdır; yayın için ayrıca yetkili Cloudflare oturumu ve üretim ortamı değişkenleri gerekir. Bu depoda yayın komutu otomatik çalıştırılmaz.

Şu anki sunucu sözleşmesinde mesajları görüntüleme ve tekil bildirim silme var; yönetim panelinden bildirim gönderme, mesaj silme, kullanıcı veya check-in yönetimi için ayrı, sunucuda admin yetkisi denetlenen uç noktalar gerekir. Tarayıcıya service-role anahtarı koyarak bu eksik yetenekleri açmayın.
