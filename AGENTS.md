# MSGSÜ Ders Programı — Çalışma Kaydı ve Oturum Checkpoint'i

> Bu dosya yönetim modülü için kalıcı çalışma hafızasıdır.
> Yeni bir oturumda kod değiştirmeden önce bu dosyanın tamamı okunmalıdır.
> Oturum sonunda yapılan işler, kararlar, test sonucu, migration durumu ve yeni checkpoint SHA'ları bu dosyaya eklenmelidir.
> Amaç proje geçmişini her oturumda yeniden keşfetmemek ve kullanıcının çalışma yöntemimizi tekrar tekrar hatırlatmak zorunda kalmamasıdır.

## 1. Güncel çalışma noktası

| Alan | Değer |
|---|---|
| Repository | `cemtheman/msgsud-bale-programi` |
| Local Windows checkout | `C:\Users\chodo\msgsud-bale-programi` |
| Aktif branch | `main` |
| Son doğrulanmış implementation checkpoint | `41275317ff43226c576b426b5ed310c08de104bc` |
| Implementation commit | `brand: align help center with Partisyon` |
| Production/documentation HEAD (28 Eylül kapanışı öncesi) | `3cab04b5d23dac767724f922d105988760503ae8` |
| Son kullanıcı kabulü | M31 UX/help/tour/terminoloji ve Partisyon marka katmanı browser'da kabul edildi |
| Sıradaki iş paketi | M32.3.2 — teacher policy editor migration/build doğrulaması; ardından kalan 16 UNSPECIFIED sınıflandırması ve candidate enforcement |
| Stack | Next.js 16.3.4, React 19, TypeScript, Vitest, Supabase |
| Build | `npm.cmd run build` → `next build --webpack` |
| Aktif dönem | 2026–2027 / 1. dönem |

Not: Bu dosyanın kendisini ekleyen documentation commit, yukarıdaki implementation SHA'nın yalnızca dokümantasyon çocuğudur. Yeni oturumda branch HEAD ayrıca `git rev-parse HEAD` ile doğrulanmalıdır.

## 2. Çalışma yöntemi — değişmez sözleşme

Kullanıcı patch uygulamaz. Kod değişikliği gerekiyorsa asistan GitHub üzerinden ilgili dosyaları inceler, değişikliği yapar, commit eder ve branch'e push eder. Kullanıcıya normal akışta yalnızca `git pull --ff-only`, gerekirse build/test ve Supabase migration komutları verilir.

Remote mutation öncesinde branch HEAD mutlaka tekrar okunur. Beklenen SHA değişmişse eski HEAD üzerine körlemesine commit atılmaz; önce yeni durum incelenir. Force push yapılmaz. Değişiklikler küçük, tek amaçlı ve geri alınabilir commitler halinde tutulur.

Veritabanı davranışı değişmiyorsa migration yazılmaz. Migration gerekiyorsa yeni timestamp'li migration oluşturulur; daha önce uygulanmış migration dosyaları geriye dönük düzenlenmez. Kullanıcıya önce `npx.cmd supabase migration list`, sonra `npx.cmd supabase db push --dry-run`, yalnızca beklenen migration görünüyorsa `npx.cmd supabase db push` akışı verilir.

Sorun teşhisinde ekran görüntüsü/video ve gerçek runtime davranışı kaynak koddaki varsayımlardan önce gelir. Görselde bir şeyi “browser ghost”, “cache”, “gerçek conflict” vb. diye ilan etmeden önce kanıt aranır. Spekülatif SQL migration eklemekten kaçınılır; reason code veya gerçek blocker gerekirse önce read-only diagnostic eklenir.

Yanıt dili Türkçedir. Komutlar Windows PowerShell uyumlu verilir. Kullanıcı teknik olarak yetkindir; gereksiz temel anlatım yapılmaz.

## 3. Yeni oturum başlangıç protokolü

Yeni oturumda ilk iş bu dosya okunur. Ardından aşağıdaki durum doğrulanır:

```powershell
cd C:\Users\chodo\msgsud-bale-programi
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD
git status --short
```

Working tree temiz değilse değişikliklerin kaynağı anlaşılmadan restore/reset yapılmaz. Branch HEAD bu dosyadaki son implementation checkpoint'ten ilerideyse `git log --oneline --decorate -n 20` ile yeni commitler okunur ve dosya güncellenir. Eski proje tarihçesi baştan keşfedilmez.

## 4. Ürün ve UI kuralları

| Konu | Kural |
|---|---|
| Ortak/kültür dersleri | Sarı, `📚 Ortak` |
| Bale dersleri | Mavi, `🩰 Bale` |
| Müzik dersleri | Mor, `🎶 Müzik` |
| Tümü görünümü | Her sınıf seviyesi kategori alt satırlarıyla gruplanır |
| Ortak ders görseli | Aynı paralel ortak dersler `5A + 5B` gibi tek kart görünür |
| Veri modeli | Görsel birleşme alttaki ayrı kart ID'lerini yok etmez |
| Atomic davranış | Görsel birleşik kart move/place/remove/undo/redo sırasında tek kullanıcı nesnesi gibi davranır |
| ALL görünümü | SECTION kartı Bale/Müzik alt satırına sızmaz |
| BALLET/MUSIC filtresi | Seçilen program satırında SECTION ortak dersleri de gösterilir |
| Blok ders | Çok derslik kartta yalnız başlangıç hücresi aday başlangıcıdır; takip hücreleri aynı footprint'in devamıdır |
| Provisional kaynak | M22/M22.1 gereği `VALID + isComplete` aday, teacher/room kimliği NULL olsa da schedule edilebilir |
| Sol sabit sütun | Yatay scroll sırasında içerik kartlarının üstünde, opak ve sticky kalmalıdır |

## 5. Bilinen program kuralları

| Kural | Durum |
|---|---|
| Öğrenci bale öğrencisi değilse müzik öğrencisidir | Aktif |
| Müzik öğrencisi bale dersi almaz | Aktif |
| A şubesi programında müzik dersi varsa A şubesinde en az bir müzik öğrencisi vardır | Aktif |
| Ritmik bale | Bale bölümü dersi |
| Öğle arası | 12:20–13:00 |
| 5A Çarşamba piyano | Ekli |
| 5A Çarşamba bale grup 1 | 15:30–16:15 · İris, Aylin, Mira |
| 5A Çarşamba bale grup 2 | 16:20–17:00 · Deniz, Almila, Yankı |
| 5. sınıf B. Uygulama | Dönem boyunca iptal |
| 5A Cuma K. Bale | 13:50'den itibaren 2 ders · E. Gemalmaz |

## 6. Yönetim modülü mimarisi — güncel önemli noktalar

`buildManagementRowDisplayCards()` sadece görsel aggregation yapar. Birleşik kartlar `sourceCardIds` ile alttaki gerçek kartları taşır. Teacher/room view'larında bu aggregation uygulanmaz.

`cardBelongsToClassRow()` ALL görünümde katı kategori ayrımı yapar; filtreli BALLET/MUSIC görünümünde `includeSectionCards` ile ortak SECTION dersleri seçilen öğrenci programına dahil edilir.

Grouped drag state `dragCardIds` ve `dragCandidateDetails` ile tutulur. `beginDrag()`, önce `management_refresh_card_group_candidates` çağırır, sonra her alt kartın candidate detail'ini çeker.

M22/M22.1 ürün invariantı kritiktir: `UNKNOWN != ABSENT != UNAVAILABLE`. `teacher_id = NULL` veya `room_id = NULL`, candidate `VALID` ve `is_complete = true` ise provisional schedule edilebilir. Frontend bu adayı yalnızca ID NULL diye `NONE` yapmamalıdır.

M26 serisi grouped/atomic işlemleri sağlar. Bundle içindeki sibling kartlar external occupancy hesabında birbirlerini sahte conflict olarak üretmemelidir. Gerçek dış conflictler korunur.

## 7. 24 Eylül 2026 oturumu — adım adım çalışma kaydı

| Sıra | SHA | Commit | Yapılan |
|---:|---|---|---|
| 0 | `6cafd8b1c1ea079a3faf80acb0a1a8c89ad8b988` | başlangıç checkpoint'i | Oturumun güvenilen başlangıç noktası |
| 1 | `d86dfd3b1db80edd375e1c6506c06ff1004e7fbc` | `fix: coalesce duplicate class cards in management board` | Aynı ortak derslerin görsel aggregation'ı |
| 2 | `8d001cf484279777a7622b51bc1e73098e9e458a` | `fix: enable grouped card drag and normalize section rows` | Birleşik kart sürükleme başlangıcı ve satır düzeni |
| 3 | `5b9611c497ebae461bd4175c003b9d028bb494b8` | `feat: make grouped timetable cards atomic operations` | M26 grouped place/move/remove/undo/redo temeli |
| 4 | `2967ee5e38e45dab549a4df0b017d4c8f55b8c04` | `fix: use delta refresh for management undo redo` | M26.1 undo/redo timeout azaltımı |
| 5 | `1543bc43b2fcd5f265878133a468ea9cce26e860` | `fix: recover legacy grouped removals and deferred drops` | M26.2 legacy grouped remove undo + deferred drop |
| 6 | `6d3bc95bc097139f159c9c9f0a28e00d223671ec` | `fix: refresh grouped pool candidates before drop` | M26.3 grouped candidate refresh |
| 7 | `af318e0358eabac56348db240a54908b50560a75` | `fix: repair grouped management RPC revision lookup` | M26.4 UUID/revision çözümü |
| 8 | `679e975a871558f8aa13d1141382e9b8a2f1210a` | `fix: apply grouped place move before propagation` | M26.5 explicit bundle üyeleri + sonra propagation |
| 9 | `5ae1ed0385dc9177128d94abe844da8b54f858e7` | `fix: expose timetable drop targets while dragging` | Yanlış yorumlanan drag preview denemesi |
| 10 | `e4852b33e5ce4011131d898c5fb31591f1b0fb6c` | `revert: keep dragged card visible` | Sürüklenen kartın görünürlüğü geri getirildi |
| 11 | `8c0d0dd08933a2bc20f552f3f2bac0a545593e5e` | `fix: show all placeable timetable slots as suitable` | AMBIGUOUS slotlar yeşil “Uygun” gösterildi |
| 12 | `819f6d87a8ee84096942041c69fe21d06a399bf4` | `fix: make block lesson drop targets footprint aware` | Çok derslik blok footprint görselleştirmesi |
| 13 | `dc1f16726f4890896bab0cdecf2173636183a798` | `fix: avoid stale management PWA navigation cache` | Agresif PWA navigation cache kapatıldı, skipWaiting açıldı |
| 14 | `0bb30e2800cd3b490b9f11d92da3502c999c439c` | `diagnostic: show exact timetable drop rejection reasons` | INVALID reason code'ları UI'da görünür yapıldı |
| 15 | `19994c6aed0c64eb59ad48179784f920d994afcf` | `fix: exclude bundle siblings from candidate conflicts` | M26.6 bundle-aware candidate refresh |
| 16 | `d45dd200d43f7845ca00060de8dcc42d635ec538` | `diagnostic: show all drop conflict reasons inline` | `Salon + Grup` gibi tüm conflict türleri inline gösterildi |
| 17 | `80d13c3073901db29fd46588969514de3d9f4697` | `diagnostic: expose actual blockers for invalid bundle slots` | M26.7 gerçek blocker kartlarını read-only teşhisle gösterdi |
| 18 | `eb9535a421bf57914612f2c95f9be2e7baaffe05` | `fix: allow provisional candidates in grouped placement` | M26.8 kök düzeltme: VALID+complete provisional adaylar frontend ve bundle RPC'de kabul edildi |
| 19 | `111d151a99cc868bc0212fc03dc0d4287a75696c` | `fix: keep sticky timetable labels above scrolled cards` | Sol sticky sütun z-index/opaklık düzeltmesi |

## 8. 24 Eylül oturumundaki kritik hata ve kök neden

Belirti: `5A + 5B Matematik` iki derslik blok programdayken 3–4. ders olarak görünüyordu. Kaldırıp havuza alındığında 3. ders hiçbir state göstermiyor, 4. ders ise `Uygun değil` / `Salon + Grup` gösteriyordu.

