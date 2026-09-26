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
| Son doğrulanmış implementation checkpoint | `ff2654c3dfbe354f2535a88d6b187a5bdf1ec8be` |
| Implementation commit | `fix: stabilize placement resource overrides` |
| Production/documentation HEAD (26 Eylül başlangıcı) | `48cfbe8b8ea55c586b8c9f94974ac6fdcc6bb2c2` |
| Son kullanıcı kabulü | M29.1–M29.5 placement resource override tamamlandı; Geri Al/Yinele doğrulandı |
| Sıradaki iş paketi | Öğretmen havuzu read-only veri teşhisi |
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
git switch feat/management-m20-placement-recovery
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

Durum: **GitHub'a commit edildi; remote apply henüz yapılmadı.**
