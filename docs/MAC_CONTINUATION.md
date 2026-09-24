# MSGSÜ Ders Programı — Mac Devam Handoff

Tarih: 25 Eylül 2026

Bu dosya, Windows makinedeki oturumdan sonra Mac'te sıfırdan yerel checkout oluşturarak aynı çalışmaya devam etmek içindir.

## 1. Güvenilir remote durum

Repository:

```
https://github.com/cemtheman/msgsud-bale-programi.git
```

Ana geliştirme branch'i:

```
feat/management-m20-placement-recovery
```

Oturum kapanırken `main` ve bu feature branch aynı commit ağacındadır. Production promotion yapılmıştır.

Son production-promoted remote checkpoint:

```
bb41cb535b4bdbf2b9a458d36b56e80d28c01eb0
docs: record M29 production promotion root cause
```

Bu handoff dokümantasyon commit'i eklendikten sonra branch HEAD daha ileri bir docs SHA olacaktır. Mac'te **hard-code edilmiş eski SHA'ya reset atma**; önce remote HEAD'i çek ve `AGENTS.md` içindeki en son checkpoint'i oku.

## 2. Mac'te repo oluşturma

Terminal:

```bash
cd ~
git clone https://github.com/cemtheman/msgsud-bale-programi.git
cd msgsud-bale-programi

git fetch origin
git switch feat/management-m20-placement-recovery
git pull --ff-only

git rev-parse HEAD
git status --short
```

Beklenti:

- branch: `feat/management-m20-placement-recovery`
- working tree: CLEAN
- HEAD: remote feature branch'in güncel HEAD'i

Ardından ilk okunacak dosyalar:

```bash
cat AGENTS.md
cat docs/MAC_CONTINUATION.md
```

## 3. Node bağımlılıkları

Repo `package-lock.json` içerir. Temiz kurulum:

```bash
npm ci
npm run build
```

Build PASS olmadan migration veya yeni implementation yapma.

Projede:
- Next.js 16.3.4
- React 19.2.8
- TypeScript 5
- Vitest 4

kullanılıyor.

Gerekirse test:

```bash
npm test
```

## 4. Supabase CLI bağlantısı

Supabase CLI global kurulmak zorunda değil; repo boyunca `npx supabase ...` kullanılabilir.

Yeni Mac'te login:

```bash
npx supabase login
```

Bağlı proje bilgisi local checkout ile gelmiyorsa:

```bash
npx supabase projects list
npx supabase link --project-ref <DOGRU_PROJECT_REF>
```

Project ref veya access token gibi sırları bu dosyaya/commit'e yazma.

Bağlandıktan sonra:

```bash
npx supabase migration list
```

25 Eylül oturum kapanışında remote DB, M29 dahil şu migration'a kadar uygulanmıştı:

```
20260925010000_management_m29_placement_resource_preview.sql
```

Dolayısıyla sabah yeni düzeltme **M29.1 olarak yeni timestamp'li migration** olmalı. Uygulanmış M29 dosyasını geçmişe dönük değiştirme.

## 5. Environment dosyaları

`.env*` dosyalarında gerçek servis anahtarları bulunabilir. Bunları sohbet/handoff dokümanına kopyalama.

Clone sonrası uygulama environment eksikse mevcut güvenli kaynaktan/Vercel project settings'ten yeniden oluştur. Secret değerleri Git history'ye ekleme.

## 6. Sabah çözülmesi gereken ilk blocker

Production M29 UI artık görünür ve yerleşmiş kartta:

- tüm aktif öğretmenler,
- tüm aktif ana salonlar,
- `Etkiyi hesapla`

akışı mevcut.

Ancak preview RPC şu hatayı veriyor:

```
column occupied.card_id does not exist
```

Kök neden:

```
supabase/migrations/20260925010000_management_m29_placement_resource_preview.sql
```

içinde teacher ve room conflict CTE'lerinde:

```sql
occupied.card_id as blocking_card_id
```

yazılmış. `occupied` bir `public.schedule_cards` alias'ıdır ve PK alanı `id`dir.

Doğru ifade:

```sql
occupied.id as blocking_card_id
```

### Doğru çalışma planı

Yeni migration örneği:

```
supabase/migrations/<NEW_TIMESTAMP>_management_m29_1_resource_preview_card_id_fix.sql
```

Bu migration `public.management_preview_placement_resource_change(uuid[], text, uuid)` fonksiyonunu M29'daki gövdesiyle yeniden oluşturmalı; yalnız iki `occupied.card_id` referansı `occupied.id` olmalı. Fonksiyon grant/comment sözleşmesini koru.

Sonra:

```bash
npm run build
npx supabase migration list
npx supabase db push --dry-run
```

Dry-run yalnız yeni M29.1 migration'ı gösteriyorsa:

```bash
npx supabase db push
```

## 7. M29.1 browser acceptance

Production'da sırayla:

1. Program > yerleşmiş bir kart seç.
2. `Öğretmen değiştir` > başka ACTIVE öğretmen seç > `Etkiyi hesapla`.
3. Çakışmasızsa yeşil safe preview ve `Değişikliği uygula`.
4. Gerçek conflict yaratacak öğretmen seç; blocker ders görünmeli ve apply kapalı kalmalı.
5. V. Kondisyon gibi salonu Belirsiz bir kart seç.
6. `Salon değiştir` > ACTIVE salon seç > `Etkiyi hesapla`.
7. Güvenliyse apply.
8. Kart aynı gün/saatte kalmalı; yalnız resource değişmeli.
9. Birleşik `5A + 5B` kartta bundle atomik davranışını kontrol et.
10. Geri Al / Yinele çalışmalı.

## 8. Çalışma yöntemi

Bu repo için kalıcı sözleşme:

- Kullanıcı patch uygulamaz.
- Asistan GitHub üzerinden dosyayı inceler/değiştirir/commit/push eder.
- Remote mutation öncesi branch HEAD tekrar doğrulanır.
- Force push yapılmaz.
- DB davranışı değişiyorsa yeni migration yazılır; uygulanmış migration geriye dönük değiştirilmez.
- Önce focused diagnostic, sonra minimum düzeltme.
- Build PASS olmadan DB apply yapılmaz.
- Migration için önce `migration list`, sonra `db push --dry-run`, yalnız beklenen migration varsa apply.
- Oturum sonunda `AGENTS.md` güncellenir.
- Yeni oturumda proje tarihçesi baştan keşfedilmez; önce `AGENTS.md` okunur.

## 9. Son doğrulanmış kullanıcı durumları

- Grouped common card restore problemi çözülmüş durumda.
- Provisional NULL teacher candidate semantiği M26.8 ile düzeltilmiş durumda.
- Kaynaklar ekranında öğretmen/salon lifecycle M28 ile remote'da mevcut.
- Orkestra/Doğaçlama özel öğretmen kuralı ve legacy UI cleanup uygulanmış durumda.
- M29 migration remote'a uygulanmış durumda.
- M29 frontend production'a promote edilmiş durumda.
- Açık blocker yalnız M29 preview SQL'deki `occupied.card_id` kolon hatasıdır.

Bu blocker çözülüp acceptance tamamlandıktan sonra yönetim iş planında kaldığımız aşamadan devam et.