İlk teşhislerde footprint, PWA cache, bundle sibling conflict ve gerçek blocker ihtimalleri test edildi. M26.7 diagnostic çıktısı 4. dersten başlayan 4–5 bloğu için 8A/8B salonları ve 5A V. Kondisyon'u blocker olarak gösterdi. Kullanıcının görsel kontrolü bunun 3–4 bloğuna ait olamayacağını gösterdi; V. Kondisyon 5. dersteydi.

Gerçek kök neden frontend'deki eski valid filtreydi:

```ts
assessment.status === 'VALID'
&& assessment.isComplete
&& Boolean(assessment.teacherId)
&& Boolean(assessment.roomId)
```

5A Matematik öğretmeni `Belirsiz` olduğu için M22/M22.1 candidate semantiğinde aday `VALID + complete` fakat `teacherId = null` idi. Frontend bunu yanlışlıkla `NONE` yaptı. Sonuç olarak 3. ders yeşil/drop target olmadı; kullanıcı 4. hücreye sürüklendiğinde sistem 4–5 bloğunu değerlendirip gerçek 5. ders çakışmalarını gösterdi.

M26.8 ile frontend `VALID + isComplete` koşulunu doğru kabul edecek hale getirildi; single ve grouped command tipleri nullable resource kimliklerini taşımaya başladı; grouped bundle SQL exact-candidate eşleşmesi `IS NOT DISTINCT FROM` ile NULL-safe yapıldı. Kullanıcı sonrasında 2 derslik Matematiği doğru biçimde geri yerleştirebildi. Bu davranış **doğrulandı**.

## 9. Migration kaydı

| Migration | Amaç |
|---|---|
| `20260924115000_management_m26_bundle_operations.sql` | M26 grouped atomic operasyonlar |
| `20260924153500_management_m26_1_delta_undo_redo.sql` | Delta undo/redo |
| `20260924161000_management_m26_2_legacy_group_undo.sql` | Legacy grouped undo |
| `20260924163500_management_m26_3_group_candidate_refresh.sql` | Group candidate refresh |
| `20260924165500_management_m26_4_uuid_revision_fix.sql` | UUID/revision fix |
| `20260924172500_management_m26_5_group_place_move.sql` | Explicit bundle member place/move + propagation |
| `20260924210500_management_m26_6_bundle_candidate_domain.sql` | Bundle-aware candidate occupancy |
| `20260924214500_management_m26_7_slot_blocker_diagnostic.sql` | Read-only actual blocker diagnostic |
| `20260924222000_management_m26_8_provisional_bundle_candidates.sql` | Provisional NULL resource identity için grouped exact-match düzeltmesi |
| `20260924224500_management_m27_teacher_completion.sql` | Eksik draft öğretmenlerini tara; bilinenleri koru; çakışmaya göre `Ders Öğretmeni 1/2/3` kapasitesi oluştur; placement + requirement atamalarını tamamla |
| `20260924233000_management_m27_1_flexible_special_teachers.sql` | Orkestra/Doğaçlama için tek dedicated öğretmen + mevcut BALLET/MUSIC öğretmen havuzu; numaralı sentetik öğretmen üretme/koruma yok |
| `20260924235500_management_m27_2_special_teacher_canonicalization.sql` | Legacy Orkestra/Doğaçlama numaralı placeholder'larını geniş kalıpla aktif yönetim atamalarından temizle; tek dedicated kaynağı kanonik tut |
| `20260925001000_management_m28_resource_lifecycle.sql` | Öğretmen/salon kaynak ekleme-silme; öğretmen ACTIVE/INACTIVE yaşam döngüsü; pasif öğretmeni candidate ve yeni atamalardan çıkarma |
| `20260925010000_management_m29_placement_resource_preview.sql` | Yerleşmiş kartı kaldırmadan öğretmen/salon değişikliği için etki önizleme + güvenli atomik apply; requirement havuzunu gerektiğinde genişletir |

Remote migration durumu için bu tablo tek başına yeterli kaynak değildir; her yeni DB işi öncesi `npx.cmd supabase migration list` ile local/remote eşleşmesi doğrulanmalıdır. Bu oturumdaki runtime davranışı M26.7 diagnostic ve M26.8 provisional grouped placement fonksiyonlarının aktif olduğunu doğruladı.

## 10. Test / doğrulama politikası

Frontend/type değişikliklerinde en az `npm.cmd run build` çalıştırılır. İlgili Vitest mevcutsa focused test önce, gerekirse tüm test suite sonra çalıştırılır. SQL migration yalnızca dry-run'da beklenen tek migration görülürse push edilir.

Görsel davranış için gerçek browser testi gereklidir. Özellikle grouped drag/drop için test senaryosu: bir `5A + 5B` ortak iki derslik kartı seç, kaldır, havuzdan sürükle, eski başlangıç slotunun yeşil `Uygun ×2` olduğunu doğrula, yerleştir, kartın iki derslik footprint ile geri geldiğini doğrula, undo/redo ile atomic kaldığını kontrol et.

## 11. Şu anki durum ve sıradaki kontrol

Ana grouped/provisional yerleştirme problemi çözülmüş ve kullanıcı tarafından doğrulanmıştır.

Son commit `111d151a...` yatay scroll sırasında sol sticky sınıf/alan sütununun ders kartlarıyla üst üste binmesini düzeltir. Sol hücreler opaklaştırıldı, z-index yükseltildi ve hafif sağ ayırıcı gölge eklendi. Bu küçük UX düzeltmesi commit edildi; yeni oturumda ilk görsel kontrol noktası budur.

## 12. Oturum kapatma protokolü

Her oturum sonunda bu dosyada üç şey mutlaka yapılır: üstteki “Son doğrulanmış implementation checkpoint” güncellenir; o oturumdaki commit/migration/test adımları tarih başlığı altında eklenir; çözülmemiş tek sonraki iş açıkça yazılır.

Dokümantasyon güncellemesi ayrı ve küçük bir commit olmalıdır. Önerilen commit mesajı:

```
docs: update management session checkpoint
```

Yeni implementation commitleri bu dosyada kayda alınmadan oturum kapatılmamalıdır.


## 13. M27 — Eksik öğretmenlerin yönetim modeline aktarılması

Kullanıcı, aktif öğrenci/öğretmen görünümünde daha önce kullanılan eksik-öğretmen türetme yaklaşımının Yönetim/Kaynaklar tarafına da aktarılmasını istedi. Kaynaklar sayfasında yeni öğretmen oluşturma UI'sı olmadığı için çözüm migration tabanlıdır.

Implementation commit:

```
49f44ae7afede41b9d70230bb87a0850e7dc85dd
feat: complete missing draft teacher resources
```

Migration:

```
20260924224500_management_m27_teacher_completion.sql
```

M27 kuralları:

- Mevcut/gerçek öğretmen kimlikleri değiştirilmez.
- Aktif 2026–2027 / 1. dönem DRAFT çizelgesindeki bütün aktif requirement, card ve placement kayıtları taranır.
- Öğretmeni NULL olan yerleşimler önce requirement üzerinde zaten tanımlı ve o blokta gerçekten müsait bir öğretmenle tamamlanmaya çalışılır.
- Uygun bilinen öğretmen yoksa ders kimliğine göre sanal öğretmen kapasitesi oluşturulur.
- Tek kapasite yeterliyse ad: `Matematik Öğretmeni` gibi.
- Aynı öğretmen kimliği aynı anda birden fazla ayrı blokta gerekli oluyorsa: `Matematik Öğretmeni 1`, `Matematik Öğretmeni 2`, ... şeklinde interval-coloring ile yeterli kapasite oluşturulur.
- `Müzik Tarihi`, `Müzik Teorisi`, `Koro` ortak `Müzik Öğretmeni` kimliğini kullanır.
- `Türk D. ve Edb.` varyasyonları `Türk Dili ve Edebiyatı Öğretmeni` olarak kanonikleştirilir.
- Din Kültürü varyasyonları `Din Kültürü Öğretmeni` olarak kanonikleştirilir.
- `Kulüp`, `Sahne`, `Birlikte Uygulama / B. Uygulama` için otomatik öğretmen üretilmez.
- Yeni öğretmenler `teachers` tablosuna eklenir; ilgili `placements.teacher_id` değerleri doldurulur; `course_requirement_teachers` eşleştirmeleri tamamlanır; `teacher_mode` FIXED/ELIGIBLE_POOL olarak gerçek atama sayısına göre güncellenir.
- Yeni atamalardan sonra ilgili card candidate domain'i yeniden hesaplanır.
- Migration, yeni tamamlanan kartların hiçbirinde teacher double-booking oluşmasına izin vermez; oluşursa transaction rollback olur.
- Public `schedule_sessions` ve `session_groups` değiştirilmez; public count/hash guard migration sonunda doğrulanır.
- Aktif revision `validation_summary` içine M27 audit sayıları ve üretilen öğretmen adları yazılır.

Durum: **GitHub'a commit edildi, remote Supabase apply henüz kullanıcı tarafından doğrulanmadı.** Uygulamadan önce standart akış:

