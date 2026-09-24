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
| Aktif branch | `feat/management-m20-placement-recovery` |
| Son implementation checkpoint | `12e0e38f7811cf24dd009051606750dbc273d879` |
| Commit | `fix: make orchestra and improvisation teacher pools flexible` |
| Son kullanıcı-doğrulamalı UI checkpoint | `111d151a99cc868bc0212fc03dc0d4287a75696c` |
| Bir önceki kritik işlevsel checkpoint | `eb9535a421bf57914612f2c95f9be2e7baaffe05` |
| Kritik düzeltme | Provisional VALID adayların grouped placement içinde kullanılabilmesi |
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