```powershell
git pull --ff-only
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Dry-run yalnızca M27'yi gösteriyorsa `npx.cmd supabase db push`. Ardından Kaynaklar/Öğretmenler sayfası ve Program/Öğretmenler görünümü kontrol edilmelidir.


## 14. M27.1 — Orkestra / Doğaçlama esnek öğretmen havuzu

Kullanıcı ürün kuralını netleştirdi:

- `Orkestra Öğretmeni` tam bir dedicated kaynak olarak bulunur; `Orkestra Öğretmeni 1/2/3` üretilmez.
- `Doğaçlama Öğretmeni` tam bir dedicated kaynak olarak bulunur; `Doğaçlama Öğretmeni 1/2/3` üretilmez.
- Orkestra ve Doğaçlama dersleri, B. Uygulama mantığında, dedicated öğretmen dışında mevcut müzik veya dans/bale öğretmenlerinden birine de atanabilir.
- Yeterli uygun öğretmen yoksa yeni numaralı özel öğretmen yaratmak yerine migration rollback olur.

Implementation commit:

```
12e0e38f7811cf24dd009051606750dbc273d879
fix: make orchestra and improvisation teacher pools flexible
```

Migration:

```
20260924233000_management_m27_1_flexible_special_teachers.sql
```

M27.1 davranışı:

- Aktif 2026–2027 / 1. dönem DRAFT requirement'larında Orkestra ve Doğaçlama derslerini bulur.
- M27.1 başlamadan önce var olan BALLET/MUSIC requirement öğretmenlerini esnek havuz olarak toplar.
- `Orkestra Öğretmeni` ve `Doğaçlama Öğretmeni` kayıtlarını birer kez garanti eder.
- Target requirement'lara kendi dedicated öğretmenini ve mevcut BALLET/MUSIC öğretmen havuzunu eligible olarak ekler.
- Daha önce M27 tarafından oluşturulmuş `Orkestra Öğretmeni 1/2/...` veya `Doğaçlama Öğretmeni 1/2/...` kullanımlarını yeniden dağıtır.
- Yeniden dağıtımda önce dedicated öğretmen, sonra mevcut müzik/dans öğretmenleri denenir; gerçek zaman çakışması olan öğretmen seçilmez.
- Target placement'larda NULL veya numaralı sentetik öğretmen kalmasına izin vermez.
- Kullanılmayan numaralı sentetik target teacher kayıtlarını güvenli biçimde siler.
- Candidate domain target kartlar için yeniden hesaplanır.
- Public program count/hash guard ile korunur.

Durum: **GitHub'a commit edildi. Remote Supabase apply henüz bu sohbet içinde doğrulanmadı.** M27 ve M27.1 remote migration listesinde eksikse ikisi birlikte dry-run'da sıralı görünmelidir.


## 15. M27.2 — Orkestra / Doğaçlama legacy placeholder temizliği

M27.1 sonrasında kullanıcı Kaynaklar ekranında Orkestra öğretmenini hâlâ dört kişi gördü. Kök neden: Kaynaklar envanteri `teachers` tablosundaki yönetimde artık kullanılmayan eski placeholder satırlarını da gösteriyordu; ayrıca daha eski isim biçimleri yalnız `Öğretmeni 1` regex'iyle yakalanmıyordu.

Implementation commit:

```
35e5b9a7d781e13237c950d6a02d9dbce1f37051
fix: canonicalize orchestra and improvisation resources
```

Migration:

```
20260924235500_management_m27_2_special_teacher_canonicalization.sql
```

M27.2:
- `Orkestra Öğretmeni 1`, `Orkestra Öğretmeni-1`, `Orkestra Ö.-1` benzeri legacy numaralı biçimleri; aynı şekilde Doğaçlama varyasyonlarını yakalar.
- Bu kimlikleri aktif Orkestra/Doğaçlama requirement öğretmen havuzundan çıkarır.
- NULL veya legacy özel öğretmen taşıyan aktif draft placement'ları tek dedicated öğretmen + mevcut BALLET/MUSIC öğretmen havuzuna çakışmasız dağıtır.
- Aktif draft target requirement/placement içinde legacy özel öğretmen kalırsa rollback olur.
- Fiziksel olarak tamamen referanssız legacy teacher satırlarını siler.
- Public/audit referansı nedeniyle silinemeyen, fakat yönetimde aktif kullanılmayan legacy özel placeholder satırları Kaynaklar UI'sında artık gösterilmez.
- Kaynaklar öğretmen sayacı ve aktif/kullanılan öğretmen sayıları da bu görünür yönetim envanterini baz alır.

Durum: GitHub'a commit edildi; remote migration apply kullanıcı tarafından doğrulanmalıdır.


### M27.2 failed-apply correction

İlk M27.2 apply denemesi şu FK ile rollback oldu:

```
schedule_card_candidate_assessments_teacher_id_fkey
```

Sebep: aktif requirement/placement referansları temizlenmiş olsa bile derived
`schedule_card_candidate_assessments` satırları legacy teacher id'lerini
tutabiliyor. Fiziksel teacher silmek ürün gereksinimi için gerekli değildir.

Düzeltme: uygulanmamış M27.2 migration içindeki `delete from public.teachers`
bloğu kaldırıldı. Legacy Orkestra/Doğaçlama placeholder kimlikleri DB'de
historical/derived referans güvenliği için kalabilir; aktif yönetim atamalarından
çıkarılır ve Kaynaklar UI'sında aktif/kullanılan olmadıklarında gizlenir.


## 16. M28 — Kaynak yaşam döngüsü + haftalık kart kaynak editörü

Kullanıcı iki ürün eksikliği tanımladı:

1. Kaynaklar ekranında öğretmen ve salon ekleyip çıkarabilmek; öğretmen okuldan ayrıldığında gizleyip/pasifleştirip geri döndüğünde yeniden aktif edebilmek.
2. Haftalık çizelgede bir karta tıklanınca Ders Planı sayfasındaki öğretmen ve salon tanımlarını aynı sağ panelden düzenleyebilmek.

### M28 — kaynak yaşam döngüsü

Implementation commit:

```
b46f1d0d41c8cad15d87ac5696b798be7d172c5b
feat: manage teacher and room resource lifecycle
```

Migration:

```
20260925001000_management_m28_resource_lifecycle.sql
```

Kurallar:

- `teachers.operational_status`: `ACTIVE | INACTIVE`.
- INACTIVE öğretmen tarihsel kimliğiyle DB'de kalır; yeni Ders Planı öğretmen seçeneklerinde gösterilmez.
- INACTIVE öğretmen candidate assessment'larında `TEACHER_INACTIVE` ile INVALID olur.
- Öğretmen pasifleştirme, aktif draft'ta öğretmenin yerleşmiş kartı varsa bloklanır; önce kartın öğretmeni değiştirilmeli veya kart kaldırılmalıdır.
- Öğretmen yeniden ACTIVE yapılınca ilgili requirement kartlarının candidate domain'i yeniden hesaplanır.
- Kaynaklar UI'sında pasif öğretmenler varsayılan olarak gizlidir; `Pasifleri göster` ile açılır ve yeniden aktif edilebilir.
- `+ Öğretmen` ve `+ Salon` ile yeni kaynak oluşturulur.
- Fiziksel silme yalnız gerçekten kullanılmamış/referanssız kaynakta mümkündür; geçmiş/aktif referans varsa kullanıcıya pasifleştirme/kullanım dışı bırakma yönü verilir.
- Salonlar mevcut `ACTIVE / MAINTENANCE / OUT_OF_SERVICE` yaşam döngüsünü korur.
- Ders Planı öğretmen seçenekleri yalnız ACTIVE öğretmenleri; salon seçenekleri yalnız ACTIVE ana salonları gösterir.
- Program/Öğretmenler satırları ACTIVE öğretmenleri gösterir; halen yerleşmiş bir INACTIVE öğretmen varsa teşhis için satır görünür kalır.

### Haftalık çizelge kartından kaynak düzenleme

Implementation commit:

```
3d95ee6e725e70647c577a30e9385fbf0d571e32
feat: edit lesson resources from timetable cards
```

Davranış:

- Program çizelgesinde bir kart seçildiğinde sağ Ayrıntılar panelinde `Ders planı kaynakları` bölümü vardır.
- `Öğretmen tanımı`, Ders Planı'ndaki aynı FIXED / ELIGIBLE_POOL öğretmen havuzunu düzenler.
- `Salon tanımı`, aynı `ManagementRoomStrategyEditor` bileşenini kullanır: SPECIFIC / CAPABILITY / UNKNOWN.
- Kart/requirement henüz yerleşmemişse plan kaynakları doğrudan güncellenebilir.
- Requirement'ın yerleşmiş blokları varsa Ders Planı sözleşmesi korunur: plan havuzu/stratejisi değiştirilmez. Mevcut kartın aynı slotta öğretmen veya salon değişikliği için zaten var olan `Yerleşimi düzenle` candidate akışı kullanılır.
- Böylece Program ve Ders Planı ayrı veri modelleri üretmez; aynı RPC'ler ve aynı güvenlik kısıtları kullanılır.

### Doğrulama

Remote apply öncesi:

```powershell
git pull --ff-only
git rev-parse HEAD
npm.cmd run build
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Beklenen HEAD:

```
3d95ee6e725e70647c577a30e9385fbf0d571e32
```

M28 remote'da eksikse dry-run'da `20260925001000_management_m28_resource_lifecycle.sql` görünmelidir.

Browser doğrulama:
- Kaynaklar > Öğretmenler: yeni öğretmen ekle; pasifleştir; varsayılan listeden kaybolduğunu; Pasifleri göster ile geldiğini; tekrar aktifleştirilebildiğini kontrol et.
- Kullanılmamış test öğretmenini sil.
- Yeni salon ekle; kullanılmamışken sil.
- Kullanılan kaynağın fiziksel silinmesinin engellendiğini kontrol et.
- Ders Planı editörlerinde pasif öğretmenin seçeneklerde olmadığını kontrol et.
- Program: kart seç > Ders planı kaynakları > Öğretmen tanımı / Salon tanımı.
- Yerleşmiş kartta aynı-slot `Yerleşimi düzenle` öğretmen/salon değişiminin çalışmaya devam ettiğini kontrol et.

Durum: GitHub implementasyonu tamamlandı; build ve M28 remote migration apply kullanıcı tarafından doğrulanmalıdır.


## 17. M29 — Yerleşmiş kartta öğretmen/salon değişikliği

Kullanıcı, Program sağ panelindeki `Yerleşimi düzenle` butonlarının `Öğretmen değiştir · yok / Salon değiştir · yok` şeklinde default kilitli kaldığını raporladı. Kök neden: UI yalnız mevcut candidate domain içinde aynı slot için alternatif resource arıyordu. Requirement havuzunda olmayan fakat Kaynaklar'da aktif bulunan öğretmen/salon hiç seçenek sayılmıyordu.

Kullanıcı ürün beklentisini yeniden netleştirdi: yerleşmiş kartı kaldırmak zorunlu olmamalı; önce etki hesaplanmalı, güvenliyse aynı slotta resource değişmeli, gerçek çakışma varsa değişiklik kilitlenmeli.

Implementation:

```
d42ec7d57ebfaea296fe52a5b65f935d25ae04b3
feat: preview and apply in-place timetable resource changes
```

Migration:

```
20260925010000_management_m29_placement_resource_preview.sql
```

M29 davranışı:

- Program > kart > Yerleşimi düzenle artık yalnız candidate domain alternatiflerini değil, tüm ACTIVE öğretmenleri ve ACTIVE ana salonları seçenek olarak sunar.
- Kullanıcı kaynak seçtikten sonra `Etkiyi hesapla` çalışır; doğrudan yazma yapılmaz.
- Öğretmen değişikliğinde seçilen öğretmenin mevcut gün/saat + blok süresinde başka bir dış kartla çakışması kontrol edilir.
- Salon değişikliğinde aynı slotta salon çakışması, salon ACTIVE durumu ve CAPABILITY stratejisinde required capability + CONFIRMED profile uyumu kontrol edilir.
- Birleşik görsel kartlarda `selectedCardIds` bundle olarak değerlendirilir; bundle sibling'ları birbirlerine conflict sayılmaz.
- Seçilen resource requirement havuzunda yoksa safe apply sırasında ilgili `course_requirement_teachers` / `course_requirement_rooms` havuzu genişletilir ve mode FIXED/ELIGIBLE_POOL ile uzlaştırılır.
- CAPABILITY salon stratejisinde seçilen salon capability kuralını karşılamalıdır; strategy değiştirilmez.
- Safe apply mevcut M26.8 `management_move_card_bundle` yoluna delegasyon yapar. Böylece gün/saat korunurken teacher/room değişikliği normal MOVE history/undo/redo zincirine girer.
- Önizleme stale-token korumalıdır; preview sonrası program değişmişse yeniden hesaplama gerekir.
- Gerçek conflict varsa `canApply=false`; UI blocker dersini ve conflict tipini gösterir.
- Kartı önce havuza kaldırma zorunluluğu yalnız Ders Planı requirement havuzunu topluca değiştirme işlemlerinde kalır; tek yerleşimin resource değişiminde uygulanmaz.

Not: M29 migration dosyası remote apply öncesi UUID revision aggregate kullanımı açısından yeniden statik kontrol edildi; `min(uuid)` ve belirsiz `unnest` alias kullanımları kaldırıldı.

Durum: GitHub implementation tamamlandı; build ve remote migration apply henüz kullanıcı tarafından doğrulanmadı.


### M29 hardening checkpoint

```
73cdbb4e12b3a5e1cc514afe596a2fa645f1fdb8
fix: harden M29 resource preview migration
```

Remote apply öncesi SQL statik kontrolünde UUID revision seçimi için `min(uuid)` ve belirsiz `unnest` alias kullanımı kaldırıldı. M29'un güvenilir implementation checkpoint'i bu SHA'dır.


### M29 first build failure — TypeScript correction

İlk kullanıcı doğrulamasında `npm.cmd run build` M29 migration uygulanmadan önce TypeScript aşamasında durdu:

```
ManagementInspector.tsx(255,43): TS18047 card is possibly null
ManagementInspector.tsx(287,41): TS18047 card is possibly null
ManagementInspector.tsx(509,24): openPlanTeacherEditor not found
ManagementInspector.tsx(831,38): togglePlanTeacher not found
ManagementInspector.tsx(863,37): savePlanTeachers not found
```

Kök neden: M29, eski candidate-only placement memo bloğunu değiştirirken aynı aralıkta bulunan Ders Planı öğretmen editörü helper fonksiyonlarını da yanlışlıkla kaldırdı. Ayrıca preview/apply callback'leri component'in `!card` early-return guard'ından önce tanımlandığı için `card.id` nullability hatası oluştu.

Düzeltme:
- `openPlanTeacherEditor`, `togglePlanTeacher`, `savePlanTeachers` geri getirildi.
- Null-safe `activeCardIds` memo eklendi; preview/apply yalnız bu liste boş değilse çalışır.
- M29 remote migration **henüz uygulanmadı**; migration listesinde `20260925010000` local-only olarak kaldı.
- Yeni build PASS alınmadan `db push` yapılmamalıdır.


### M29 production görünmeme kök nedeni — branch promotion

Kullanıcı M29 migration apply ve local build PASS sonrasında production arayüzünde hiçbir değişiklik görmedi. GitHub karşılaştırması root cause'u doğruladı:

- feature branch HEAD: `02c57433dce9fe47abc9781b08977e3bb05f86a6`
- main HEAD: `fc2d546c6e619a23c94a533bae77f424fe2756ef`
- feature branch main'in 226 commit önünde, 0 commit gerisindeydi.
- main'deki `ManagementInspector.tsx` hâlâ eski `Öğretmen değiştir · yok / Salon değiştir · yok` kodunu içeriyordu.
- feature branch'te eski `· yok` metni yok; M29 `Etkiyi hesapla` UI'sı mevcut.
- Supabase migration global remote DB'ye uygulanmış olsa da production frontend main'den servis edildiği için UI değişmemişti.

Karar: feature branch, çatışmasız fast-forward ile `main` branch'ine promote edilecek. Force push yapılmayacak. Böylece mevcut production URL M20–M29 yönetim geliştirmelerini ve M29 kaynak-change UI'sını servis edecek.


## 18. 25 Eylül 2026 oturum kapanış checkpoint'i — Mac'e geçiş

### Repo / deploy / migration durumu

Oturum sonunda:

- `main` ve `feat/management-m20-placement-recovery` aynı production-promoted ağaca getirildi.
- Promotion öncesi production root cause kaydı:
  `bb41cb535b4bdbf2b9a458d36b56e80d28c01eb0`
  `docs: record M29 production promotion root cause`
- Vercel bu `main` için SUCCESS verdi.
- Kullanıcı local Windows checkout'ta `npm.cmd run build` çalıştırdı ve build **PASS**:
  - webpack compile PASS
  - TypeScript PASS
  - static generation PASS
- `20260925010000_management_m29_placement_resource_preview.sql` dry-run'da tek pending migration olarak doğrulandı ve remote Supabase'e başarıyla uygulandı.
- M28 daha önce remote'da uygulanmış durumdaydı.
- M29 UI production'da görünür hale geldi: tüm aktif öğretmen/salon seçenekleri ve `Etkiyi hesapla` akışı görüntülendi.

### Açık blocker — M29 preview RPC SQL hatası

Production UI artık doğru ekrana geldi ancak hem öğretmen hem salon için `Etkiyi hesapla` çağrısı şu PostgreSQL hatasıyla sonuçlanıyor:

```
column occupied.card_id does not exist
```

Kök neden repo'da doğrulandı. Dosya:

```
supabase/migrations/20260925010000_management_m29_placement_resource_preview.sql
```

İki conflict CTE'sinde aynı hata var:

```sql
occupied.card_id as blocking_card_id
```

Ancak `occupied` alias'ı:

```sql
join public.schedule_cards occupied
  on occupied.id = occupied_placement.card_id
```

olduğu için `schedule_cards` tablosunda `card_id` yoktur. Doğru ifade:

```sql
occupied.id as blocking_card_id
```

Hata iki yerde bulunur:
- teacher conflict CTE
- room conflict CTE

**Önemli:** M29 migration artık remote'da uygulanmıştır. Bu nedenle sabah uygulanmış `20260925010000` dosyasını geriye dönük değiştirmek yeterli/uygun değildir. Yeni bir **M29.1** migration oluşturup `management_preview_placement_resource_change` fonksiyonunu düzeltilmiş gövdeyle replace etmek gerekir.

### Sabah ilk iş

Mac local repo kurulduktan ve build doğrulandıktan sonra:

1. Yeni M29.1 migration oluştur.
2. M29 preview fonksiyonundaki iki `occupied.card_id` ifadesini `occupied.id` yap.
3. `npm run build` PASS.
4. `npx supabase migration list`.
5. `npx supabase db push --dry-run` yalnız M29.1 göstermeli.
6. Apply.
7. Production'da:
   - V. Kondisyon gibi salonu Belirsiz olan yerleşmiş bir kartta salon seç → Etkiyi hesapla.
   - Yerleşmiş kartta yeni öğretmen seç → Etkiyi hesapla.
   - güvenli seçimde apply açılmalı;
   - gerçek conflict seçiminde blocker ders görünmeli.
8. Safe apply sonrası undo/redo kontrolü.
9. `AGENTS.md` checkpoint güncelle.

### Mac çalışma ortamı

Ayrıntılı Mac başlangıç akışı `docs/MAC_CONTINUATION.md` içindedir. Yeni oturumda önce `AGENTS.md`, sonra bu dosya okunmalıdır.


### Windows PowerShell / Supabase CLI local environment note

- Windows PowerShell execution policy may block `npm.ps1` with `PSSecurityException`.
- On Windows, use the already-established executable form:
  ```powershell
  npm.cmd ci
  npm.cmd run build
  npx.cmd supabase migration list
  ```
- Do **not** loosen PowerShell execution policy just for this project.
- Supabase CLI creates `supabase/.temp/` local link/cache state. This directory is now ignored by Git and must not be committed.
- If `cat AGENTS.md` renders Turkish text as mojibake in Windows PowerShell, the repo file is still UTF-8; display it with:
  ```powershell
  Get-Content -Encoding UTF8 AGENTS.md
  ```
  macOS Terminal should render the UTF-8 file normally.

## 19. 26 Eylül 2026 — Mac devamı / M29.1–M29.5 placement resource override

Mac ortamında çalışma `feat/management-m20-placement-recovery` branch'inde
`109352176b488bbac68a17ec42538e8152b84253` checkpoint'inden devam etti.

### M29.1 — preview SQL düzeltmesi

Production preview RPC hatası:

`column occupied.card_id does not exist`

Yeni migration:

`20260926113000_management_m29_1_resource_preview_card_id_fix.sql`

İki conflict CTE'de:

`occupied.card_id` → `occupied.id`

olarak düzeltildi.

### M29.2–M29.3 — timeout teşhisi

Öğretmen değişikliğinde ilk uygulamaların PostgreSQL statement timeout'a
düştüğü görüldü.

M29.2'de gereksiz pre-move bundle refresh kaldırıldı ancak problem çözülmedi.

M29.3'te generic `management_move_card_bundle` zinciri daraltıldı. Testler,
asıl problemin öğretmen değişikliğinin ders planı öğretmen havuzunu
genişletmesi ve candidate-domain hesaplarının büyümesi olduğunu gösterdi.

### M29.4 — placement resource override

Yeni migration:

`20260926124500_management_m29_4_placement_resource_override.sql`

Mimari karar:

- Yerleşimde öğretmen/salon değiştirmek, ders planı kaynak havuzunu değiştirmez.
- `course_requirement_teachers` ve `course_requirement_rooms` otomatik genişletilmez.
- `teacher_mode` / `resource_mode` değiştirilmez.
- Öğretmen/salon değişikliği yalnız mevcut placement üzerinde override'dır.
- Gün ve saat korunur.
- Preview aktiflik ve gerçek slot conflict kontrolünü sürdürür.
- MOVE history kaydı korunur.
- Geri Al çalışır.

Bu ayrım, yerleşim kaynağı ile ders planı kaynak tanımını birbirinden ayıran
yeni kalıcı sözleşmedir.

### M29.5 — override redo

Yeni migration:

`20260926130000_management_m29_5_override_redo.sql`

M29.4 placement override işlemlerinde Yinele, eski candidate-domain exact
candidate şartına takılıyordu. Override öğretmeni bilinçli olarak ders planı
havuzuna eklenmediği için bu davranış yanlıştı.

M29.5 ile override redo:

- candidate havuz üyeliğine bağlı değildir,
- resource override olduğunu transaction metadata'sından tanır,
- güvenliği yeniden doğrular,
- Geri Al / Yinele zincirini korur.

Browser acceptance'ta Yinele çalıştığı doğrulandı.

### Yönetim Ayrıntılar paneli sadeleştirmesi

`ManagementInspector.tsx` sadeleştirildi.

Ana ayrıntı görünümünden kaldırılanlar:

- plan seviyesindeki Öğretmen satırı,
- plan seviyesindeki Salon satırı,
- Ders türü,
- İşleyiş,
- `Ders Planı Kaynakları` kutusu,
- buradaki Öğretmen tanımı / Salon tanımı kısayolları.

Ayrıntılar ekranındaki öğretmen ve salon için görünür tek gerçek kaynak artık
`Yerleşim` kartındaki gerçek placement bilgisidir.

Bu değişiklik, örneğin üstte "Matematik Öğretmeni 2 · Sabit" görünürken gerçek
yerleşimde başka öğretmen bulunması şeklindeki UI tutarsızlığını kaldırır.

### Doğrulama

Mac üzerinde:

- `npm run build` PASS
- Next.js compile PASS
- TypeScript PASS
- static generation PASS

M29.1–M29.5 migration zinciri local repo'ya dahil edilmelidir.
Frontend sadeleştirmesi henüz bu checkpoint commit'i ile production'a
promote edilecektir.

## 20. 26 Eylül 2026 — M29 kapanış checkpoint

M29.1–M29.5 zinciri production/browser acceptance sonrası tamamlandı.

Kabul edilen davranış:

- Yerleşimde öğretmen/salon değişikliği yalnız gerçek `placement` kaydını override eder.
- Ders planı öğretmen/salon havuzları bu işlem sırasında genişletilmez.
- Öğretmen/salon override işlemi ilk denemede uygulanır; önceki candidate-domain timeout yolu kritik transaction'dan çıkarılmıştır.
- Geri Al ve Yinele çalışır.
- Yinele, M29 resource override işlemlerinde eski exact candidate/havuz üyeliği şartına bağlı değildir; güvenlik preview ile yeniden doğrulanır.
- Ayrıntılar panelinde plan seviyesindeki öğretmen/salon bilgileri ve `Ders Planı Kaynakları` kutusu kaldırılmıştır.
- Ayrıntılar panelinde öğretmen/salon için kullanıcıya gösterilen tek güncel kaynak gerçek `Yerleşim` bilgisidir.
- Production kullanıcı kabulünde akış "çözüldü" olarak onaylandı.

Doğrulanmış kod checkpoint'i:

```
ff2654c3dfbe354f2535a88d6b187a5bdf1ec8be
fix: stabilize placement resource overrides
```

Bu commit hem `main` hem `feat/management-m20-placement-recovery` branch'ine production promotion olarak taşındı.

Yeni oturum başlangıcı:

1. `git fetch origin`
2. `git switch main`
3. `git pull --ff-only`
4. `git status --short` ile CLEAN doğrula.
5. Önce `AGENTS.md` ve `docs/MAC_CONTINUATION.md` oku.
6. M29'u yeniden açma/yeniden keşfetme; yalnız yeni bir regression kanıtı varsa geri dön.
7. Yönetim modülünün sonraki iş paketinden devam et.

Not: 26 Eylül testleri sırasında eski M29.1–M29.3 davranışları bazı derslerin öğretmen havuzuna yanlış/deneysel kayıtlar eklemiş olabilir. Yeni oturumda Ders Planı / Öğretmen havuzu verileri üzerinde çalışma yapılacaksa önce veri teşhisi yap; körlemesine silme yapma.



## 21. 26 Eylül 2026 — M29 sonrası yol haritası kararı

Yeni oturumda `main` remote HEAD'i `48cfbe8b8ea55c586b8c9f94974ac6fdcc6bb2c2` olarak doğrulandı ve working tree CLEAN görüldü.

M29 kapalı kabul edilir. Yeni bir regression kanıtı olmadıkça M29.1–M29.5 yeniden açılmayacak.

Kullanıcıyla sıradaki çalışma sırası şu şekilde kararlaştırıldı:

1. **Öğretmen havuzu veri teşhisi**
   - M29.1–M29.3 testleri sırasında `course_requirement_teachers` içine eklenmiş olabilecek deneysel/yanlış kayıtları önce read-only olarak tespit et.
   - Gerçek Ders Planı kuralı ile test yan ürününü ayır.
   - Körlemesine DELETE veya düzeltme migration'ı yazma.
   - Temizlik gerekiyorsa teşhis sonucuna dayanarak yeni, denetlenebilir bir migration/işlem tasarla.

2. **Otomatik / yarı otomatik yerleştirme**
   - Mevcut candidate/conflict altyapısını kullan.
   - “Solitaire” yaklaşımı: en az seçeneği olan / en kısıtlı kartları önce değerlendir; güvenli yerleşimleri öner veya uygula, belirsiz/çatışmalı olanları kullanıcı kararına bırak.
   - Grouped/atomic kart ve provisional resource invariantlarını koru.

3. **Müfredat / zorunlu ders saat denetimi**
   - TTKB/M23 curriculum compliance altyapısını yönetim uyarılarına dönüştür.
   - Sınıf/program bazında eksik/fazla zorunlu ders saatlerini görünür kıl.

4. **Dönem yaşam döngüsü**
   - 2026–2027 1. dönem → arşivleme.
   - 2. dönem oluşturma.
   - Eski dönemden şablon/kopya üretme.
   - DRAFT / PUBLISHED / ARCHIVED durumlarını kullanıcı açısından sadeleştirme.

5. **Yönetim Programı son UX turu**
   - Bilgi yoğunluğu, kompaktlık, sağ panel ve gereksiz kontrolleri gözden geçir.
   - Mevcut kategori renkleri, grouped kartlar, sticky sütun ve placement edit davranışları korunur.

6. **Yayın akışı**
   - Yönetim çizelgesinden öğrenci/öğretmen tarafındaki gerçek programa kontrollü publish akışını netleştir.

### İlk uygulanacak iş

Bir sonraki implementation adımı **öğretmen havuzu read-only veri teşhisidir**.

Bu teşhis tamamlanmadan otomatik yerleştirme motorunda yeni veri-mutating davranış eklenmemelidir.


## 22. 26 Eylül 2026 — M30 öğretmen havuzu read-only teşhis başlangıcı

M29.2 ve M29.3 migration gövdeleri yeniden incelendi. Her iki geçici uygulama yolu da seçilen öğretmeni doğrudan `course_requirement_teachers` içine `on conflict do nothing` ile ekliyor ve ardından ilgili requirement'ın `teacher_mode` değerini havuz büyüklüğüne göre yeniden hesaplıyordu. M29.4 ile bu mimari terk edildi; placement resource override artık requirement havuzunu değiştirmiyor.

Bu nedenle 26 Eylül testleri sırasında eklenmiş bazı öğretmen-havuz ilişkilerinin kalıcı test yan ürünü olma ihtimali doğrulandı.

Read-only diagnostic eklendi:

```
docs/diagnostics/M30_TEACHER_POOL_AUDIT.sql
```

Checkpoint:

```
167d4390fbd8fbd6b1712b99724a48de644cd5c5
diagnostic: add read-only M30 teacher pool audit
```

Teşhis yaklaşımı:

- `course_requirement_teachers.created_at` üzerinden 26 Eylül İstanbul-local test penceresini işaretler.
- Aktif DRAFT requirement set içindeki öğretmen-havuz ilişkilerini inceler.
- Aynı requirement için öğretmenin mevcut placement kullanım sayısını hesaplar.
- Atama oluşturulma zamanı çevresindeki MOVE transaction geçmişinde aynı öğretmene hareket izi arar.
- Satırları yalnız teşhis amacıyla:
  - `LIKELY_M29_TEST_ARTIFACT`
  - `REVIEW_M29_INSERT_CURRENTLY_USED`
  - `REVIEW_26SEP_INSERT_NO_MOVE_MATCH`
  sınıflarına ayırır.
- 26 Eylül eklemeleri nedeniyle `teacher_mode` değerinin ELIGIBLE_POOL'a genişlemiş olabileceği requirement'ları ayrıca listeler.

**Güvenlik kuralı:** M30 çıktısı görülmeden hiçbir `course_requirement_teachers` satırı silinmeyecek, `teacher_mode` değiştirilmeyecek ve temizlik migration'ı yazılmayacak.

Sıradaki adım: M30 SQL'i production Supabase SQL Editor'da çalıştır, üç result set'i kaydet ve yalnız gerçek test yan ürünü olduğu kanıtlanan kayıtlar için minimum M30.1 cleanup tasarla.


### M30.1 — hedefli Türkçe öğretmen havuzu temizliği

Read-only üretim teşhisiyle aşağıdaki test zinciri doğrulandı:

- 5A Türkçe test öncesi baseline: `Türkçe Öğretmeni 2`.
- 5B Türkçe test öncesi baseline: `Türkçe Öğretmeni 1`.
- M29.2/M29.3 testleri sırasında her iki Türkçe requirement havuzuna `A. Küçüküçerler`, `Armoni Öğretmeni` ve karşı şubenin Türkçe öğretmeni eklendi.
- Test/undo-redo zinciri sonunda 5A placement `Türkçe Öğretmeni 1` üzerinde kalmıştı; 5B doğru baseline `Türkçe Öğretmeni 1` üzerindeydi.

Yeni migration:

```
20260926204000_management_m30_1_teacher_pool_cleanup.sql
```

Implementation commit:

```
b4cddc90b427a5aff76207829037eda5699587cb
fix: clean M29 teacher pool test artifacts
```

M30.1:

- apply öncesi iki requirement havuzunun tam olarak teşhiste görülen dört öğretmenden oluştuğunu guard eder;
- 5A/5B hedef placement öğretmenlerini guard eder;
- 5A test placement'ını `Türkçe Öğretmeni 2` baseline'ına audit MOVE transaction ile geri döndürür;
- 5A havuzunda yalnız `Türkçe Öğretmeni 2`, 5B havuzunda yalnız `Türkçe Öğretmeni 1` bırakır;
- iki requirement için `teacher_mode = FIXED` yapar;
- yalnız ilgili aktif draft kartların candidate domain'ini yeniler;
- public session/group count + hash guard'ları ile yayımlanmış programın değişmediğini doğrular;
- beklenmedik mevcut durum varsa transaction rollback olur.

Durum: **GitHub'a commit edildi; remote Supabase apply henüz yapılmadı.**

Apply akışı:

```bash
git pull --ff-only
npm run build
npx supabase migration list
npx supabase db push --dry-run
```

Dry-run yalnız `20260926204000_management_m30_1_teacher_pool_cleanup.sql` gösterirse `npx supabase db push`.

Apply sonrası M30 audit yeniden çalıştırılmalı; iki Türkçe requirement için 26 Eylül şüpheli havuz kaydı kalmaması ve 5A/5B `teacher_mode = FIXED` olması beklenir.


### M30.2 — salon havuzu read-only teşhisi

M30.1 production apply sonrası doğrulandı:

- M30 teacher-pool audit şüpheli kayıt listesi boş.
- 5A Türkçe: `FIXED` / `Türkçe Öğretmeni 2` / 3 placement.
- 5B Türkçe: `FIXED` / `Türkçe Öğretmeni 1` / 3 placement.

Öğretmen havuzu temizliği **PASS** kabul edildi.

M29.2/M29.3 geçici apply yolu yalnız öğretmen değil, `course_requirement_rooms` havuzunu da genişletebildiği için eski oturum kapanmadan önce aynı yan etkinin salon tarafı read-only olarak kontrol edilecek.

Diagnostic:

```
docs/diagnostics/M30_2_ROOM_POOL_AUDIT.sql
```

Checkpoint:

```
82466dc31df3031a14ba8143814175e441479cf9
diagnostic: add read-only M30.2 room pool audit
```

Güvenlik: çıktı görülmeden salon havuzu, `resource_mode`, placement veya room kaydı değiştirilmeyecek.


### M30.2 cleanup — hedefli Türkçe salon havuzu temizliği

Read-only production teşhisi:

- 5A Türkçe baseline salon: `B1 105A`, 5 placement kullanımı.
- 5B Türkçe baseline salon: `B1 105B`, 6 placement kullanımı.
- `A 101`, her iki requirement havuzuna 26 Eylül 09:01 UTC'de eklendi ve mevcut placement kullanımı 0.
- Her iki requirement bu test havuzu genişlemesi nedeniyle `resource_mode = ELIGIBLE_POOL` durumundaydı.

Yeni migration:

```
20260926211500_management_m30_2_room_pool_cleanup.sql
```

Implementation commit:

```
4a8ee3cf0a9947b192911e85efc0a4626e2db31b
fix: clean M29 room pool test artifacts
```

M30.2:

- apply öncesi iki requirement salon havuzunun tam olarak teşhiste görülen iki salonu içerdiğini guard eder;
- `A 101` hedef Türkçe placement'larında kullanılıyorsa abort eder;
- yalnız iki `A 101` requirement-room ilişkisini siler;
- 5A/5B Türkçe için `resource_mode = FIXED`, `required_capability = NULL` yapar;
- placement'lara dokunmaz;
- yalnız ilgili aktif draft kartların candidate domain'ini yeniler;
- public program session/group count + hash guard'ları ile yayımlanmış programı korur.

Durum: **Production Supabase'e uygulandı ve post-apply audit PASS.**


## 23. 28 Eylül 2026 — M30 veri temizliği kapanış checkpoint'i

Muğla işyeri ortamında yerel Windows oturumunda Git mevcut, Node/npm/npx yok ve yönetici yetkisi bulunmuyor. Sistem ayarlarına veya kurumsal Windows kurulumuna müdahale edilmedi; çalışma GitHub Codespaces üzerinden `main` branch'inde sürdürüldü.

### M30.2 production apply

Önce remote migration listesi kontrol edildi. `20260926211500` yalnız local tarafta pending görünüyordu.

Dry-run:

```
Would push these migrations:
 • 20260926211500_management_m30_2_room_pool_cleanup.sql
```

Dry-run tam olarak beklenen tek migration'ı gösterdi. Ardından:

```
npx supabase db push
```

ile migration production Supabase'e başarıyla uygulandı.

Migration:

```
20260926211500_management_m30_2_room_pool_cleanup.sql
```

Implementation checkpoint:

```
4a8ee3cf0a9947b192911e85efc0a4626e2db31b
fix: clean M29 room pool test artifacts
```

### Post-apply doğrulama

`docs/diagnostics/M30_2_ROOM_POOL_AUDIT.sql` production Supabase SQL Editor'da yeniden çalıştırıldı.

Sonuç:

```
Success. No rows returned
```

Bu sonuç 26 Eylül M29 test zincirinden kalan şüpheli salon-havuzu ilişkilerinin artık audit tarafından bulunmadığını doğruladı. M30.2 **PASS** kabul edildi.

M30 kapanış durumu:

- M30.1 öğretmen havuzu temizliği: **PASS**
- M30.2 salon havuzu temizliği: **PASS**
- M29.2/M29.3 geçici havuz genişletme yan etkileri için bilinen test artıkları temizlendi.
- M29 placement resource override mimarisi kapalı ve kabul edilmiş durumda.
- M29/M30 yeniden açılmayacak; yalnız yeni bir regression veya yeni teşhis kanıtı varsa geri dönülecek.

### Sonraki iş paketi

Bir sonraki implementation aşaması:

**Otomatik / yarı otomatik yerleştirme — solitaire yaklaşımı**

Başlangıç ilkeleri:

- Mevcut candidate/conflict altyapısı yeniden kullanılacak.
- En az geçerli seçeneği olan / en kısıtlı kartlar önce değerlendirilecek.
- Açıkça güvenli yerleşimler önerilebilir veya kullanıcı kontrollü uygulanabilir.
- Belirsiz/çatışmalı durumlar otomatik zorlanmayacak.
- Grouped/atomic kart invariantları korunacak.
- M22 provisional resource semantiği korunacak: `UNKNOWN != ABSENT != UNAVAILABLE`.
- Mevcut placement resource override davranışı ve undo/redo zinciri bozulmayacak.
- Veri-mutating otomasyon başlamadan önce read-only öneri/planlama katmanı tercih edilecek.

Yeni oturumda `main` esas alınacak; eski `feat/management-m20-placement-recovery` branch'i çalışma branch'i olarak kullanılmayacak.


## 24. 28 Eylül 2026 — M31 UX Guidance & Polish başlangıcı

M30 veri temizliği kapanışı sonrası otomatik / yarı otomatik yerleştirmeye geçmeden önce ürünün yönetim UX'inde bir polish ara fazı açılmasına karar verildi.

Gerekçe: yönetim sistemi işlevsel ve güçlü hale geldi ancak kullanıcıdan fazla domain bilgisi bekliyor. Yeni otomasyon katmanı eklenmeden önce mevcut Program / Ders Planı / Kaynaklar / Program Durumu akışlarının kendi kendini açıklaması ve bağlamsal yardım sunması gerekiyor.

### M31 kapsamı

1. **M31.1 — ekran açıklamaları + Yardım merkezi**
   - Üst yönetim navigasyonunda kalıcı ama sade bir `? Yardım` girişi.
   - Çalışma alanından çıkarmayan sağ drawer yardım merkezi.
   - Aktif bölüme göre kısa “bu ekran ne işe yarar?” açıklaması.
   - Program, Ders Planı, Kaynaklar ve Program Durumu için temel iş akışları.
   - Ders Havuzu, Yerleşim, Belirsiz, ortak kart, Geri Al/Yinele gibi kavramların insan diliyle açıklanması.
   - Veri modeli / Supabase davranışı değişmeyecek; frontend-only polish.

2. **M31.2 — bağlamsal bilgi ve “Neden?”**
   - Karmaşık kavramlarda sınırlı `ⓘ` açıklamaları.
   - Geçersiz/uygun olmayan yerleşimlerde mevcut reason-code ve blocker altyapısını kullanıcı diliyle görünür kılma.
   - Her yere tooltip eklenmeyecek; görsel gürültüden kaçınılacak.

3. **M31.3 — kısa hızlı tur**
   - İlk kullanım için en fazla 5 adımlık tur.
   - Ders Havuzu, Program Alanı, uygunluk renkleri, Ayrıntılar, Geri Al/Yinele.
   - Yardım merkezinden yeniden başlatılabilir.

4. **M31.4 — terminoloji / boş durum / mikro metin polish**
   - Teknik iç terimleri kullanıcı dilinden uzak tutma.
   - Boş ekranları eylem odaklı açıklamalarla değiştirme.
   - Kritik işlemlerde kısa kapsam açıklamaları.

### UX ilkeleri

- Yardım sistemi ikinci bir karmaşa katmanı yaratmamalı.
- Üç seviye kullanılacak: ekranda kısa açıklama, gerektiğinde bağlamsal bilgi, kapsamlı detay için Yardım drawer'ı.
- Teknik terimler (`candidate`, `requirement`, `resource_mode`, `provisional`, `revision`) mümkün olduğunca son kullanıcı UI'sına sızmamalı.
- M29.4 ayrımı kullanıcıya açık anlatılmalı: yerleşimde öğretmen/salon değiştirmek yalnız o yerleşimi değiştirir; Ders Planı kaynak havuzunu değiştirmez.
- M31 sırasında mevcut grouped/atomic davranış, provisional resource semantiği, undo/redo ve publication altyapısı korunacak.
- M31.1 için migration yoktur.

### Sonraki sıra

Önce M31.1 uygulanıp browser/build doğrulaması yapılacak. Ardından M31.2–M31.4 tamamlanacak. Bunlar kapandıktan sonra otomatik / yarı otomatik yerleştirme paketi M32 olarak başlatılacak.


## 25. 28 Eylül 2026 — M31.1 / M31.2 UX polish acceptance

M31.1 Yardım Merkezi ve M31.2 bağlamsal yardım polish'i production/browser görüntüsü üzerinden kullanıcı tarafından kabul edildi.

### Kabul edilen davranış

- Üst yönetim navigasyonunda kalıcı `? Yardım` girişi bulunur.
- Yardım merkezi sağ drawer olarak açılır; çalışma alanı görünür kalır.
- Drawer aktif bölüme göre Program / Ders Planı / Kaynaklar / Program Durumu açıklamasını değiştirir.
- Dört ana bölüm kartları navigasyon görevi görür.
- Bölüm kartına basıldığında ana çalışma alanı ilgili bölüme geçer; yardım drawer'ı **açık kalır** ve siyah “Bu bölümdesiniz” kartı yeni bölüme taşınır.
- Yardım merkezi kompaktlaştırıldı; kavramlar açılır/kapanır detaylarla katmanlandı.
- Ders Havuzu / Yerleştirilecek dersler için bağlamsal bilgi eklendi.
- Havuz dili insanileştirildi:
  - Çalışma kuyruğu → Yerleştirilecek dersler
  - Çalışılabilir → Yerleştirilebilir
  - Zorunlu → Tek seçenek
  - Belirsiz → Bilgi eksik
  - Çelişki → Sorunlu
- Sağ Ayrıntılar panelinde:
  - Aday alanı → Yerleşim seçenekleri
  - Geçersiz → Uygun değil
  - Neden değil? → Neden uygun değil?
  - Uygun / Bilgi eksik / Uygun değil semantiği bağlamsal açıklamayla verilir.
  - Neden sayılarının toplamının “Uygun değil” sayısını aşabileceği, bir seçeneğin birden fazla nedenle elenebilmesiyle açıklanır.
- Yerleşimde öğretmen/salon değişikliğinin yalnız mevcut placement'ı etkilediği ve Ders Planı havuzunu değiştirmediği açıkça yazılır.
- Havuz boş durum metinleri kullanıcı eylemini açıklayacak biçimde iyileştirildi.

### İlgili commitler

```
66b076ab07c3c7e19f0ad2c1879df7a454daa741 feat: add management help center
9a4a81eca1f73f697484ce02d107eb753c01478b feat: wire management guidance into workbench
ad01260b609c3e55b472fd990d1f818fc6108950 polish: refine management help hierarchy
53aca81a088887195e6625f4ab3cebb30cec7511 polish: make help center actionable
7be6e3d8f88cea87d0696c2d0ab9bc02c9be0a8f polish: explain management work queue
e88e6662c9fdf5e136ac662fb4dec806cb3c0535 polish: add contextual placement guidance
d69a92309cff3a697f5165c8737e531fbb61a446 polish: humanize management pool language
5026cf36e98d9c5d0c17a5f3ea3a3fe2a140b9ff polish: clarify placement option language
3bb285a9cf9bb9a558c02913fed0b25455ed0717 polish: keep help open while navigating sections
```

Durum: **M31.1 ve M31.2 kabul edildi.**

### Sıradaki adım

M31.3 — en fazla 5 adımlık hızlı tur.

Hedef:
- yeni kullanıcıyı çalışma alanında kısa sürede yönlendirmek;
- turu zorunlu veya uzun hale getirmemek;
- Yardım Merkezi'nden tekrar başlatılabilir yapmak;
- tur sırasında hiçbir program verisini değiştirmemek.


## 26. 28 Eylül 2026 — M31.3 spotlight turu kabulü ve M31.4 başlangıcı

M31.3 hızlı tur, ilk statik modal sürümden sonra gerçek spotlight davranışına yükseltildi ve kullanıcı tarafından kabul edildi.

### M31.3 kabul edilen davranış

- Tur 5 adımdır: Ders Havuzu, Program Alanı, Uygunluk, Ayrıntılar, Geri Al/Yinele.
- Her adım ilgili gerçek UI alanını spotlight ile aydınlatır.
- Tur kartı hedef alanı kapatmamak için viewport boşluğuna göre sağ/sol/üst/alt konumlanır.
- İlk kullanımda bir kez otomatik açılır; tamamlandıktan sonra localStorage ile tekrar otomatik açılmaz.
- Yardım Merkezi içinden her zaman manuel yeniden başlatılabilir.
- 4. adımda Ayrıntılar kapalıysa mevcut yerleşmiş bir kart yalnızca UI seçimi olarak açılır; program verisi değiştirilmez.
- Mevcut program büyük ölçüde yerleşmiş olsa bile turun öğretici kalması için yalnız tur sırasında görünen, veriyle bağlantısız demo katmanları eklendi:
  - örnek havuz kartı,
  - sürükleme yönü + uygun hedef,
  - Uygun / Bilgi eksik / Uygun değil örnekleri,
  - Neden uygun değil? örneği,
  - Geri Al / Yinele açıklaması.
- Demo katmanları yalnız görseldir; Supabase veya program verisine yazmaz.

İlgili son checkpoint:

```
abfcb67d879d418f7c48eb3377a7fe6c68ed7e25
fix: keep tour demos prerender safe
```

Durum: **M31.3 kullanıcı tarafından kabul edildi.**

### M31.4 başlangıcı

Son terminoloji ve mikro metin turunda kullanıcı ekranına sızan iç mimari ifadeleri temizleme kararı alındı.

İlk yapılanlar:

- Ders Planı:
  - “Seçilebilir havuz” → “Birden fazla seçenek”
  - “Ders tanımı” → “Sınıf / grup planı”
  - “Dönem dışı / belirsiz” → “Aktif olmayanlar”
- Kaynaklar:
  - “Öğretmen ve salon envanteri” → “Öğretmenler ve salonlar”
  - kullanıcıya görünen `M18.7` etiketi kaldırıldı
  - “Atama kontrolü” → “Programda kullanılıyor”
- Program Durumu:
  - kullanıcıya görünen `M19.1` iç sürüm referansı kaldırıldı
- Ayrıntılar / Yardım:
  - “Seçilebilir havuz” → “Birden fazla seçenek”
  - Yardım Merkezi terminolojisi “Bilgi eksik” diliyle hizalandı

Bu fazda davranış veya veri modeli değişikliği yoktur; migration yoktur.


## 27. 28 Eylül 2026 — Partisyon marka kararı ve M31.4 son polish

Kullanıcı ürün adı için **Partisyon** kararını verdi.

### Marka kararı

Kullanıcıya görünen ürün adı:

```
Partisyon
MSGSÜ İstanbul Devlet Konservatuvarı
```

Alt tanım gerektiğinde:

```
Ders Programı ve Kaynak Yönetimi
```

Uygulama metadata/PWA kısa adı `Partisyon` olarak güncellendi. Yönetim girişinde ve yönetim çalışma alanı marka satırında Partisyon kullanılır. Repository ve teknik isimler bu aşamada değiştirilmedi.

### Öğretmen durum terminolojisi

Öğretmen kaynaklarında `Aktif / Pasif` kullanıcı dili kaldırıldı:

- `Atamaya açık`
- `Atamaya kapalı`
- `Atamaya kapalıları göster / gizle`
- `Atamaya aç / Atamaya kapat`

Bu değişiklik yalnız kullanıcı dili içindir; backend enum değerleri `ACTIVE / INACTIVE` olarak kalır.

### M31.4 teknik dil temizliği

Program Durumu / yayın öncesi ekranlarında kullanıcıya sızan iç implementasyon terimleri temizlendi:

- `M19.4`, `M19.1` kullanıcı ekranından kaldırıldı.
- `Baseline` → mevcut yayın / karşılaştırma kaynağı
- `Revision` → taslak sürümü
- `session-group` → grup kaydı
- `Runtime düzeltmeleri` → son program değişiklikleri
- `state-token`, `atomik publication`, `mutation`, `revision lifecycle` gibi teknik açıklamalar kullanıcı metninden çıkarıldı.
- Yayın karşılaştırmasındaki `eşleme / taslak zinciri` dili sadeleştirildi.

İlgili marka ve M31.4 commit zincirinin son remote HEAD'i:

```
afa8355c344fbf9fc557838b403a0ff013de0c6d
polish: simplify publication comparison copy
```

Durum: **M31 tamamlandı ve kullanıcı tarafından kabul edildi. Migration yok.**


## 28. 28 Eylül 2026 — M32.1 güvenli Yerleştirme Asistanı

M31 kullanıcı kabulüyle kapatıldı. M32 otomatik / yarı otomatik yerleştirme fazı **kontrollü öneri motoru** yaklaşımıyla başlatıldı.

### M32 ürün ilkesi

İlk sürüm “programı kendi başına dolduran kara kutu” değildir.

Akış:

1. Mevcut görünümde havuzdaki dersleri sınıflandır.
2. Önce yalnız **Tek seçenek** görünen dersleri ele al.
3. Her tek seçenekli ders/grup için candidate domain'i yeniden hesapla.
4. Gün + saat + öğretmen + salon sonucu gerçekten tek ve kesin ise kullanıcıya öner.
5. Birden fazla kaynak veya zaman seçeneği varsa otomatik karar verme.
6. Kullanıcı `Bu öneriyi uygula` demeden program verisini değiştirme.
7. Bir öneri uygulandıktan veya program başka bir yoldan değiştikten sonra kalan önerileri stale say; yeniden analiz zorunlu olsun.

### M32.1 implementation

Yeni dosyalar:

- `lib/managementPlacementAssistant.ts`
  - havuzdaki görsel ders gruplarını `SINGLE_OPTION / CHOICES / INFO_MISSING / PROBLEM` olarak sınıflandırır.
  - grouped common cards için source card kimliklerini korur.
  - fresh candidate detail içinden tüm source card'lar için tek ortak slotu doğrular.
  - aynı slotta birden fazla öğretmen/salon kombinasyonu varsa otomatik öneri üretmez.
  - provisional NULL teacher/room semantiğini korur.
- `components/management/ManagementPlacementAssistant.tsx`
  - Partisyon · Yerleştirme Asistanı modalı.
  - Tek seçenek / Seçim gerekiyor / Bilgi eksik / Sorunlu özetleri.
  - doğrulanmış öneriler ve tekil `Bu öneriyi uygula` işlemi.
  - kullanıcıya otomasyon güvenlik kuralını açıklar.
- `lib/managementPlacementAssistant.test.ts`
  - tek seçenek sınıflandırması,
  - grouped source card'larda tek ortak güvenli slot,
  - aynı slotta çoklu kaynak seçeneğinde otomatik öneriyi reddetme senaryoları.

Workbench:
- Program araç çubuğuna `✦ Asistan` girişi eklendi.
- Analiz, mevcut `management_refresh_card_group_candidates` ve candidate detail altyapısını yeniden kullanır.
- Uygulama, mevcut single/bundle place komutlarını kullanır; yeni DB write yolu oluşturulmadı.
- Candidate refresh işlemleri DB yükünü sınırlamak için tek seçenekli gruplarda **sıralı** yürütülür.
- Her `refreshToken` değişiminde eski asistan önerileri geçersizleştirilir.

### Güvenlik sınırı

M32.1'de:
- toplu “hepsini uygula” yok,
- birden fazla olasılıkta otomatik seçim yok,
- yeni placement RPC yok,
- yeni migration yok,
- mevcut undo/redo ve grouped atomic sözleşmesi korunur.

Son implementation HEAD (henüz local doğrulanmadı):

```
44c503afa86ce33e9bf4e7b4eb16ebb75e2171e2
polish: align teacher command wording
```

Durum: **local focused test + build + browser doğrulaması bekleniyor.**


## 29. 28 Eylül 2026 — M32.2 kısıt öncelikli yarı otomatik akış

Kullanıcı gerçek browser testi için Program'dan üç görsel ders kartını kaldırdı:

- Matematik `5A + 5B` → 2 underlying kayıt
- Türkçe `5A + 5B` → 2 underlying kayıt
- V. Kondisyon `5A` → 1 underlying kayıt

Bu nedenle havuz doğru biçimde **3 kart · 5 kayıt** gösterdi.

M32.1 ilk sürümünde üç kartın da birden fazla uygun yeri olduğu için:

- Tek seçenek: 0
- Seçim gerekiyor: 3

görüldü ve `Önerileri hazırla` devre dışı kaldı.

Bu runtime testi M32.1'in güvenli fakat fazla temkinli olduğunu gösterdi. M32.2 hemen açıldı.

### M32.2 kabul edilen yön

Asistan artık yalnız zorunlu / tek seçenekli derslere bakmaz.

`SINGLE_OPTION` ve `CHOICES` derslerin tamamı için:

1. grouped source card candidate'ları yeniden hesaplanır;
2. her source card'ın geçerli zaman slotları çıkarılır;
3. yalnız tüm grouped kayıtlar için ortak olan gün/saatler tutulur;
4. dersler **ortak uygun saat sayısı artan sırada** gösterilir;
5. böylece “en kısıtlı ders önce” solitaire yaklaşımı uygulanır;
6. ortak slotta her source card için tek öğretmen/salon kombinasyonu varsa slot doğrudan `Uygula` edilebilir;
7. aynı saatte birden fazla kaynak kombinasyonu varsa asistan kaynak seçmez ve `Ayrıntılarda incele` akışına bırakır.

Bu sıralama “en iyi saat” iddiası değildir; nesnel olarak **daha az esnek dersi önce ele alma** kuralıdır.

### UI değişimi

Başlık:

```
En kısıtlı dersten başlayın
```

Analiz CTA:

```
Seçenekleri hazırla
```

Analiz sonrası her ders için:

- sıra numarası,
- ortak uygun saat sayısı,
- doğrudan uygulanabilir saat sayısı,
- kaynak seçimi gerektiren saat sayısı,
- ilk 5 doğrudan seçenek,
- gerekirse diğer seçenekleri açma,
- `Uygula`,
- `Ayrıntılarda incele`

gösterilir.

Bir seçenek uygulandıktan sonra kalan analiz stale olur; yeniden hesaplama zorunludur.

Yeni DB write yolu veya migration yoktur.

İlgili implementation zinciri:

```
e2c7d8eba27865e098bc4d52be1839e17e77db20 feat: rank placement choices by constraint
2f2e545502f3fbeb0efd52ca205e121a3f6ded98 feat: guide ambiguous placements by constraint
c34bbe8af851228c20ad6daf503595ae2ac8baf0 feat: rank and expose placement choices
1c2744f022382e2209c83a5f9e4e9ffffe3d4642 test: cover constraint-ranked placement choices
```

Durum: **local focused test + build + aynı 3 kartlık browser senaryosu bekleniyor.**


## 30. 28 Eylül 2026 — M32.2 stale-board yarış koşulu düzeltmesi

Gerçek browser testinde şu hata yakalandı:

1. Matematik `5A + 5B` için Asistan'daki ilk seçenek `Uygula` ile başarıyla yerleştirildi.
2. Yerleşim DB tarafında doğru oluştu.
3. Kullanıcı hemen `Yeniden hesapla` dedi.
4. Ana workbench board refresh'i henüz tamamlanmadığı için Asistan eski React board snapshot'ını kullandı.
5. Matematik hâlâ havuzdaymış gibi yeniden plan listesine girdi.

Screenshot'ta bu yarış koşulu soldaki havuzun hâlâ `3` göstermesiyle doğrulandı.

### Fix

İki katmanlı koruma eklendi:

- Bir Asistan seçeneği uygulandıktan sonra normal workbench refresh döngüsü `dataLoading: false → true → false` tamamlanana kadar `Yeniden hesapla` kapalı tutulur.
- Bu sırada CTA `Program güncelleniyor…` gösterir.
- Asistan analizi her başlatıldığında mevcut client board'a güvenmez; önce `fetchManagementBoard` ile **taze server board snapshot'ı** alır.
- Havuz grupları bu taze board'dan yeniden oluşturulur.
- Böylece yerleşmiş kart, UI refresh gecikse bile yeni analize tekrar giremez.
- `runCandidateCommand` ve `runDropCandidates` success/failure döndürür; refresh bekleme kilidi yalnız başarılı placement sonrasında tutulur.
- Regression testi: yerleşmiş kartın placement assistant queue'ya hiç girmediği doğrulanır.

İlgili commitler:

```
e89e3c336b5bfa0860a25425470a3c5cfb0aaaf2 fix: prevent stale assistant reanalysis after placement
45c9ec0da7701c8e3c6076d14fecb915ca01280c polish: show assistant refresh state
520c3e7ca6069ecb806201c821945ae20929fc67 test: exclude placed cards from assistant queue
```

Durum: **local focused test + build + aynı Uygula → Yeniden hesapla browser regresyon testi bekleniyor.**


## 31. 28 Eylül 2026 — M32.2 kullanıcı kabulü

M32.2 kısıt öncelikli Yerleştirme Asistanı ve stale-board yarış koşulu düzeltmesi gerçek browser regresyon testiyle doğrulandı.

Kullanıcı doğrulama akışı:

1. Havuzda Matematik `5A + 5B`, Türkçe `5A + 5B`, V. Kondisyon `5A` bırakıldı.
2. Asistan adayları güncelledi ve dersleri ortak uygun saat sayısına göre sıraladı.
3. Matematik için ilk seçenek `Uygula` ile yerleştirildi.
4. Program refresh döngüsü tamamlandı.
5. `Yeniden hesapla` sonrası Matematik artık havuz / Asistan listesine geri girmedi.

Durum: **M32.2 PASS / kullanıcı kabulü.**

Kabul edilen M32 davranışı:

- Tek seçenek yoksa Asistan durmaz.
- Dersleri en az ortak uygun saatten en çoğa sıralar.
- Doğrudan uygulanabilir gün/saatleri listeler.
- Kaynak seçimi belirsizse otomatik karar vermez.
- Bir placement sonrası kalan analiz stale olur.
- Refresh tamamlanmadan yeniden hesaplama açılamaz.
- Her analiz taze server board snapshot'ıyla başlar.
- Yerleşmiş kart queue'ya tekrar girmez.

Son doğrulanmış implementation zinciri:

```
e89e3c336b5bfa0860a25425470a3c5cfb0aaaf2 fix: prevent stale assistant reanalysis after placement
45c9ec0da7701c8e3c6076d14fecb915ca01280c polish: show assistant refresh state
520c3e7ca6069ecb806201c821945ae20929fc67 test: exclude placed cards from assistant queue
ee2735e430deaf795552d2aef0a46429a64a0679 fix: guard fresh assistant board snapshot
72d0aa6685ce8abddd812d8a6e6a04dee1d74c8b fix: match placement test fixture type
```

### Sonraki yön — M32.3

Amaç: Asistan yalnız mevcut seçenek sayısını göstermesin; bir seçeneğin uygulanmasının diğer havuz derslerinin esnekliğini ne kadar azaltacağını da önceden değerlendirsin.

İlk prensip:
- kullanıcı adına otomatik karar yok;
- “en iyi seçenek” hükmü yok;
- seçenek etkisi açıklanabilir metriklerle gösterilecek;
- örn. `bu seçimden sonra 2 dersin uygun saat sayısı azalır`;
- mevcut candidate / conflict altyapısı yeniden kullanılacak.


## 32. 28 Eylül 2026 — M32.2.1 late-stage PLACE timeout

M32.2 browser testinde, program 155/159 yerleşmiş durumdayken havuzdaki Solfej `5A + 5B` / `×3 ders` kartı için doğrudan uygulanabilir bir seçenek seçildiğinde normal `management_place_card` RPC'si statement timeout verdi.

Ekran kanıtı:
- işlem öncesi Asistan Solfej için 7 ortak uygun saat, 1 doğrudan uygulanabilir saat gösterdi;
- `Uygula` sonrası hata toast'ı: `İşlem beklenenden uzun sürdü ve zaman aşımına uğradı`;
- yerleşim sayısı 155 ve havuz 4 olarak kaldı; işlem commit edilmedi.

İlk varsayım bundle timeout idi; havuz sayısı / kart yapısı yeniden okununca Solfej'in tek gerçek kart ve `×3` değerinin duration olduğu görüldü. Sorun normal single PLACE yolundadır.

### Kök neden

M15 `refresh_management_candidate_domain_delta` fonksiyonu her occupancy değişiminden sonra:
- değişen grup,
- öğretmen,
- salon
ile ilişkili olabilecek kartları ararken **zaten yerleşmiş kartları da** impacted set'e dahil ediyordu.

Program sonlarına gelindiğinde havuzda yalnız birkaç kart kalmasına rağmen 150+ yerleşmiş kartın candidate satırları gereksiz yere yeniden değerlendirilebiliyordu. Forced/contradiction seçimi yalnız yerleşmemiş kartları kullandığı için bu bakım canlı mutation yolunda gerekli değildir. Yerleşmiş bir kart daha sonra taşınacaksa hedef candidate zaten canlı doğrulanır / grup refresh'i çalışır.

### M32.2.1 migration

Yeni migration:

```
20260928212500_management_m32_2_1_late_stage_place_performance.sql
```

Değişiklik:
- `refresh_management_candidate_domain_delta` impacted kart setine
  `not exists (select 1 from placements where card_id = card.id)`
  filtresi eklendi.
- Gün/saat overlap, öğretmen, salon ve instructional-group conflict kuralları değişmedi.
- exact target validation, forced propagation, undo/redo ve publication sözleşmesi değişmedi.
- frontend değişikliği yok.

Commit:

```
fa98b7e2a1f2e3919d5653edb37c645ce589cd70
perf: skip placed cards in delta refresh
```

Durum: **migration local dry-run + production push + aynı Solfej Uygula regresyon testi bekleniyor.**


## 33. 28 Eylül 2026 — M32.3 ders–şube öğretmen sürekliliği

Kullanıcı temel program kuralını netleştirdi:

> Bir şube için bir dersi bir öğretmen vermeli. Ders haftada birden fazla bloktan oluşuyorsa, ilk blokta seçilen öğretmen diğer bloklarda da aynı olmalı.

Örnek:
- 5A Matematik haftada 3 ayrı blok ise 3 farklı Matematik öğretmeni kullanılamaz.
- Requirement'ın öğretmen havuzu birden fazla öğretmen içeriyorsa bu havuz yalnız ilk resolved öğretmen seçilene kadar seçim alanıdır.
- İlk resolved yerleşim öğretmeni requirement seviyesinde fiilî kilit oluşturur.
- Sonraki blok candidate'ları yalnız bu öğretmenle geçerli olabilir.
- Salon bu kurala dahil değildir; bloklar farklı salonlarda olabilir.
- M22 provisional UNKNOWN teacher semantiği korunur: resolved öğretmen yokken NULL/provisional kimlik kural dışı sayılmaz.

### Implementation

Yeni migration:

```
20260928223000_management_m32_3_requirement_teacher_continuity.sql
```

Migration üç seviyede koruma sağlar:

1. **Mevcut veri guard'ı**
   - Aynı revision + requirement içinde birden fazla farklı resolved teacher zaten varsa migration fail eder.
   - Böylece yeni invariant çelişkili veri üstüne sessizce kurulmaz.

2. **Hard placement invariant**
   - `placements` üzerinde BEFORE INSERT/UPDATE trigger.
   - Aynı requirement/revision içindeki başka resolved teacher ile farklı yeni resolved teacher yazılamaz.
   - Provisional NULL teacher M22 gereği hard trigger tarafından bloke edilmez.

3. **Candidate-domain lock**
   - Yeni reason code:
     `REQUIREMENT_TEACHER_MISMATCH`
   - İlk resolved sibling placement öğretmeni bulunduğunda kalan blokların farklı öğretmen candidate'ları INVALID olur.
   - Exact validation / delta revalidation bu kuralı uygular.
   - Group candidate refresh sonrası aynı teacher lock postprocess edilir.
   - Kalan havuz domain summary'leri yeniden hesaplanır.

UI dili:
- `REQUIREMENT_TEACHER_MISMATCH` →
  “Bu dersin diğer bloklarında farklı bir öğretmen kullanılıyor”
- Hard write guard hatası →
  “Aynı şubenin aynı dersi tüm bloklarda aynı öğretmenle yürütülmeli.”

İlgili commitler:

```
a2512f1e1b06fc507a7a4991e22c68cd5449457f feat: lock course blocks to one teacher
98d2d069fb2312262328ccccea2bc94ff9ee20ac polish: explain course teacher continuity
7f290dd6013b4bac30d76104f90237b437a4c762 polish: translate teacher continuity errors
```

Durum: **migration dry-run / production push / gerçek multi-block ders regresyon testi bekleniyor.**


## 34. 28 Eylül 2026 — M32.3 yeniden tasarım: teacher assignment policy

İlk M32.3 yaklaşımı bütün requirement'larda “tek öğretmen” sürekliliğini hard constraint yapmaya çalıştı. Production push guard'ı aktif taslakta 14 requirement'ın birden fazla resolved teacher kullandığını gösterdi. Read-only diagnostic ile 10A/10B Matematik gerçek continuity ihlali olarak; Bale ve Solfej gibi dersler ise blok bazında öğretmen esnekliğinin meşru örnekleri olarak ayrıştı.

Kullanıcı Solfej'in müzik bölümünde Bale gibi esnek olduğunu açıkça belirtti.

Dış araştırma:
- FET official mode teacher allocation yapmaz; exact teacher activity'nin girdisidir. Teacher allocation ayrı bir planning problemidir.
- aSc aynı öğretmeni koruma gibi ilişkileri ayrı constraint olarak destekler.
- UniTime feasibility → optimize → suggestions → human assign/commit akışı kullanır.
- Timefold hard/soft constraint scoring ayrımını açıkça modeller.
- Bilsa öğretmen yükü, sınıf zaman kısıtları ve merkezi/e-Okul entegrasyonunu ayrı katmanlar olarak sunar.

Mimari karar:
- `teacher_mode` korunur ve yalnız “kimler uygun?” sorusunu yanıtlar:
  `FIXED | ELIGIBLE_POOL | UNKNOWN`.
- Yeni politika “seçim hangi kapsamda yapılır?” ve “bloklar arası süreklilik ne kadar güçlü?” sorularını ayırır:
  - `teacher_assignment_scope = REQUIREMENT | BLOCK | UNSPECIFIED`
  - `teacher_continuity = REQUIRED | PREFERRED | NONE`
- Hedef kombinasyonlar:
  - REQUIREMENT + REQUIRED → Matematik/Türkçe vb. tek öğretmen
  - BLOCK + NONE → Bale/Solfej gibi bağımsız blok öğretmenleri
  - BLOCK + PREFERRED → farklı öğretmene izin ver, solver sürekliliği tercih et
  - UNSPECIFIED + NONE → legacy/manual-compatible; full-auto readiness warning

Detaylı ADR:
```
docs/TEACHER_ASSIGNMENT_POLICY_AND_SOLVER_DESIGN.md
```

M32.3 migration önceki hard-lock tasarımından **davranış değiştirmeyen policy foundation** haline getirildi:
```
20260928223000_management_m32_3_requirement_teacher_continuity.sql
```

Yeni migration:
- placement değiştirmez
- candidate rebuild etmez
- hard teacher trigger kurmaz
- iki yeni course_requirements policy kolonu ekler
- yüksek güvenli backfill:
  - BALLET group → BLOCK + NONE
  - Solfej → BLOCK + NONE
  - SECTION + ACADEMIC → REQUIREMENT + REQUIRED
  - kalan FIXED → REQUIREMENT + REQUIRED
  - diğer belirsiz pool'lar → UNSPECIFIED + NONE
- `management_diagnose_teacher_assignment_policy(uuid)` read-only audit RPC ekler:
  - REQUIRED continuity violations
  - UNSPECIFIED multi-block pools
  - flexible multi-teacher requirements
  - fullAutoReady

Implementation:
```
7ea3ed11e657b82be287df3a5cea78df5f21e04f docs: design solver-ready teacher assignment policy
118531d3f264866c7cd69e4b018acd0c3c3847fc refactor: replace teacher lock with policy foundation
116d0bff2b8a1b7599f76e0e7a123375e339e384 docs: add teacher policy audit helper
```

Sonraki güvenli sıra:
1. M32.3A production dry-run/push.
2. Audit çıktısını al.
3. Course Plan'da teacher policy editor.
4. Mevcut UNSPECIFIED requirement'ları sınıflandır.
5. 10A/10B Matematik continuity ihlallerini açık kullanıcı kararıyla reconcile et.
6. Candidate engine'i policy-aware yap.
7. Placement-resource override'ı scope-aware yap.
8. Assistant option impact / soft penalty metrics.
9. Full-auto solver readiness ve immutable snapshot solver prototipi.


## 35. 28 Eylül 2026 — M32.3A production PASS ve ilk policy audit

M32.3A policy foundation production'a başarıyla uygulandı. Read-only audit gerçek aktif taslakta şu sonucu verdi:

- requirements: 193
- REQUIREMENT scoped: 117
- BLOCK scoped: 54
- UNSPECIFIED: 22
- fullAutoReady: false
- requiredContinuityViolations: 0
- unspecifiedMultiBlockPools: 6
  - 10A SECTION / Matematik
  - 10B SECTION / Matematik
  - 9A+9B MUSIC / ORKESTRA
  - 10A+10B MUSIC / ORKESTRA
  - 11A+11B MUSIC / ORKESTRA
  - 12A+12B MUSIC / ORKESTRA
- flexibleMultiTeacherRequirements: 12
  - Ballet/Doğaçlama/Pilates esnek örnekleri
  - 5/6/7. sınıf Solfej örnekleri

Bu sonuç yeni modelin doğru ayrım yaptığını doğruladı:
- Ballet + Solfej farklı bloklarda farklı öğretmen kullanabildiği için ihlal sayılmıyor.
- Matematik henüz UNSPECIFIED kaldığı için continuity violation olarak görünmüyor; policy atanması gerekiyor.
- Orkestra daha önceki ürün kararı gereği geniş esnek öğretmen havuzuna sahip ve blok bazında esnek olmalı.

M32.3.1 eklendi:

```
20260928223500_management_m32_3_1_teacher_policy_classification.sql
```

Davranış:
- SECTION Matematik → `REQUIREMENT + REQUIRED`
- ORKESTRA → `BLOCK + NONE`
- placement/candidate/public projection değiştirmez

Commit:
```
116bfa6d68063726c73a9a51f5726ac58cb30e82 feat: classify mathematics and orchestra teacher policy
```

Kalan tüm UNSPECIFIED requirement'ları görmek için read-only SQL:
```
docs/sql/m32_3_1_all_unspecified_teacher_policies.sql
```

Commit:
```
f42e01067d279dd1fd93318e74f8f728bd2afb09 docs: add unspecified teacher policy diagnostic
```

M32.3.1 production apply sonrası beklenen önemli değişiklik:
- unspecifiedMultiBlockPools → 0
- requiredContinuityViolations → 2 (10A ve 10B Matematik), çünkü mevcut placement'larda iki farklı resolved Matematik öğretmeni kullanılıyor.
- Bu iki ihlal otomatik düzeltilmeyecek; reconciliation kullanıcıya açıklanarak yapılacak.


## 36. 28 Eylül 2026 — M32.3.1 production PASS / M32.3.2 policy editor

M32.3.1 production sonrası audit:

- requirements: 193
- REQUIREMENT scoped: 119
- BLOCK scoped: 58
- UNSPECIFIED: 16
- unspecifiedMultiBlockPools: 0
- requiredContinuityViolations: 2
  - 10A SECTION / Matematik
  - 10B SECTION / Matematik
- flexibleMultiTeacherRequirements: 12
  - Ballet/Doğaçlama/Pilates örnekleri
  - 5/6/7. sınıf Solfej örnekleri

Bu sonuç policy modelini runtime veride doğruladı:
- Matematik artık REQUIREMENT + REQUIRED olduğu için mevcut iki-öğretmenli placement'lar gerçek violation olarak görünür.
- Orkestra BLOCK + NONE olduğu için artık unspecified multi-block pool değildir.
- Bale ve Solfej esnekliği korunur.

M32.3.2 eklendi:

```
20260928224000_management_m32_3_2_teacher_policy_editor.sql
```

RPC'ler:
- `management_preview_requirement_teacher_policy(uuid,text,text)`
- `management_apply_requirement_teacher_policy(uuid,text,text,text)`

Güvenlik:
- policy-only mutation
- placement değiştirmez
- candidate rebuild etmez
- public schedule değiştirmez
- REQUIREMENT + REQUIRED seçimi mevcut resolved placement'larda birden fazla öğretmen varsa bloke edilir
- stale-state token ile apply korunur

Course Plan UI:
- teacher policy her requirement satırında görünür
- UNSPECIFIED amber olarak görünür
- “Öğretmen kuralı” editorü:
  - Tüm bloklarda aynı öğretmen
  - Bloklar esnek, aynı öğretmen tercih edilsin
  - Her blok ayrı öğretmen seçebilir
  - Henüz belirlenmedi
- önce etki önizlemesi, sonra apply
- conflict varsa blok/gün/saat/öğretmen listesi gösterilir
- Course Plan üst özetinde “Öğretmen kuralı” belirsiz aktif ders sayısı görünür

Commitler:

```
f90c646b00fe55f709bc48b4c3cf06ed9937defd feat: add safe teacher policy editor contract
82a6954c503962eb6559ce1e915d3c127a181e27 feat: expose teacher assignment policy in course plan
1d87f334d55c2c48f51771a385c8cd342584be70 feat: add teacher policy editor
d2f48e11c61503ca40f207568ed5e52e9db21636 feat: expose teacher policy in course plan
70bf8446149f6b678a5c1aaf5c348370941a428c feat: wire teacher policy editor
8a05428d9a52d22d1d4cd1774b1b33cc6a78b267 polish: surface unspecified teacher policies
```

Kalan read-only sınıflandırma sorgusu:

```
docs/sql/m32_3_1_all_unspecified_teacher_policies.sql
```

Sonraki sıra:
1. M32.3.2 migration dry-run/push.
2. `npm.cmd run build`.
3. Course Plan policy editor browser smoke test.
4. Kalan 16 UNSPECIFIED audit çıktısını sınıflandır.
5. 10A/10B Matematik için explicit teacher reconciliation UX.
6. Candidate engine'i REQUIREMENT/BLOCK/PREFERRED policy-aware yap.
7. M29 placement teacher override'ını policy-aware yap.
8. Assistant forward-impact metrics.
