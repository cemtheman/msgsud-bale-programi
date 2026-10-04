# MSGSÜ Ders Programı — Çalışma Kaydı ve Oturum Checkpoint'i

> Bu dosya yönetim modülü için kalıcı çalışma hafızasıdır.
> Yeni bir oturumda kod değiştirmeden önce bu dosyanın tamamı okunmalıdır.
> Oturum sonunda yapılan işler, kararlar, test sonucu, migration durumu ve yeni checkpoint SHA'ları bu dosyaya eklenmelidir.
> Amaç proje geçmişini her oturumda yeniden keşfetmemek ve kullanıcının çalışma yöntemimizi tekrar tekrar hatırlatmak zorunda kalmamasıdır.

## 1. Güncel çalışma noktası

| Alan | Değer |
|---|---|
| Repository | `cemtheman/msgsud-bale-programi` |
| Aktif çalışma ortamı | `GitHub Codespaces` |
| Aktif çalışma dizini | `/workspaces/msgsud-bale-programi` |
| Aktif branch | `feat/management-workspace-v1` |
| Son doğrulanmış implementation checkpoint | `754560f95680643eb81d8137eebb7028c1db2cee` — Workspace UI checkpoint 3 PASS; grouped inspector move fixed, grouped local MOVE/REMOVE + one-step Undo/Redo accepted |
| Aktif implementation checkpoint | `754560f95680643eb81d8137eebb7028c1db2cee` — grouped local workspace interaction accepted in browser |
| Implementation commit | `revert: restore M39.1 stable application code` + `revert: restore M39.1 database behavior` |
| Son documentation checkpoint | Management Workspace v1 Phase 1–2 + first browser acceptance documented |
| Son kullanıcı/QA kabulü | **Workspace UI checkpoint 3 PASS** — grouped MOVE/REMOVE local, sibling resource preservation works, one-step Undo/Redo works, dirty-state guards visible |
| Sıradaki iş paketi | **Atomic Save/Commit RPC: diff → stale baseline/version/hash guard → server hard validation → single transaction apply/rollback** |
| Stack | Next.js 16.3.4, React 19, TypeScript, Vitest, Supabase |
| Build | `npm run build` → `next build --webpack` |
| Aktif dönem | 2026–2027 / 1. dönem |

Not: M40/M40.1 acceptance sırasında yönetim ekranı ve drag/drop regresyonları oluştu. Yeni özellik geliştirme durduruldu. Uygulama kaynak kodu M39.1 stable checkpoint `980b848...` ile birebir geri yüklendi. Uygulanmış M40/M40.1 migration geçmişi silinmedi; `20261003150000_management_rollback_m40_to_m39_1.sql` ile DB davranışı M39.1'e döndürülecek.

## 2. Çalışma yöntemi — değişmez sözleşme

Kullanıcı patch uygulamaz. Kod değişikliği gerekiyorsa asistan GitHub üzerinden ilgili dosyaları inceler, değişikliği yapar, commit eder ve branch'e push eder. Kullanıcıya normal akışta yalnızca `git pull --ff-only`, gerekirse build/test ve Supabase migration komutları verilir.

Remote mutation öncesinde branch HEAD mutlaka tekrar okunur. Beklenen SHA değişmişse eski HEAD üzerine körlemesine commit atılmaz; önce yeni durum incelenir. Force push yapılmaz. Değişiklikler küçük, tek amaçlı ve geri alınabilir commitler halinde tutulur.

Veritabanı davranışı değişmiyorsa migration yazılmaz. Migration gerekiyorsa yeni timestamp'li migration oluşturulur; daha önce uygulanmış migration dosyaları geriye dönük düzenlenmez. Aktif ortam Codespaces olduğu sürece kullanıcıya önce `npx supabase migration list`, sonra `npx supabase db push --dry-run`, yalnızca beklenen migration görünüyorsa `npx supabase db push` akışı verilir.

Sorun teşhisinde ekran görüntüsü/video ve gerçek runtime davranışı kaynak koddaki varsayımlardan önce gelir. Görselde bir şeyi “browser ghost”, “cache”, “gerçek conflict” vb. diye ilan etmeden önce kanıt aranır. Spekülatif SQL migration eklemekten kaçınılır; reason code veya gerçek blocker gerekirse önce read-only diagnostic eklenir.

Yanıt dili Türkçedir. **Aktif ortam GitHub Codespaces'tir. Kullanıcı ortam değişikliğini açıkça bildirene kadar bütün terminal komutları Codespaces/Linux biçiminde verilir.** Kullanıcı ortam değiştirdiğinde bunu asistanla paylaşacak; asistan da aynı oturumda AGENTS.md ve continuation handoff içindeki aktif ortam bilgisini güncelleyecek. Kullanıcı teknik olarak yetkindir; gereksiz temel anlatım yapılmaz.

## 3. Yeni oturum başlangıç protokolü

Yeni oturumda ilk iş bu dosya okunur. Aktif ortam burada `GitHub Codespaces` olarak kayıtlıysa ve kullanıcı ortam değişikliği bildirmediyse aşağıdaki akış kullanılır:

```bash
cd /workspaces/msgsud-bale-programi
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD
git status --short
```

**Ortam sürekliliği sözleşmesi:** Son bildirilen çalışma ortamı yeni bir bildirim gelene kadar geçerlidir. Asistan eski Windows/Mac komutlarına kendiliğinden dönmez. Kullanıcı ortam değişikliğini bildirdiğinde bu bölüm ve continuation handoff aynı oturumda güncellenir.

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


## 37. 29 Eylül 2026 — M32.3.3 teacher requirement semantics

Kalan 16 `UNSPECIFIED` requirement'ın tamamı read-only audit ile aynı kategori çıktı:

- subject: `KULÜP DERSLERİ`
- groups: 5A..12B SECTION
- teacher_mode: UNKNOWN
- eligible_teacher_count: 0
- card_count: 1
- placed_block_count: 1
- distinct_resolved_teacher_count: 0

Bu kayıtlar “öğretmeni henüz bilinmiyor” değildir. Mevcut ürün kuralına göre Kulüp dersleri öğretmensiz olabilir. Dolayısıyla `teacher_mode = UNKNOWN` iki farklı anlamı taşımaya başlamıştı:
1. öğretmen gerekli ama kimliği bilinmiyor
2. öğretmen gerekmiyor

Yeni mimari karar:
- teacher eligibility, assignment scope ve teacher requirement üç ayrı eksendir.
- Yeni kolon:
  `teacher_requirement = REQUIRED | OPTIONAL | NONE | UNSPECIFIED`

M32.3.3 migration:

```
20260929081000_management_m32_3_3_teacher_requirement.sql
```

Davranış:
- Kulüp dersleri → `teacher_requirement = NONE`
- Kulüp için assignment scope uygulanmaz:
  `teacher_assignment_scope = UNSPECIFIED`, `teacher_continuity = NONE`
- teacher_mode FIXED/ELIGIBLE_POOL → yüksek güvenle `REQUIRED`
- daha önce REQUIREMENT/BLOCK policy atanmış requirement → `REQUIRED`
- kalan gerçek belirsizlikler `UNSPECIFIED`
- placement/candidate/public projection değiştirilmez
- audit RPC aynı isimle v2 semantiğine yükseltilir:
  - teacherRequirementUnspecified
  - teacherNotRequiredRequirements
  - requiredTeacherMissingEligibility
  - requiredContinuityViolations
  - assignmentPolicyUnspecified
  - flexibleMultiTeacherRequirements
  - fullAutoReady
- full-auto readiness artık öğretmen gerekmeyen dersleri eksik öğretmen/policy saymaz.

Commit:

```
f13e9b567f53fcdbf97acd34c818798df3f5faf8 feat: separate teacher requirement from assignment policy
```

Önemli deployment sırası:
1. Önce M32.3.3 migration production'a uygulanacak.
2. Audit yeniden çalıştırılacak.
3. Ancak migration doğrulandıktan sonra frontend `teacher_requirement` kolonunu okumaya başlayacak.
Bu sıra, Vercel'in yeni frontend'i DB kolonundan önce deploy edip Course Plan fetch'ini kırmasını önler.


## 38. 29 Eylül 2026 — M32.3.3 audit sonucu / M32.3.4 OPTIONAL semantics

M32.3.3 production audit sonucu:

- requirements: 193
- REQUIREMENT scoped: 119
- BLOCK scoped: 58
- teacherNotRequired: 16
- teacherRequirementUnspecified: 0
- assignmentPolicyUnspecified: 0
- requiredContinuityViolations: 2
  - 10A Matematik
  - 10B Matematik
- teacherNotRequiredRequirements: 16 adet KULÜP DERSLERİ
- requiredTeacherMissingEligibility: 8
  - Sahne: 9A, 10A, 11A, 12A BALLET
  - B. Uygulama: 5A, 6A, 7A, 8A BALLET

Yeni semantik karar:
- KULÜP DERSLERİ → teacher_requirement = NONE
- Sahne ve Birlikte Uygulama / B. Uygulama → teacher_requirement = OPTIONAL
- OPTIONAL demek: Partisyon dedicated/resolved öğretmen kimliğini zorunlu tutmaz; mevcut veya gelecekte atanmış öğretmeni de engellemez.
- Bu ayrım tam otomasyonda sahte/sentetik öğretmen üretimini önler ve özel/pratik dersleri esnek bırakır.

Audit hatası da tespit edildi:
- full-auto readiness inactive requirement'ları da eksik kaynak sayabiliyordu.
- 5A B. Uygulama gibi dönemsel kapalı kayıtlar aktif solver readiness'i bloke etmemeli.
- M32.3.4 audit'i readiness ve blocker listelerini yalnız ACTIVE requirement'lar üzerinden hesaplar.

Migration:

```
20260929082500_management_m32_3_4_optional_teacher_semantics.sql
```

Commit:

```
e612c511ce52ec3537db67b749db036cedeb26aa fix: model optional teacher lessons and active readiness
```

Frontend teacher semantics:
- Course Plan fetch artık `teacher_requirement` okur.
- REQUIRED + eksik kimlik → “Öğretmen gerekli, henüz belirlenmedi”
- OPTIONAL + kimlik yok → “Öğretmen ataması isteğe bağlı”
- NONE → “Öğretmen gerekmiyor”
- NONE requirement'larda Öğretmen / Öğretmen kuralı düzenleme butonları gösterilmez.
- “Öğretmen eksik” sayacı yalnız REQUIRED dersleri sayar.
- Öğretmen kuralı belirsizlik sayacı NONE dersleri saymaz.

Commits:

```
caa3eab0bf4b0f6bf9d3ffb8cffdbe2f36f89316 feat: expose teacher requirement semantics
074f425e8af46034e37c32f48821afa35c835a7b polish: show teacher requirement semantics in course plan
```

M32.3.4 sonrası beklenen audit:
- teacherRequirementUnspecified = []
- assignmentPolicyUnspecified = []
- requiredTeacherMissingEligibility = []
- optionalTeacherRequirements → aktif Sahne/B. Uygulama kayıtları
- requiredContinuityViolations = yalnız 10A ve 10B Matematik
- fullAutoReady = false yalnız Matematik continuity conflict nedeniyle (öğretmen-policy eksikleri açısından)

Sonraki mimari iş:
Matematik reconciliation ayrı atomik workflow olacak. Bir requirement için tek öğretmen seçilecek; mevcut bütün yerleşmiş bloklar aynı zaman/oda korunarak bu öğretmene geçirilebiliyor mu önce preview edilecek. Teacher conflict/unavailability varsa apply bloke edilecek ve hangi blokların yeniden zamanlanması gerektiği gösterilecek. Sessiz teacher seçimi veya otomatik winner yok.


## 39. 29 Eylül 2026 — M32.3.4 PASS / M32.3.5 requirement teacher reconciliation

M32.3.4 production audit sonucu öğretmen politika katmanını temiz doğruladı:

- requirements: 193
- activeRequirements: 192
- requirementScoped: 119
- blockScoped: 57
- teacherNotRequired: 16
- teacherOptional: 9
- teacherRequirementUnspecified: 0
- assignmentPolicyUnspecified: 0
- requiredTeacherMissingEligibility: []
- requiredContinuityViolations: yalnız
  - 10A SECTION / Matematik
  - 10B SECTION / Matematik
- OPTIONAL listesi aktif Sahne / B. Uygulama kayıtlarını doğru gösterir.
- flexibleMultiTeacherRequirements Bale/Solfej esnekliğini korur.
- `fullAutoReady=false` öğretmen-policy audit bağlamında yalnız iki Matematik continuity violation nedeniyle kalır.

M32.3.5 amacı:
REQUIREMENT + REQUIRED bir derste mevcut placement'lar birden fazla öğretmen kullanıyorsa kullanıcı bir eligible öğretmen seçer; sistem bütün yerleşmiş blokları aynı gün/saat/salonla o öğretmene geçirmenin güvenli olup olmadığını önizler. Sistem öğretmeni kendi seçmez.

Migration:

```
20260929084000_management_m32_3_5_teacher_reconciliation.sql
```

RPC'ler:
- `management_preview_requirement_teacher_reconciliation(uuid, uuid)`
- `management_apply_requirement_teacher_reconciliation(uuid, uuid, text)`

Güvenlik:
- yalnız ACTIVE requirement
- yalnız `teacher_requirement in (REQUIRED, OPTIONAL)`
- yalnız `teacher_assignment_scope=REQUIREMENT + teacher_continuity=REQUIRED`
- seçilen öğretmen requirement'ın mevcut eligible pool'unda olmalı
- öğretmen ACTIVE olmalı
- gün/saat/salon değiştirilmez
- M29 placement-resource conflict preview yeniden kullanılır
- stale-state token ile apply korunur
- requirement teacher pool genişletilmez/değiştirilmez
- M29 bundle history/undo semantiği yeniden kullanılır
- apply sonrası her değişen blok için M15 delta candidate refresh yapılır
- teacher winner otomatik seçilmez

Implementation commits:

```
53ee441f2164c4a2df2a01081e2e6766afcca996 feat: add requirement teacher reconciliation
c61bedbe38854a529055d2fa904d2635e10c5b52 fix: keep reconciliation snapshot in transaction memory
176241b46a7a4b947302d353f4a95c97341ff859 feat: add teacher reconciliation client contract
074d7e65bfcad5351a73e02967980c8dac510766 feat: add teacher reconciliation flow
7d36de03b82747b62c425aaa66247c0f6c2a7a83 feat: wire teacher reconciliation into course plan
bede58f4ee705ed8f3476a7343039718c949fe39 feat: wire requirement teacher reconciliation
43e8ae3375346eaf2ee805d2ebe6ef8e4437caa9 polish: keep teacherless policy labels neutral
9fad5c0b9a5e56deb3fad30d6fdd8a819e58ccc1 polish: serialize teacher policy and reconciliation actions
e24eb4c2aa80edca70c0a6f0333b18137e86a083 docs: add teacher reconciliation option diagnostic
```

Course Plan / Öğretmen Kuralı UI:
- continuity conflict önizlenince uygun öğretmenler ayrı seçim olarak görünür
- seçilen öğretmen için “Uzlaştırmayı kontrol et”
- preview:
  - kaç blok öğretmen değiştirecek
  - gün/saat/salon korunabiliyor mu
  - teacher conflict blocker'ları
  - blok bazında eski → yeni öğretmen
- ancak canApply=true ise “Tüm bloklarda bu öğretmeni kullan”
- apply sonrası normal global refresh + undo/redo geçmişi

Read-only bütün seçenekleri yan yana teşhis:

```
docs/sql/m32_3_5_teacher_reconciliation_options.sql
```

M32.3.5 doğrulama sırası:
1. migration dry-run / push
2. `npm.cmd run build`
3. read-only reconciliation-options SQL
4. 10A/10B Matematikte iki öğretmen adayının canApply/conflict çıktısını incele
5. kullanıcı bir öğretmeni açıkça seçmeden apply yapma
6. reconciliation sonrası policy audit'te requiredContinuityViolations boşalmalı
7. ondan sonra candidate engine policy enforcement


## 40. 29 Eylül 2026 — M32.3.5 SQL Editor diagnostic fix

Supabase SQL Editor'da `docs/sql/m32_3_5_teacher_reconciliation_options.sql`
çalıştırıldığında şu hata görüldü:

```
M32.3.5 management EDITOR role required
```

Neden:
- diagnostic dosyası doğrudan
  `management_preview_requirement_teacher_reconciliation()` RPC'sini çağırıyordu.
- Bu RPC uygulama içi güvenlik gereği EDITOR management role ister.
- Supabase SQL Editor uygulamadaki `auth.uid()` / management-role bağlamını taşımaz.

Karar:
- Uygulama preview/apply RPC yetkileri GEVŞETİLMEDİ.
- Diagnostic SQL tamamen read-only hale getirildi ve aynı teacher-side güvenlik
  kontrollerini doğrudan tablolardan hesaplıyor:
  - teacher mevcut eligible pool'da
  - teacher ACTIVE
  - değişecek kart kilitli değil
  - dış placement teacher conflict yok
  - gün/saat/salon korunuyor
- Böylece SQL Editor teşhisi ile uygulama yetki modeli ayrıldı.

Commit:
```
5c15823bb4604481a17f4656f8813fcd0b2ca829 fix: make reconciliation diagnostic SQL-editor safe
```


## 41. 29 Eylül 2026 — M32.3.5 local preview'in sınırı / M32.3.6 coordinated preview

M32.3.5 read-only reconciliation option diagnostic sonucu:

10A Matematik:
- Öğretmen 1 → can_apply=false, 2 blok değişir
  - Salı 1'de 10B Matematik Öğretmen 1 ile çakışır
  - Çarşamba 9'da 10B Matematik Öğretmen 1 ile çakışır
- Öğretmen 2 → can_apply=false, 1 blok değişir
  - Salı 7–8 bloğu, 10B'nin Salı 8 Matematik Öğretmen 2 bloğuyla çakışır

10B Matematik:
- Öğretmen 1 → can_apply=false, 1 blok değişir
  - Salı 8 bloğu, 10A'nın Salı 7–8 Matematik Öğretmen 1 bloğuyla çakışır
- Öğretmen 2 → can_apply=false, 3 blok değişir
  - Salı 1 ve Çarşamba 9'da 10A Matematik Öğretmen 2 ile çakışır

Kritik çıkarım:
M32.3.5 tek requirement'ı mevcut occupancy'ye karşı değerlendirir. Burada iki requirement birbirini bloke ettiği için bütün tekli preview'lar false çıkıyor; fakat eşzamanlı final-state değerlendirmede iki geçerli tamamlayıcı plan var:

1. 10A → Matematik Öğretmeni 2
   10B → Matematik Öğretmeni 1
   toplam 2 blokta teacher change.
   Salı 7–8 karşılıklı conflict iki taraf aynı anda değişince ortadan kalkar.

2. 10A → Matematik Öğretmeni 1
   10B → Matematik Öğretmeni 2
   toplam 5 blokta teacher change.
   Salı 1 ve Çarşamba 9 karşılıklı conflict iki taraf aynı anda değişince ortadan kalkar.

Bu full-auto solver için genel bir ders:
- local/greedy variable validation global çözümü kaçırabilir;
- birbirine bağlı teacher assignment kararları FINAL coordinated state üzerinde değerlendirilmelidir;
- “tekli canApply=false” = “global çözüm yok” anlamına gelmez;
- optimizer objective olarak minimum changed blocks kullanılabilir, ama teacher winner sessiz/arbitrary seçilmemelidir.

M32.3.6 preview-only migration:

```
20260929090000_management_m32_3_6_coordinated_reconciliation_preview.sql
```

RPC:
```
management_preview_coordinated_teacher_reconciliation(jsonb)
```

Input:
```json
[
  {"requirementId":"...","teacherId":"..."},
  {"requirementId":"...","teacherId":"..."}
]
```

Davranış:
- 1..24 distinct requirement
- tek DRAFT revision
- ACTIVE + teacher-bearing + REQUIREMENT/REQUIRED policy
- teacher existing eligible pool'da ve ACTIVE
- gün/saat/salon final planda korunur
- conflict hesabı mevcut occupancy değil proposed FINAL teacher state üzerinden yapılır
- target-target swap/complement değişikliklerini birlikte görür
- locked changed card blocker
- no mutation / no apply
- SQL Editor postgres diagnostics allowed; authenticated caller still EDITOR

Commit:
```
b50ef07e4408faa975a5f6275b72da9247c821cf feat: preview coordinated teacher reconciliation
```

Current two violations için bütün teacher pairing'lerini enumerating read-only SQL:
```
docs/sql/m32_3_6_coordinated_teacher_options.sql
```

Commit:
```
e1a540fe2c4dd1a5afd3d260e502f6f23f5029f9 docs: add coordinated teacher option diagnostic
```

Beklenen current-data sonucu:
- 10A T2 + 10B T1 → canApply true, changedBlockCount 2
- 10A T1 + 10B T2 → canApply true, changedBlockCount 5
- aynı öğretmeni iki sınıfa veren eşleşmeler timetable overlap nedeniyle blocked olabilir
- hiçbir apply yapılmayacak; önce M32.3.6 runtime preview doğrulanacak

Apply/history için karar:
- M32.3.5 single apply iki requirement'a sırayla uygulanmayacak; bu false intermediate conflicts üretir.
- Bir sonraki coordinated apply atomik final-state write olmalı.
- Undo/redo da coordinated bundle semantics'i anlamalı; mevcut M29 same-resource bundle redo mantığı farklı teacher targets için doğrudan yeterli değildir.
- Bu nedenle M32.3.6 yalnız preview; coordinated apply/history ayrı migration'da tasarlanacak.


## 42. 29 Eylül 2026 — M32.3.6.1 UUID revision lookup fix

M32.3.6 production preview çağrısı SQL Editor'da şu hatayla durdu:

```
ERROR 42883: function min(uuid) does not exist
```

Neden:
- coordinated preview, tek DRAFT revision id'sini almak için `min(revision.id)`
  kullanıyordu.
- PostgreSQL UUID için `min(uuid)` aggregate sağlamıyor.
- Preview read-only olduğu için hata hiçbir placement/policy/publication verisini
  değiştirmedi.

M32.3.6 production'a uygulanmış olduğundan eski migration düzenlenmedi.
Yeni düzeltme migration'ı:

```
20260929090500_management_m32_3_6_1_uuid_revision_fix.sql
```

Fix:
```sql
(array_agg(distinct revision.id order by revision.id))[1]
```

Fonksiyonun geri kalan FINAL_COORDINATED_STATE semantiği değişmedi.

Commit:
```
3d4f703c972bfc1b7b514f5da29736e00fd2be0a fix: use UUID-safe coordinated revision lookup
```


## 43. 29 Eylül 2026 — M32.3.6 PASS / M32.3.7 coordinated apply + history

M32.3.6 final-state diagnostic PASS:

Geçerli çapraz planlar:
- 10A Matematik → Matematik Öğretmeni 2
  10B Matematik → Matematik Öğretmeni 1
  `canApply=true`, toplam 2 blok değişir.
- 10A Matematik → Matematik Öğretmeni 1
  10B Matematik → Matematik Öğretmeni 2
  `canApply=true`, toplam 5 blok değişir.

Geçersiz planlar:
- iki sınıf da Matematik Öğretmeni 1 → TEACHER_CONFLICT
- iki sınıf da Matematik Öğretmeni 2 → TEACHER_CONFLICT

Ürün/solver yorumu:
- 2-blok planı yalnız “mevcut programa en az müdahale” metriğinde daha düşük maliyetlidir.
- Öğretmen yükü/tercihleri henüz objective'e katılmadığı için sistem bunu “en iyi öğretmen dağılımı” diye seçmez.
- kullanıcı teacher assignment kararını açıkça verir; Partisyon final state'i birlikte doğrular.

M32.3.7 migration:

```
20260929092000_management_m32_3_7_coordinated_reconciliation_apply.sql
```

Yeni RPC:
- `management_apply_coordinated_teacher_reconciliation(jsonb,text)`
- `management_undo_coordinated_teacher_reconciliation(uuid)`
- `management_redo_coordinated_teacher_reconciliation(uuid)`

Davranış:
- M32.3.6 stateToken tekrar doğrulanır
- final coordinated preview canApply değilse apply yok
- bütün changed placement'lar tek DB transaction içinde yazılır
- gün/start/room korunur; yalnız teacher değişir
- requirement teacher pool değişmez
- bir changed card = bir USER/MOVE root
- bütün root'lar aynı bundle_id ve
  `bundle_engine_version=M32.3.7-coordinated-teacher` taşır
- different target teachers aynı bundle içinde desteklenir
- bütün placement writes bittikten sonra M15 delta candidate refresh çalışır
- converged final state ayrıca doğrulanır
- custom atomic undo exact before snapshots'e döner
- custom redo M32.3.6 FINAL_COORDINATED_STATE preview'i yeniden çalıştırır; safe değilse durur
- existing global `management_undo_bundle` / `management_redo_bundle`
  M32.3.7 bundle engine'i algılayıp custom path'e dispatch eder
- diğer M26/M29 bundle davranışları korunur

Commit:
```
33c49b14afa8ebd87ee34f041fa47dde7ede9795 feat: apply coordinated teacher reconciliation atomically
```

Frontend / Course Plan:
- `fetchManagementCoursePlan` teacher policy audit'i de getirir
- `teacherContinuityViolations` Course Plan data'ya eklenir
- stage'e ait continuity conflict varsa violet banner görünür
- “Birlikte çöz” resolver:
  - her conflict requirement için eligible teacher seçimi
  - hiçbir default/winner yok
  - tüm seçimler tamamlanınca FINAL_COORDINATED_STATE preview
  - changed block count, assignment bazlı impact ve conflict gösterimi
  - yalnız canApply=true ise “Koordineli uygula”
- apply sonrası global refresh; bundle history sayesinde normal Undo/Redo UI tek karar olarak çalışır

Commits:
```
7fd0d983ee19403ab69c52ae311221bb36a05449 feat: expose coordinated teacher reconciliation
7563a172f75518e196f91a895df69b1563c95b6d feat: add coordinated teacher continuity resolver
ef6631a750b429ac45c9d90650dbe53aca7d7797 feat: surface coordinated teacher continuity resolver
b7d97e384cef53d4cb9c11b704efeed418065c5f feat: wire coordinated teacher continuity actions
```

Rollback-only backend QA:

```
docs/sql/m32_3_7_coordinated_reconciliation_rollback_qa.sql
```

QA otomatik olarak yalnız test transaction'ında:
1. mevcut iki violation için valid planlar arasından en az changed-block planını seçer
2. preview → apply
3. audit: continuity violation 0
4. custom undo
5. audit: continuity violation 2
6. custom redo
7. audit: continuity violation 0
8. ROLLBACK

Production verisi QA sonunda değişmeden kalır.

Commit:
```
f2f20a87f9d8469a5392f9e1df939d8b3eb2ec95 test: add coordinated reconciliation rollback QA
```

M32.3.7 doğrulama mümkün olduğunca tek batch:
1. pull + HEAD
2. migration list + dry-run
3. db push
4. npm build
5. rollback-only SQL QA
6. browser Course Plan / Lise / “Birlikte çöz”
7. 10A T2 + 10B T1 seçimi ile preview (2 changed blocks beklenir)
8. apply yapılırsa global Undo/Redo smoke
9. teacher-policy audit requiredContinuityViolations=[] beklenir
10. ardından policy-aware candidate enforcement.


## 44. 29 Eylül 2026 — M32.3.7 production PASS / M32.4 runtime policy batch

M32.3.7 doğrulama:
- rollback-only QA SQL başarıyla tamamlandı. Supabase sonucu
  `Success. No rows returned` normaldir; DO block exception üretmedi ve sonunda ROLLBACK yaptı.
- browser Course Plan / Lise continuity resolver PASS.
- kullanıcı açıkça şu dağılımı seçti:
  - 10A Matematik → Matematik Öğretmeni 2
  - 10B Matematik → Matematik Öğretmeni 1
- preview: canApply=true, toplam 2 blok teacher change.
- gerçek production apply PASS.
- başarı toast:
  `2 blokta öğretmen dağılımı birlikte uzlaştırıldı. Gün, saat ve salonlar korundu.`
- Course Plan üst özetinde öğretmen eksik=0 ve öğretmen kuralı belirsiz=0 görüldü.
- production placement'larda gün/saat/salon korunarak yalnız iki teacher id değişti.

M32.4 toplu çalışma paketi:

### A. Policy-aware candidate read layer

`ManagementBoardCard` artık şunları taşır:
- teacherRequirement
- teacherAssignmentScope
- teacherContinuity
- resolvedRequirementTeacherId
- teacherContinuityConflict

Board fetch, active requirement policy kolonlarını okur ve mevcut placement'lardan
requirement bazında resolved teacher state türetir.

`applyManagementTeacherPolicyToCandidateDetail()`:
- yalnız REQUIREMENT + REQUIRED üzerinde filtre uygular
- requirement'ın yerleşmiş bloklarında tek teacher resolve olmuşsa diğer teacher
  candidate'larını INVALID yapar
- mevcut requirement zaten multi-teacher conflict durumundaysa teacher candidate'larını
  `REQUIREMENT_TEACHER_CONFLICT` ile bloke eder
- BLOCK + NONE/PREFERRED adaylarını değiştirmez
- raw DB candidate tablolarını mutate etmez; bu aşama read/runtime safety katmanıdır

Workbench şu akışlarda policy-aware candidate detail kullanır:
- Inspector
- drag hazırlığı
- deferred drop
- grouped candidate action
- Placement Assistant

Bu katman, raw domain-summary sayılarının DB'de yeniden yazılması değildir.
History-aware hard candidate-domain enforcement ayrı sonraki adımdır.

### B. M29 placement teacher override policy gate

Yeni migration:

```
20260929101500_management_m32_4_teacher_policy_runtime.sql
```

Yeni wrapper RPC'ler:
- `management_preview_placement_resource_change_v2(uuid[],text,uuid)`
- `management_apply_placement_resource_change_v2(uuid[],text,uuid,text)`

Davranış:
- mevcut M29 preview/apply/history motoru korunur
- TEACHER override için affected requirement'ların proposed FINAL placed teacher
  state'i hesaplanır
- REQUIREMENT + REQUIRED final state >1 teacher olacaksa:
  - canApply=false
  - reason `REQUIREMENT_TEACHER_MISMATCH`
  - `requiresRequirementWideTeacherChange=true`
- BLOCK scoped derslerde per-block override açık kalır
- ROOM override M29 davranışıyla aynı kalır
- apply requirement policy row'larını lock eder, v2 stateToken'ı yeniden doğrular,
  sonra history-safe mutation için M29'a delegasyon yapar
- naive placement trigger eklenmedi; coordinated undo'nun historical violation state'ini
  güvenli biçimde restore edebilmesi korunur

Frontend M29 preview/apply artık v2 RPC'lere gider.
Inspector blocker copy kullanıcıyı Ders Planı / Öğretmen Sürekliliği akışına yönlendirir.

### C. Placement Assistant policy impact + slot focus

Assistant plan yeni sinyaller taşır:
- policyFilteredCandidateCount
- policyTeacherLabels
- policyConflictCount

UI:
- `doğrudan uygulanabilir` gibi “en iyi/recommended” çağrışımı yapan eski copy kaldırıldı
- `N kaynak seçimi gerektirmiyor`
- `Öğretmen kuralı N adayı eledi`
- `Süreklilik: <teacher>`
- continuity conflict varsa önce uzlaştırma uyarısı

Eski slot-focus bug da kapatıldı:
- `Kaynak seç` tıklaması artık seçilen slotun day/start + primary candidates
  bilgisini Inspector'a taşır
- genel/generic candidate listesine düşmez

Slot chronology regression testi:
- Pazartesi ambiguous + Cuma exact durumunda Pazartesi slotu gizlenmez
- slots kronolojik kalır; exact slot yalnız kaynak seçimi gerektirmeyen seçenek olarak gösterilir

### D. Testler / audit

Güncellenen/eklenen testler:
- `lib/managementPlacementAssistant.test.ts`
  - ambiguous earlier slot chronology
  - assistant policy impact
- `tests/managementBoardClassRows.test.ts`
  - yeni board policy fixture alanları
- `tests/managementTeacherPolicyCandidates.test.ts`
  - REQUIREMENT+REQUIRED teacher filtering
  - BLOCK+NONE unchanged
  - unresolved continuity conflict blocks teacher choices

Read-only SQL audit:
```
docs/sql/m32_4_teacher_policy_runtime_audit.sql
```

Bu audit ACTIVE teacher-bearing requirements için:
- placed distinct teacher count
- resolved teacher
- unplaced block count
- raw VALID candidate'lardan continuity nedeniyle runtime'da filtrelenecek olanların sayısı
- continuity violation
alanlarını gösterir.

Önemli sınır:
M32.4 henüz raw DB candidate-domain tablolarını policy-aware yeniden üretmez ve direct
legacy RPC'lere history-breaking global constraint eklemez. UI/workbench candidate reads
policy-aware; M29 override backend'de policy-aware. DB candidate generation + propagation
için history-aware hard enforcement sonraki pakettir.

M32.4 commitleri:
```
0b241afb87a7843033ec68e48359bc6d400d72b8 feat: expose teacher policy on management board
45195f6bbd4e3914b2cbb1b8e6316a683fe94158 feat: derive resolved requirement teacher on board
b5eb562336b69538a38aa86cc192592269e1b4c9 feat: filter candidate details by teacher continuity
c876bc58bd7ef6964820d01bb869cbe85bca8017 feat: use teacher-policy-aware candidates in workbench
1cdba26306b3c1438c58f75f818ce260d4529e97 fix: use current board for policy-aware candidate actions
fb1b393e838011542efff84213f0dd24ffbdf1bf fix: scope policy-aware candidates to active board
42c147bea784b2d46e810048db1aa3a65ffdac4c feat: expose teacher-policy impact in placement assistant
c6f6e7342e3f4c61088265a20601b8367b4aa42e polish: explain teacher-policy impact in assistant
679a167987d32195255a577bdeb6833f3fd16cc8 fix: focus assistant resource choice on selected slot
e12b6324af03055a5e85a6ff4590d1b8d9c9b6d3 feat: enforce teacher policy on placement overrides
121214d093ec208c0653dd355f317b56fb25acc9 feat: route placement overrides through teacher policy gate
ed266e67d9507f6347a4e0c58724125284b10af1 polish: explain requirement-wide teacher override block
6f483d372cc73284f60dc254030e082de6f118e1 test: cover teacher policy impact and slot chronology
861c8c52db318c6c32797cfeda60009028304b64 test: add teacher policy fields to board fixtures
1cc56a632e3a02f3a6f9720c034867495ba6ef10 test: cover teacher-policy-aware candidate filtering
74ddbd493c17ef042bc2ed785abcc701d915d6b1 fix: preserve policy impact on empty assistant plans
cfb67c356fcb2c3bd96be1a5ce4f9daf65c74077 docs: add teacher policy runtime audit
```

Doğrulama tek batch yapılacak:
1. pull/HEAD/status
2. migration list + dry-run; yalnız M32.4 beklenir
3. db push
4. npm test
5. npm run build
6. gerekirse npm run lint
7. read-only M32.4 audit
8. browser smoke:
   - REQUIREMENT+REQUIRED tek blok teacher override başka teacher'a → blocked
   - BLOCK+NONE flexible lesson per-block override policy nedeniyle bloke olmamalı
   - Assistant slot chronology ve policy badge'leri

Sonraki paket:
history-aware raw candidate generation/enforcement + propagation + gerçek forward-domain impact
(simulated domain loss / forced / contradiction changes), ardından solver snapshot/objective katmanı.


### M32.4 lint sonucu / scope kararı

Kullanıcının 29 Eylül lint çıktısı:
- `npm run lint` → 29 problem: 18 error, 11 warning.
- Hataların büyük çoğunluğu `react-hooks/set-state-in-effect` ve daha önce mevcut yönetim/public UI kodlarında bulunuyor:
  - app/yonetim/page.tsx legacy effects
  - ManagementCardPool
  - ManagementCoursePlan
  - ManagementInspector
  - ManagementQuickTour
  - ManagementTeacherPolicyEditor
  - useTeacherSchedule
- Bu pattern'ler M32.4 öncesi committe de mevcuttu; M32.4 migration/runtime doğrulamasını bloke eden yeni functional hata olarak değerlendirilmedi.
- M32.4 ile eklenen tek yeni lint uyarısı:
  `React Hook useEffect has a missing dependency: fetchPolicyAwareCandidates`.
- Bu uyarı `useCallback(...,[board])` ile kapatıldı.

Fix commit:
```
230a0d2dce1a09255497d4b9c847bb13ebd4421c fix: stabilize policy-aware candidate callback
```

Karar:
- global React hook lint borcu ayrı refactor paketi olarak ele alınacak;
- M32.4 production migration/test/build akışı bununla karıştırılmayacak;
- lint global clean olmadan “lint PASS” denmeyecek.


### M32.4 production audit PASS

Production audit CSV sonucu:
- 176 ACTIVE teacher-bearing requirement satırı incelendi.
- 119 adet `REQUIREMENT + REQUIRED` satırının tamamında
  `distinct_resolved_teacher_count = 1`.
- continuity violation toplamı: 0.
- 10A Matematik: 3/3 blok yerleşik, 1 resolved teacher, violation=false.
- 10B Matematik: 4/4 blok yerleşik, 1 resolved teacher, violation=false.
- 57 adet `BLOCK + NONE` requirement korunuyor.
- Bunların 12'sinde iki farklı resolved teacher var; bu intentional flexible multi-teacher kullanımıdır.
- 6 BLOCK row resolved teacher=0:
  - Sahne: 9A, 10A, 11A, 12A
  - B. Uygulama: 6A, 7A
  Bunlar OPTIONAL teacher semantics ile uyumludur.
- Audit anında bütün 176 satırın bütün kartları yerleşmiş:
  `unplaced_block_count = 0`.
  Bu nedenle `raw_valid_candidates_filtered_by_continuity = 0` sonucu
  policy filter'ın çalışmadığı anlamına gelmez; query yalnız unplaced card
  raw VALID candidate'larını sayar ve test edecek unplaced card kalmamıştır.

M32.4 DB migration production'a uygulandı:
```
20260929101500_management_m32_4_teacher_policy_runtime.sql
```

Sonuç:
- production teacher continuity state temiz
- M29 v2 teacher-policy gate production'da
- runtime candidate policy filter kodu hazır
- gerçek unplaced candidate enforcement/forward-impact doğrulaması için yeni
  unplaced state veya rollback-only synthetic/snapshot QA gerekir


## 45. 29 Eylül 2026 — M32.4 smoke test / M32.4.1 teacher eligibility override fix

Browser smoke sonucu M32.4 continuity gate'i doğruladı ve ayrı bir eligibility açığı yakaladı.

Gözlemler:
- Matematik REQUIREMENT+REQUIRED tek-blok teacher override doğru biçimde blocked:
  “Bu ders tüm bloklarında aynı öğretmeni kullanmalı. Öğretmen değişikliği dersin tamamı için birlikte yapılmalı.”
- Aynı preview ayrıca gerçek teacher conflict'i de gösterdi.
- Solfej BLOCK+NONE per-block override policy nedeniyle bloke olmadı; bu beklenen.
- Fakat placement teacher picker global aktif öğretmen listesini gösteriyordu.
  Örneğin E. Gemalmaz Solfej requirement'ın eligible pool'unda olmamasına rağmen
  preview “uygulanabilir” diyebiliyordu.

Kritik semantik düzeltme:
- BLOCK + NONE/PREFERRED = blok bazında bağımsız teacher seçimi
- ama seçim HER ZAMAN requirement'ın mevcut eligible teacher pool'u içinden yapılır.
- Assignment scope esnekliği eligibility esnekliği değildir.
- Placement override teacher pool'u değiştirmez.

M32.4.1 migration:

```
20260929103000_management_m32_4_1_teacher_eligibility_override.sql
```

Backend:
- M32.4 v2 wrapper RPC'leri aynı isimle replace edilir.
- TEACHER preview her affected requirement için:
  - eligibleTeacherCount
  - selectedTeacherEligible
  - blockedByEligibility
  - blockedByContinuity
  hesaplar.
- Havuz dışı teacher:
  - canApply=false
  - blockReasons += TEACHER_NOT_ELIGIBLE
  - teacherEligibilityBlocked=true
- apply doğrudan RPC çağrısıyla da havuz dışı teacher'ı reddeder.
- REQUIREMENT+REQUIRED continuity gate aynen korunur.
- ROOM davranışı değişmez.
- M29 history-safe mutation yine alttaki authority'dir.

UI:
- ManagementInspector placement teacher picker artık global teacherOptions değil
  `card.teacherIds` ile kesişen eligible teacher listesi kullanır.
- Havuz dışı öğretmen listede görünmez.
- “Öğretmen değiştir · N” sayacı yalnız eligible alternatifleri sayar.
- teacherRequirement=NONE ise teacher override kapalıdır.
- OPTIONAL + empty pool için placement-only arbitrary teacher atama yapılmaz;
  önce Course Plan'da pool tanımlanmalıdır.

Commitler:
```
5e591b2ac06321f0a4ee4f7c78ac1d011665b4a4 fix: scope placement teacher picker to course pool
05a131619f3bb8a96846c409a151236b906247d3 polish: show only eligible teacher override count
e09b915130ca8f11f5f9ad27074c104e93f1940b fix: enforce teacher eligibility on placement overrides
4478cc993323668682fe4ea0d38e96526e6f8df7 fix: explain teacher eligibility override blocks
781cef391e4b79a29969fca3a2b47345e6607727 test: add teacher eligibility override QA
```

Read-only SQL Editor QA:
```
docs/sql/m32_4_1_teacher_eligibility_override_qa.sql
```
- suitable ACTIVE placed BLOCK requirement seçer (Solfej öncelikli)
- aktif ama pool dışı teacher seçer
- v2 preview TEACHER_NOT_ELIGIBLE ve canApply=false bekler
- uygun alternatif teacher varsa eligibility gate'in onu yanlışlıkla reddetmediğini de doğrular
- write yapmaz

Sonraki doğrulama batch:
1. pull / HEAD
2. npm test
3. npm run build
4. migration list + dry-run
5. yalnız M32.4.1 varsa db push
6. read-only M32.4.1 QA
7. browser Solfej placement teacher picker:
   - yalnız Solfej pool teacher'ları
   - E. Gemalmaz gibi havuz dışı öğretmen görünmemeli
8. Matematik continuity blocker halen çalışmalı


## 46. 29 Eylül 2026 — M32.4.1 over-constraint / M32.4.2 manual override correction

Kullanıcı gözlemi:
“artık nerdeyse hiçbir derste öğretmen değiştiremiyoruz.”

Kök neden:
- M32.4.1 `course_requirement_teachers` tablosunu hard eligibility whitelist gibi kullandı.
- Ancak proje geçmişinde bu tablo M27/M30 boyunca çoğunlukla mevcut/kanıtlanmış
  placement teacher kapasitesinden ve planlama havuzundan türetildi.
- Dolayısıyla özellikle FIXED / tek-teacher requirement'larda placement teacher picker
  neredeyse boş kaldı.
- Bu, planning pool ile teacher qualification kavramlarını yanlış biçimde birleştirdi.

Düzeltilmiş semantik:
- `course_requirement_teachers` = automatic planning / solver teacher pool.
- Manual editor authority bundan ayrıdır.
- EDITOR explicit olarak herhangi bir ACTIVE teacher seçebilir.
- BLOCK scope:
  - yalnız seçilen placed block(lar) değişir.
  - teacher planning pool dışında olabilir.
  - Course Plan pool sessizce değişmez.
- REQUIREMENT + REQUIRED:
  - tek blok teacher değişikliği otomatik olarak requirement'ın tüm placed block'larına
    genişler.
  - böylece continuity bozulmaz.
  - gün/start/room korunur.
  - planning pool sessizce değişmez.
- Eğer REQUIREMENT+REQUIRED derste unplaced block varsa ve seçilen teacher planning pool
  dışındaysa apply bloke edilir; önce Course Plan pool açıkça güncellenir.
- Mevcut teacher/room timetable conflict kontrolleri aynen korunur.

Yeni migration:
```
20260929104500_management_m32_4_2_manual_teacher_override.sql
```

RPC contract aynı:
- management_preview_placement_resource_change_v2
- management_apply_placement_resource_change_v2

Yeni preview metadata:
- requestedCardIds
- outsidePlanningPoolCount
- requirementWideExpansionCount
- planningPoolChanged=false
- policyImpacts

UI:
- placement teacher picker yeniden tüm ACTIVE öğretmenleri gösterir.
- mevcut planning-pool öğretmenleri listenin başında ve “Ders planı havuzunda” etiketiyle.
- diğerleri “Manuel seçim”.
- BLOCK copy: yalnız mevcut placement değişir.
- REQUIREMENT+REQUIRED copy:
  öğretmen değişikliği dersin yerleşmiş tüm bloklarına birlikte uygulanır.
- preview requirement-wide genişlemeyi ve outside-pool manuel seçimi açıklar.
- teacher pool otomatik genişletilmez.

M32.4.1 historical migration geri yazılmadı; M32.4.2 onun davranışını güvenli biçimde override eder.
Bu nedenle M32.4.1 production'a uygulanmış veya uygulanmamış olması M32.4.2 deployment'ını etkilemez.

Read-only QA:
```
docs/sql/m32_4_2_manual_teacher_override_qa.sql
```
Kontroller:
- BLOCK outside-pool ACTIVE teacher artık TEACHER_NOT_ELIGIBLE almaz.
- BLOCK preview tek kartta kalır.
- REQUIREMENT+REQUIRED single-card request bütün placed requirement bloklarına genişler.
- continuity mismatch oluşmaz.
- planningPoolChanged=false kalır.
- gerçek timetable conflict varsa canApply yine false olabilir; bu beklenir.

Commits:
```
da91460605758f394016524e55a6617c8329e2df fix: restore practical manual teacher overrides
290d5f814857d64cdfb4f4cf09c0389c9a0ce35c fix: model manual override metadata
8eec2962ceb2834f8fc39334f643c1ecc4d5a530 fix: restore manual teacher choice without changing plan pool
a2f436d789b00b3a0bddab775a3f130f020ec05a polish: keep planned teachers first in manual picker
a5a698ea538484064260a85239a9add92c9aa6c0 test: add manual teacher override semantics QA
65ab3431505414c35f5f2825667de2b150ed2546 docs: distinguish planning pool from manual teacher override
```

UI layout fix also landed:
```
45b58d71728ad93c2c4d06bb4ec48117642927cb fix: keep history actions compact on narrow screens
```
- Geri Al/Yinele no-wrap
- <=1280 px icon-only
- <=1360 px placement summary hidden
- history actions shrink edilmez


## 47. 29 Eylül 2026 — M32.4.2 browser PASS / M32.5 persisted candidate policy + forward impact

Kullanıcı M32.4.2 sonrası manuel öğretmen değiştirme davranışını doğruladı:
`ok. düzeldi.`

Bu, planning pool ile explicit manual override ayrımını production/browser düzeyinde kabul
ettiğimiz checkpoint'tir.

### M32.5 hedefi

Bir sonraki solver-ready katman iki işi birlikte yapar:

1. REQUIREMENT + REQUIRED teacher continuity yalnız frontend filtresi olmaktan çıkar;
   candidate assessment/domain summary katmanında kalıcı olarak uygulanır.
2. Placement Assistant, bir exact seçeneği uygulamadan önce kalan havuz üzerindeki ileri
   etkisini hesaplar:
   - kaç VALID aday kaybolur
   - kaç kartın alanı daralır
   - kaç kart yeni tek seçeneğe düşer
   - kaç kart yeni contradiction olur

### Candidate-domain teacher policy enforcement

Yeni migration:
```
20260929111500_management_m32_5_candidate_policy_forward_impact.sql
```

Yeni AFTER-statement candidate trigger:
- candidate INSERT/UPDATE sonrası set-based çalışır
- aynı requirement içindeki candidate satırlarını current placement teacher state'e göre
  yeniden sınıflandırır
- REQUIREMENT + REQUIRED:
  - placed teacher count >1:
    `REQUIREMENT_TEACHER_CONFLICT`
  - placed teacher count =1 ve candidate teacher farklı/NULL:
    `REQUIREMENT_TEACHER_MISMATCH`
- BLOCK + NONE/PREFERRED:
  hard teacher-policy filtresi uygulanmaz
- stale M32.5 policy reason'ları her geçişte temizlenip current state'ten yeniden üretilir
- candidate satırları dışında placement/history state mutate edilmez
- M22 provisional certainty BEFORE trigger nihai resource-semantics classifier olarak korunur
- same-requirement non-overlap kartların domain summary'leri de aynı batch'te güncellenir

History safety:
- placement seviyesine yeni reject trigger eklenmedi
- undo/redo historical snapshot'ları restore edebilir
- candidate domain, restore edilen CURRENT placement state'e göre yeniden sınıflanır
- bu nedenle history semantiği ile hard candidate policy birbirinden ayrıdır

Frontend `applyManagementTeacherPolicyToCandidateDetail()` persisted policy reason'larını da
tanır; DB tarafından zaten INVALID edilmiş satırları doğru policyFilteredCount içine alır.
NULL teacher, resolved REQUIREMENT teacher'dan farklı kabul edilir.

### Forward-domain preview

Yeni internal RPC:
```
management_preview_candidate_forward_impact(jsonb)
```

Yeni authenticated batch RPC:
```
management_preview_candidate_forward_impacts(jsonb)
```

Batch sınırı: 60 scenario / çağrı.
Frontend bütün exact Assistant seçeneklerini 60'lık ardışık batch'ler halinde hesaplar;
fan-out RPC yapılmaz.

Input scenario:
```json
{
  "id": "<assistant option id>",
  "items": [
    {
      "cardId": "...",
      "dayOfWeek": 1,
      "startPeriod": 3,
      "teacherId": "...",
      "roomId": "..."
    }
  ]
}
```

Preview:
- write yapmaz
- yalnız unplaced current VALID+complete candidate scenario kabul eder
- multi-card scenario içinde proposed teacher/room/group internal conflict'i kontrol eder
- REQUIREMENT+REQUIRED proposed teacher anchor'ını da simüle eder
- diğer unplaced kartların VALID candidate alanında proposed occupancy/policy nedeniyle
  kaybolacak assessment satırlarını sayar
- M22 provisional candidate varsa onu deterministic forced kabul etmez
- unresolved_count >0 olan kart için yanlış forced/contradiction ilan etmez

Output:
- safeToApply
- scenarioBlockReasons
- affectedCardCount
- domainLossCount
- newForcedCount
- newContradictionCount
- impactRows
- stateToken
- previewOnly=true

Assistant UI:
- exact option altında:
  - `Diğer adayları daraltmıyor`
  - veya `N aday azalır · M ders etkilenir`
  - `N yeni tek seçenek`
  - `N ders seçeneksiz kalır`
- forward preview yeni contradiction doğuruyorsa Assistant'taki apply butonu
  `Riskli` olur ve disabled kalır
- manuel grid/Inspector yetkisi ayrıca korunur; Assistant kendi safe-apply sözleşmesini uygular
- Asistan hâlâ kullanıcı adına “en iyi” seçeneği ilan etmez veya otomatik seçim yapmaz

Frontend/client commitleri:
```
825297ac64f29d0ad645340399d39e02c2210720 feat: add forward candidate impact client
bff7f6d2e11f01b375cab00999e0ede6bfc8a72d feat: attach forward impact to assistant options
2057037d94e4db5645ef3505506846d01fc56f27 feat: calculate assistant forward-domain impact
734d38708f94476d901b81c3bd3dbcda23ad3b9a feat: show forward-domain impact in assistant
c22259dbadc14d18715d0ce4d6c68820acd84d1a perf: batch all assistant forward impact scenarios
50814ef21bad325e14c867085d6838a7b5f20eed fix: type assistant forward impact batches
c432a60f75c3d93daa197f555e2a4660bb63840d fix: align candidate reads with persisted teacher policy
781cf4ed4b97f6f22f205011c087d89ef8883f21 polish: translate forward impact errors
```

Migration commits:
```
73709283a2727484c70bbf9ad1008d775c2853e3 feat: enforce teacher policy in candidate domains
8101d1ba1224c53754ef548457769cd7a675b989 fix: use explicit target exclusion in forward impact
```

Tests:
```
d9942e7fa2807517a25d650f3992de2518e5e014 test: cover assistant forward impact attachment
2dd543251d83589c37b7085303c1a98bc8021019 test: cover persisted teacher policy candidate rows
```

Rollback-only production QA:
```
docs/sql/m32_5_candidate_policy_forward_impact_rollback_qa.sql
```
Commit:
```
3b8d6d696888d52ab0df3f9eae01ed5abc859af1
```

QA transaction içinde:
1. fully placed REQUIREMENT+REQUIRED + multi-teacher planning pool requirement seçer
2. bir placement'ı geçici siler
3. card candidate domain'ini rebuild eder
4. alternate teacher satırlarında persisted REQUIREMENT_TEACHER_MISMATCH bekler
5. resolved teacher dışındaki VALID candidate count=0 bekler
6. silinen placement'ın original exact candidate'ının VALID olduğunu doğrular
7. original placement için forward-impact preview çalıştırır
8. previewOnly=true ve scenario blockers=[] bekler
9. ROLLBACK

Production programı QA sonunda değişmeden kalır.

M32.5 doğrulama batch:
1. pull / HEAD / clean status
2. npm test
3. npm run build
4. migration list + dry-run
5. yalnız M32.5 migration bekleniyorsa db push
6. rollback-only M32.5 QA
7. browser smoke için bir veya birkaç kartı kontrollü kaldırıp Assistant:
   - exact option impact badge'leri
   - contradiction üreten option varsa Riskli/disabled
   - apply sonrası assistant stale → refresh
8. undo ile kaldırılan kartları gerekirse geri getir

Sonraki solver-ready paket:
- soft objective model (teacher continuity PREFERRED, teacher load/gaps, time-of-day preferences,
  room stability, change penalty)
- immutable draft snapshot
- feasibility/optimization prototype


## 48. 29 Eylül 2026 — M32.5 rollback QA duplicate summary / M32.5.1 ownership fix

M32.5 migration production'a uygulandıktan sonra rollback-only QA şu hatayı yakaladı:

```
ERROR 23505 duplicate key value violates unique constraint
schedule_card_domain_summaries_pkey
```

Failing path:
- QA bir placed REQUIREMENT+REQUIRED kartını transaction içinde geçici kaldırdı
- `refresh_management_candidate_domain_subset()` target card summary'sini önce DELETE etti
- candidate rows INSERT edildi
- M32.5 AFTER INSERT policy trigger'ı candidate'ları reclassify ederken
  `schedule_card_domain_summaries` için INSERT ... ON CONFLICT yaptı
- böylece target summary erken yeniden oluştu
- M14.3 subset builder sonunda kendi summary INSERT'ini yapınca aynı card_id için PK conflict oluştu

Kök neden:
candidate-policy trigger ile candidate-domain builder aynı missing summary satırının “creator”
authority'sini paylaşıyordu.

M32.5.1 ownership kuralı:
- candidate-domain builder, rebuild sırasında missing summary satırını CREATE eden tek authority
- M32.5 policy trigger summary tarafında yalnız VAR OLAN satırları UPDATE eder
- same-requirement non-overlap kartların mevcut summary'leri yine policy değişimine göre güncellenir
- rebuild target summary yoksa trigger onu yaratmaz; builder final INSERT'i güvenle yapar
- M22 provisional domain-summary BEFORE trigger mevcut UPDATE/INSERT yollarında aynen korunur

Yeni migration:
```
20260929113000_management_m32_5_1_candidate_summary_ownership.sql
```

Commit:
```
06bc06adaf94ea326ce613678a0608019277f295 fix: avoid candidate summary ownership race
```

M32.5 rollback QA dosyası değişmedi; M32.5.1 apply sonrası aynı QA tekrar çalıştırılmalı.
Beklenen: exception yok / `Success. No rows returned`, transaction sonunda ROLLBACK.


## 49. 29 Eylül 2026 — M32.5.1 rollback QA PASS / M32.5 closed

Kullanıcı, M32.5.1 apply sonrası aynı
`docs/sql/m32_5_candidate_policy_forward_impact_rollback_qa.sql`
dosyasını yeniden çalıştırdı ve test exception olmadan tamamlandı.

Sonuç:
- candidate-domain rebuild sırasında duplicate summary ownership problemi kapandı
- persisted REQUIREMENT+REQUIRED teacher-policy reason'ları rebuild zincirinde çalışıyor
- resolved teacher dışındaki adaylar VALID kalmıyor
- domain summary creation authority tekrar candidate-domain builder'da
- existing same-requirement summary'ler policy trigger tarafından güncellenebiliyor
- forward-impact preview original valid placement scenario üzerinde çalışıyor
- QA transaction sonunda ROLLBACK; production schedule state değişmedi

M32.5 bu doğrulamayla CLOSED/PASS.

Sıradaki mimari paket M33:
- immutable/reproducible solver snapshot
- current placements ayrı “baseline/change-cost” girdisi
- hard constraints ile soft objectives ayrımı
- teacher continuity PREFERRED, teacher load/gaps, room stability,
  time-of-day preference ve change penalty için explicit objective model
- objective ağırlıkları kullanıcı/kurum kararı olmadan sessizce “en iyi” seçmeyecek
- feasibility → optimize → explain → human review → commit akışının foundation'ı


## 50. 30 Eylül 2026 — M33 solver snapshot + objective foundation

M32.5 CLOSED/PASS sonrası solver mimarisinin ilk kalıcı katmanı oluşturuldu.

Yeni migration:
```
20260930071500_management_m33_solver_snapshot_objectives.sql
```

Amaç:
- henüz solver çalıştırmak değil
- solver'a verilecek girdiyi deterministic ve immutable hale getirmek
- mevcut programı solver truth değil baseline/change-cost girdisi yapmak
- hard constraints ile soft objectives'i açıkça ayırmak
- kurum objective ağırlıkları tanımlanmadan sessiz “en iyi” seçimi yapmamak

### Objective profile modeli

Yeni tablo:
`management_solver_objective_profiles`

Desteklenen objective key'ler:
- changeCost
- preferredTeacherContinuity
- teacherIdleGaps
- roomStability

Ayrılmış ama henüz desteklenmeyen:
- teacherLoadBalance → explicit teacher load target verisi eksik
- subjectTimePreference → explicit subject/day/time preference verisi eksik

Ağırlık aralığı: 0..1000.

Kurallar:
- unknown key reddedilir
- non-integer / out-of-range value reddedilir
- unsupported objective >0 olamaz
- ACTIVE profile en az bir positive supported objective ister
- sistem otomatik active profile yaratmaz/seçmez
- explicit ACTIVE seçildiğinde aynı requirement set içindeki eski ACTIVE profile DRAFT'a döner

RPC:
- management_validate_solver_objective_weights(jsonb)
- management_upsert_solver_objective_profile(uuid,uuid,text,text,jsonb,text)
- management_list_solver_objective_profiles(uuid)

### Immutable solver snapshot

Yeni tablo:
`management_solver_snapshots`

Snapshot:
- active requirements
- materialized schedule cards
- instructional groups + relations
- planning teacher pools
- room pools
- teacher/room operational state
- teacher requirement/scope/continuity
- requirement structural rules
- locked card state
- current placements as ayrı baseline
- objective profile yalnız explicit id verilirse

Önemli mimari karar:
`schedule_card_candidate_assessments` snapshot'a ALINMIYOR.

Neden:
candidate rows current placement occupancy'ye göre generated.
Global optimizer bu row'ları immutable domain kabul ederse, başka kart taşındığında açılacak
alternatifleri yanlışlıkla kapatmış olur.
Solver kendi simultaneous domains'ini structural inputs'tan türetecek.
Interactive workbench/M32.5 forward impact candidate rows'u kullanmaya devam eder.

Snapshot hard constraint contract:
- day 1..5 / period 1..12
- no block across lunch boundary
- teacher overlap yok
- room overlap yok
- participant-group overlap yok
- locked card pin
- REQUIREMENT+REQUIRED teacher continuity
- declared minDistinctDays
- declared maxBlocksPerDay
- declared maxConsecutivePeriods

Readiness hard blockers:
- teacher requirement unspecified
- teacher-bearing assignment scope unspecified
- required teacher active pool empty
- required continuity violation
- room/resource mode unknown
- fixed/pool room active option missing
- capability room unavailable
- inactive baseline teacher/room
- baseline time out of bounds/lunch crossing

Readiness flags:
- hardInputReady
- objectiveProfileReady
- solverPrototypeReady

`hardInputReady` feasibility proof değildir; yalnız solver input modelinin coherent olduğunu
söyler.

### Baseline semantics

Current placements:
- ground truth değildir
- unlocked placement hard constraint değildir
- changeCost objective pozitif ise korunması tercih edilir
- locked cards hard pin olarak kalır

Baseline metrics:
- card / placed / unplaced / locked count
- changeCost = 0
- preferred teacher continuity breaks
- teacher idle-gap periods
- room stability breaks

Snapshot deterministic hash + baseline hash üretir.

RPC:
- management_preview_solver_snapshot(uuid,uuid)
- management_capture_solver_snapshot(uuid,uuid)
- management_get_solver_snapshot(uuid)

Capture:
- yalnız DRAFT
- hardInputReady=false ise capture blocked
- objective profile null olabilir (feasibility development)
- immutable app-level: update/delete RPC yok
- aynı revision+snapshot hash yeniden capture edilirse duplicate row yerine existing snapshot döner

Migration commit:
```
e9123320febd57f22143efa0845a3c6cf0f2f038 feat: add solver snapshot and objective foundation
```

Read-only readiness diagnostic:
```
docs/sql/m33_solver_snapshot_preview.sql
```
Commit:
```
db203ada5b8d33ff8d485eeacbbd319948d665d1
```

Rollback-only snapshot QA:
```
docs/sql/m33_solver_snapshot_rollback_qa.sql
```
Commit:
```
5518b4a2ea9b1c4da7df6cd60ad2a5b7c0119a1f
```

QA:
1. active DRAFT snapshot preview iki kez
2. snapshotHash deterministic
3. baselineHash deterministic
4. candidateDomainIncluded=false
5. hardInputReady beklenir
6. null objective profile → objectiveProfileReady=false
7. snapshot capture
8. stored hash/payload preview ile aynı
9. ROLLBACK

Architecture doc:
```
docs/SOLVER_SNAPSHOT_AND_OBJECTIVE_FOUNDATION.md
```
Commit:
```
e0720a516402ea764d12034788feb4df0c56b7be
```

M33 validation batch:
1. pull / HEAD / clean status
2. npm test
3. npm run build
4. migration list + dry-run
5. yalnız M33 migration expected
6. db push
7. m33_solver_snapshot_preview.sql
8. hardInputReady sonucunu incele
9. hardInputReady=true ise rollback QA
10. snapshot QA PASS sonrası M33.1 objective profile UX

M33 sonrası plan:
- M33.1 user-facing objective profile editor (ham JSON değil anlaşılır hedefler)
- sonra immutable snapshot consumer feasibility solver prototype
- solver output explainable metric vector + baseline delta üretmeli
- solver implementation library-agnostic kalmalı


## 51. 30 Eylül 2026 — M33 readiness diagnostic / M33.0.1 provisional room correction

M33 readiness preview production sonucu:
- snapshotVersion M33-v1
- hardInputReady=false
- tek hard blocker: RESOURCE_MODE_UNKNOWN count=41
- objectiveProfileReady=false (beklenen; explicit profile yok)
- solverPrototypeReady=false
- baseline:
  - cardCount 300
  - placedCardCount 300
  - unplacedCardCount 0
  - lockedCardCount 0
  - teacherIdleGapPeriods 97
  - roomStabilityBreaks 40
  - preferredTeacherContinuityBreaks 0
- candidateDomainIncluded=false (tasarım gereği)
- missing optional inputs:
  TEACHER_LOAD_TARGETS, SUBJECT_TIME_PREFERENCES

Unknown room audit sonucu:
- 41 ACTIVE resource_mode=UNKNOWN requirement
- yalnız 3 requirement'ta non-null baseline room evidence:
  - 8A K. Bale: A Salon + B Salon
  - 8A B. Uygulama: B Salon
  - 9B Matematik: B1 105B
- kalan 38 requirement NO_ROOM_EVIDENCE / placement room_id null
- room pool count bu 41 kaydın tamamında 0
- required_capability null
- bu tabloyu FIXED/ELIGIBLE_POOL'a körlemesine çevirmek için yeterli planning-policy evidence yok

Mimari düzeltme:
M33'ün RESOURCE_MODE_UNKNOWN'ı hard blocker sayması M22 ile çelişiyordu.
M22 invariantı:
UNKNOWN != ABSENT != UNAVAILABLE.
resource_mode=UNKNOWN schedulable PROVISIONAL_UNKNOWN room identity'dir.

Yeni migration:
```
20260930073500_management_m33_0_1_provisional_room_readiness.sql
```

Davranış:
- applied M33 preview function rename:
  management_preview_solver_snapshot_m33_base
- public management_preview_solver_snapshot wrapper:
  RESOURCE_MODE_UNKNOWN blocker'ını hardBlockers'tan çıkarır
- UNKNOWN requirement'ları mutate etmez
- planning room pool yaratmaz
- baseline'dan FIXED/ELIGIBLE_POOL inference yapmaz
- readiness.provisionalInputs içinde:
  - count
  - withBaselineRoomEvidence
  - withoutBaselineRoomEvidence
  - PROVISIONAL_UNKNOWN semantics
- hardInputReady kalan gerçek blocker'lara göre hesaplanır
- snapshotVersion M33.0.1-v1
- snapshot hash corrected readiness payload üzerinden yeniden üretilir
- baseline hash değişmez
- capture function dynamic snapshotVersion kullanır

Commitler:
```
32150f7b5855ac7011672cc8b16857399b685882 fix: align solver readiness with provisional room semantics
253e35d173fb05124b895d1f6e4180b746dd40a4 docs: surface provisional solver inputs
a44f0d7b98b0806fb65654f6a10fd178d61851ec docs: align solver readiness with M22 room semantics
```

M33 preview diagnostic artık ayrıca:
- provisional_inputs
- resource_unknown_semantics
kolonlarını gösterir.

Doğrulama:
1. migration list + dry-run
2. yalnız 20260930073500 M33.0.1 expected
3. db push
4. m33_solver_snapshot_preview.sql tekrar
Beklenen:
- hard_input_ready=true (başka blocker yoksa)
- hard_blockers=[]
- provisional_inputs RESOURCE_MODE_UNKNOWN count=41
  withBaselineRoomEvidence=3
  withoutBaselineRoomEvidence=38
- resource_unknown_semantics=M22_PROVISIONAL_UNKNOWN
- objective_profile_ready=false
- solver_prototype_ready=false
5. hard_input_ready=true ise m33_solver_snapshot_rollback_qa.sql
6. rollback QA PASS sonrası M33 snapshot foundation CLOSED, M33.1 objective profile UX


## 52. 30 Eylül 2026 — M33.0.1 readiness preview PASS

Production readiness preview sonucu:
- snapshotVersion: M33.0.1-v1
- solverEngineStatus: SNAPSHOT_ONLY
- hardInputReady: true
- hardBlockers: []
- objectiveProfileReady: false (beklenen; explicit profile henüz yok)
- solverPrototypeReady: false (objective profile henüz yok)
- RESOURCE_MODE_UNKNOWN:
  - count=41
  - hardBlocker=false
  - resolutionStatus=PROVISIONAL_UNKNOWN
  - withBaselineRoomEvidence=3
  - withoutBaselineRoomEvidence=38
  - resourceUnknownSemantics=M22_PROVISIONAL_UNKNOWN
- candidateDomainIncluded=false (tasarım gereği)
- missing optional model inputs:
  - TEACHER_LOAD_TARGETS
  - SUBJECT_TIME_PREFERENCES
- baseline:
  - cardCount=300
  - placedCardCount=300
  - unplacedCardCount=0
  - lockedCardCount=0
  - teacherIdleGapPeriods=97
  - roomStabilityBreaks=40
  - preferredTeacherContinuityBreaks=0
- baselineHash aynı kaldı:
  e3202d4f87a80b8adea1c4b70f929fa0

Sonuç:
M33.0.1 provisional room semantics düzeltmesi production preview düzeyinde PASS.
Sıradaki doğrulama:
docs/sql/m33_solver_snapshot_rollback_qa.sql
Bu PASS olursa M33 snapshot foundation CLOSED ve M33.1 objective profile UX başlayacak.


## 53. 30 Eylül 2026 — M33 rollback QA PASS / M33 CLOSED / M33.1 objective profile UX

Kullanıcı M33.0.1 readiness PASS sonrası
`docs/sql/m33_solver_snapshot_rollback_qa.sql`
çalıştırdı.

Sonuç:
```
Success. No rows returned
```

Böylece M33 solver snapshot foundation CLOSED/PASS:
- hardInputReady=true
- snapshot deterministic
- baseline hash deterministic
- candidate-domain global solver truth olarak snapshot'a alınmıyor
- immutable capture/readback çalışıyor
- M22 UNKNOWN room semantics provisional olarak korunuyor
- QA writes rollback

### M33.1 UX implementation

Yeni üst seviye yönetim bölümü:
`Optimizasyon`

Yeni client:
```
lib/managementSolver.ts
```

Yeni component:
```
components/management/ManagementSolverWorkspacePanel.tsx
```

Yeni nav/help integration:
- app/yonetim/page.tsx
- ManagementHelpCenter: 5. ana bölüm Optimizasyon

UI, ham JSON/0..1000 editörü göstermez.
Kullanıcı desteklenen dört hedefi anlaşılır öncelik seviyeleriyle belirler:

- Kapalı = 0
- Düşük = 250
- Orta = 500
- Yüksek = 750
- Çok yüksek = 1000

Desteklenen:
- Mevcut programa sadakat → changeCost
- Esnek derslerde öğretmen devamlılığı → preferredTeacherContinuity
- Öğretmen boşluklarını azalt → teacherIdleGaps
- Salon istikrarını koru → roomStability

UI baseline metriclerini gösterir:
- preferred continuity breaks
- teacher idle gap periods
- room stability breaks

M22 provisional room state ayrıca görünür:
- count
- baseline room evidence olan/olmayan sayıları
- bu state solver hazırlığını hard-block etmez

Future/unsupported objective'ler kullanıcıya görünür ama disabled:
- Öğretmen yük dengesi
- Ders-saat tercihleri

Profil davranışı:
- birden fazla named profile
- yeni profil sıfır ağırlıklarla başlar; hidden default yok
- DRAFT kaydedilebilir
- ACTIVE explicit kullanıcı aksiyonudur
- ACTIVE için en az bir positive supported objective gerekir
- mevcut ACTIVE profile düzenlenirse status korunarak save edilir
- yeni/başka DRAFT profil explicit “Etkin profil yap” ile ACTIVE olur
- profile save program placement'larını mutate etmez
- save sonrası yönetim data refresh

Commits:
```
36a9876fd30d8ed4d8fecdd759330f21a6466496 feat: add solver objective workspace client
e9eae21b8029b9d74880b8febc263b9bdf8d5e7b feat: add human-readable solver objective editor
1880cf0d8c1eb4fa6b530ca0d95d7ea816c6280d feat: fetch latest solver objective workspace
8b33c3a3397a5abe41cc6b68aae501769ad64a4a feat: add optimization objective workspace
1b82bcfb281f65f8201beecc13c36fb56f74dd59 docs: add optimization workspace help
cda35515ea3ed4a7eb8d9c7572ac5c2c553e95f1 test: add objective profile rollback QA
0e2ac0d502fac29006da19b63de695e1d09dbd6a docs: describe objective profile UX
```

M33.1 rollback-only DB QA:
```
docs/sql/m33_1_objective_profile_rollback_qa.sql
```

QA:
1. unsupported teacherLoadBalance >0 validation=false
2. supported DRAFT profile create
3. list RPC sees DRAFT
4. same profile ACTIVE
5. objectiveProfileReady=true
6. current hard-ready input + ACTIVE profile → solverPrototypeReady=true
7. weight round-trip
8. ROLLBACK

M33.1 doğrulama:
- git pull
- npm test
- npm run build
- rollback QA
- browser Optimizasyon tab smoke:
  - no profile state
  - DRAFT create
  - profile select
  - ACTIVE explicit
  - readiness badge objective-ready
  - no schedule placement mutation


## 54. 30 Eylül 2026 — M33.1 rollback QA PASS

Kullanıcı, M33.1 objective profile implementation checkpoint'i sonrasında
`docs/sql/m33_1_objective_profile_rollback_qa.sql`
dosyasını production DB üzerinde rollback-only test olarak çalıştırdı.

Sonuç:
```
Success. No rows returned
```

Bu sonuçla M33.1 DB/objective-profile sözleşmesi PASS:
- unsupported `teacherLoadBalance > 0` validation tarafından reddediliyor
- supported objective ağırlıklarıyla DRAFT profile oluşturulabiliyor
- list RPC DRAFT profili görüyor
- aynı profil explicit ACTIVE yapılabiliyor
- ACTIVE profile ile `objectiveProfileReady=true`
- mevcut `hardInputReady=true` state ile `solverPrototypeReady=true`
- weight round-trip korunuyor
- test transaction sonunda ROLLBACK; kalıcı objective profile veya schedule mutation bırakmıyor

M33.1 mevcut kod checkpoint'i:
```
8b33c3a3397a5abe41cc6b68aae501769ad64a4a
feat: add optimization objective workspace
```

İlgili yardımcı commitler:
```
36a9876fd30d8ed4d8fecdd759330f21a6466496 feat: add solver objective workspace client
e9eae21b8029b9d74880b8febc263b9bdf8d5e7b feat: add human-readable solver objective editor
1880cf0d8c1eb4fa6b530ca0d95d7ea816c6280d feat: fetch latest solver objective workspace
1b82bcfb281f65f8201beecc13c36fb56f74dd59 docs: add optimization workspace help
cda35515ea3ed4a7eb8d9c7572ac5c2c553e95f1 test: add objective profile rollback QA
0e2ac0d502fac29006da19b63de695e1d09dbd6a docs: describe objective profile UX
17504045f596ae944f02b159df6a283b8213c9e3 docs: checkpoint M33.1 objective profile UX
```

Sıradaki kabul adımı browser smoke'tur:
1. Yönetim > Optimizasyon açılır.
2. No-profile state doğru görünür.
3. Yeni DRAFT profil oluşturulur.
4. Profil seçimi/değiştirme çalışır.
5. En az bir supported objective pozitif yapılıp profil explicit ACTIVE edilir.
6. readiness göstergesi objective-ready / solver-prototype-ready state'e geçer.
7. Profil kaydı program placement'larını değiştirmez.
8. UNKNOWN salonların M22 `PROVISIONAL_UNKNOWN` bilgisi görünür; hard blocker gibi sunulmaz.

Browser smoke PASS sonrası M33.1 CLOSED kabul edilecek ve sıradaki paket
immutable solver snapshot'ını tüketen **feasibility solver prototype** olacaktır.


## 55. 30 Eylül 2026 — M33.2 in-memory feasibility prototype

M33.1 rollback QA PASS sonrasında immutable snapshot'ı tüketen ilk gerçek solver katmanı eklendi.

Kalıcı mimari karar:
- solver deneme/yanılma sırasında Supabase placement/candidate tablolarını mutate etmez
- snapshot bir kez okunur
- domain üretimi ve feasibility araması geçici istemci belleği/matris üzerinde yapılır
- ilk paket yalnız hard-constraint feasibility'dir
- objective profile henüz çözüm seçmek/puanlamak için kullanılmaz
- sonuç doğrudan programa uygulanmaz

Yeni/updated dosyalar:
```
lib/managementSolver.ts
lib/managementSolverPrototype.ts
lib/managementSolverPrototype.test.ts
components/management/ManagementSolverWorkspacePanel.tsx
docs/M33_2_IN_MEMORY_FEASIBILITY_SOLVER.md
```

Implementation commits:
```
b411e001d063ceef0b1531022e60c61f54731dfb feat: type structural solver snapshot inputs
83ba94064c6741cd95383b91af6c0166ba307eb5 feat: add in-memory feasibility solver prototype
76f1e376211d9f8f861dcc32c48d3190fa0bcb0a perf: validate feasibility baseline without expanding domains
8d76ed16fd6d1073caba6a1ce8e6456eda48222b test: cover in-memory feasibility solver prototype
ca8c2129d745036310c0327b334b8035cae06770 fix: tighten feasibility hard-constraint checks
7b24a138a53e9df48268bc42292c0eee83f58c7f feat: expose read-only feasibility check
605b989422d08922a852d27075e2d8d051a89a54 docs: define in-memory feasibility solver contract
```

M33.2-v0 hard constraint kapsamı:
- TIME_WITHIN_DAY
- NO_BLOCK_ACROSS_LUNCH_BOUNDARY
- NO_TEACHER_OVERLAP
- NO_ROOM_OVERLAP; canonical room identity dikkate alınır
- NO_PARTICIPANT_GROUP_OVERLAP; M4 CONTAINS/OVERLAPS semantiği
- LOCKED_CARD_PIN
- REQUIREMENT_TEACHER_CONTINUITY_REQUIRED
- minDistinctDays
- maxBlocksPerDay
- maxConsecutivePeriods

M32.4.2 planning/manual ayrımı korunur:
- `course_requirement_teachers` automatic planning/solver pool'dur
- unlocked kart solver teacher domain'i planning pool'dan gelir
- manual placement override planning pool'a sessizce eklenmez
- locked kart active baseline kaynağını pin olarak koruyabilir

M22/M33.0.1 salon semantiği korunur:
- RESOURCE_MODE_UNKNOWN hard blocker değildir
- salon identity bilinmiyorsa `roomId=null` provisional çözüm mümkündür
- baseline room evidence kart bazında korunabilir
- bundan yeni FIXED/ELIGIBLE_POOL requirement policy türetilmez

Performance:
- 300 kartlık mevcut schedule tamamen placed olduğu için önce baseline fast-path denenir
- baseline hard-valid ise domain expansion/backtracking yok
- beklenen production smoke: `FEASIBLE`, `baselineWasFeasible=true`, `visitedNodeCount=0`, `baselineReuseCount=300`
- full search gerektiğinde smallest-domain-first deterministic backtracking
- default node guard 100000
- per-card candidate guard 5000
- guard aşımı `SEARCH_LIMIT`; `INFEASIBLE` değildir

UI:
- Optimizasyon bölümünde `Uygunluğu kontrol et`
- sonucu yalnız local state'te gösterir
- UI açıkça `Program değişmedi · yazma işlemi yok` der
- objective profile seçimi feasibility sonucu için kullanılmaz

Build doğrulaması:
- `ca8c2129...` Vercel PASS
- `7b24a138...` Vercel PASS
- dolayısıyla M33.2 core ve UI Next/TypeScript production build'den geçti

Henüz PASS sayılmayanlar:
- Vitest M33.2 test suite bu oturumda çalıştırılamadı; connector ortamında repo container'a indirilemedi
- production browser smoke kullanıcı tarafından henüz yapılmadı
- bu nedenle M33.2 **CLOSED değil**

Birleşik browser acceptance:
1. Yönetim > Optimizasyon aç
2. M33.1 için DRAFT profil oluştur; en az bir supported objective aç; explicit ACTIVE yap
3. `Etkin hedef profili hazır` durumunu doğrula
4. UNKNOWN salon provisional bilgi kutusunu doğrula
5. `Uygunluğu kontrol et`
6. güncel 300-card baseline için beklenen:
   - Geçerli yerleşim bulundu
   - mevcut program hard kurallar açısından zaten geçerli
   - Başlangıç korundu 300/300
   - Arama düğümü 0
7. Program ekranına dön; placement değişmemiş olmalı
8. browser refresh sonrası aynı schedule korunmalı

M33.2 browser + Vitest PASS sonrası sıradaki paket:
**M33.3 explainable objective optimization**
- objective metric vector
- baseline delta
- ağırlıklı objective search
- açıklanabilir candidate solution comparison
- otomatik apply yok; human review / explicit commit ayrı aşama

## 56. 30 Eylül 2026 — M33.1 browser PASS / M33.2 baseline deviation diagnostic

Kullanıcı production Optimizasyon ekranını browser'da doğruladı.

### M33.1 browser acceptance

Ekran kanıtları:
- başlangıçta profil yok state doğru
- yeni profil oluşturuldu
- dört supported objective Orta seviyesine getirildi
- profil adı Orta
- profil explicit ACTIVE yapıldı
- sol profil listesinde Etkin
- üst readiness badge: Etkin hedef profili hazır
- hard readiness badge: Hard girdiler hazır
- 41 provisional salon requirement bilgisi: 3 baseline room evidence / 38 salon identity bilinmiyor

Sonuç: **M33.1 CLOSED/PASS.**

### M33.2 production smoke sonucu

Uygunluğu kontrol et çalıştı ve yazma işlemi olmadan FEASIBLE sonuç döndü.

Observed:
```
Geçerli yerleşim bulundu
Başlangıç korundu: 294/300
Arama düğümü: 395
Provisional salon: 54
```

UI ayrıca: Program değişmedi · yazma işlemi yok

Bu sonuç M33.2 motorunun gerçek production snapshot üzerinde çalıştığını doğruluyor; ancak beklenen 300/300 zero-search fast-path oluşmadı.

Yorum:
- 6 kart mevcut baseline'dan farklı çözüldü.
- Bunun gerçek hard-rule ihlali mi, yoksa solver baseline-domain semantiğinin planning pool ile manual override'ı yeniden karıştırması mı olduğu kanıtlanmadan davranış değiştirilmemeli.
- Özellikle M29/M32.4.2 ile geçerli kabul edilen planning-pool dışı manual teacher/room placement override'ları şüpheli ama henüz kanıt değildir.
- 54 provisional salon sayısı 41 requirement sayısıyla çelişmez; metric card/placement sayısıdır, requirement sayısı değildir.

### Read-only diagnostic katmanı

Yeni core diagnostic:
```
8ad252ecaea95301be81bb264eefb553d239ba7b
feat: explain feasibility baseline changes
```

Yeni UI diagnostic:
```
831c3e4bd582d9d5509e6b69f0927f9511fa7489
feat: show feasibility baseline diagnostics
```

Test extension:
```
488b6c7285b2b1eb2a755e881f978bddc572e26c
test: explain feasibility baseline deviations
```

Diagnostic artık baseline issue listesi ve final in-memory solution ile baseline arasında değişen kartları listeler.
Her kart için sınıf/grup, ders, blok, önceki gün/saat/öğretmen/salon, bellekte bulunan çözüm ve reason code gösterilir.

Önemli reason code'lar:
- BASELINE_TEACHER_OUTSIDE_PLANNING_POOL
- BASELINE_ROOM_OUTSIDE_PLANNING_POOL
- BASELINE_TEACHER_CONFLICT
- BASELINE_ROOM_CONFLICT
- BASELINE_GROUP_CONFLICT
- BASELINE_REQUIREMENT_TEACHER_CONTINUITY
- BASELINE_MIN_DISTINCT_DAYS
- BASELINE_MAX_BLOCKS_PER_DAY
- BASELINE_MAX_CONSECUTIVE_PERIODS

Core diagnostic ve UI Vercel build PASS.

Sıradaki adım:
1. production refresh
2. Uygunluğu kontrol et yeniden çalıştır
3. yeni amber diagnostic panelindeki 6 changed card + reason code'ları incele
4. kök nedeni kanıtla
5. yalnız kanıta göre M33.2 semantiğini düzelt veya gerçek baseline rule violation olarak kabul et

M33.2 henüz CLOSED değildir.


## 57. 30 Eylül 2026 — M33.2 manual override false-positive fix / UI language cleanup

Kullanıcı yeni production diagnostic panelini gönderdi.

Observed changed cards:
- 5A BALLET · K. Bale · Blok 1 — zincirleme taşındı; direct card reason yok
- 5A BALLET · Point/Dans T. · Blok 1 — zincirleme taşındı; direct card reason yok
- 5A BALLET · V. Kondisyon · Blok 1 — zincirleme taşındı; direct card reason yok
- 8A BALLET · B. Uygulama · Blok 1 — mevcut öğretmen planning pool dışında
- 8A BALLET · K. Bale · Blok 1 — zincirleme taşındı; direct card reason yok
- STANDARD · 5A BALLET · Cuma ek dersi · K. Bale · Blok 1 — max consecutive periods ihlali

Diagnostic badge toplam 5 mevcut-program uyarısı gösterdi; bu sayı changed-card sayısı değildir.
Requirement-level max-consecutive uyarısı aynı requirement'ın yerinde kalan başka bloklarını da işaretleyebilir.

### Kök neden — manual override false positive

M29.4 / M32.4.2 sözleşmesi yeniden doğrulandı:
- manual teacher change için planning-pool üyeliği hard şart değildir
- selected teacher ACTIVE olmalıdır ve conflict üretmemelidir
- manual room change için planning-pool üyeliği hard şart değildir
- selected room ACTIVE olmalıdır; CAPABILITY mode ise capability/knowledge doğrulanır
- placement override planning pool'u mutate etmez

M33.2 baseline validator ise unlocked kartlarda baseline teacher/room'u planning pool membership ile doğruluyordu.
Bu, geçerli manual placement override'ı yanlışlıkla hard-invalid yapıyordu.

Fix:
```
bbcb7528ccde73b83122d1902d11c33a29792d0c
fix: honor manual resource overrides in feasibility baseline

79206cb6ca228525f0d0b24917a7f2a989c797dd
refactor: remove obsolete baseline pool check
```

Yeni baseline semantics:
- yeni alternatif teacher/room domain'leri planning pool'dan türetilir
- mevcut baseline'daki ACTIVE manual teacher/room, yalnız pool dışında olduğu için reddedilmez
- required teacher missing, inactive resource, capability mismatch, overlap,
  continuity ve structural limits hâlâ hard rule'dur
- full-search sırasında manual baseline candidate da önce denenir; yalnız gerektiğinde değiştirilir

Test güncellemesi:
```
74c8060da30fc45bebf0d7c9e9b3379c39ead691
test: preserve manual overrides in feasibility baseline
```

Ek test contract:
- active manual teacher outside pool => baseline FEASIBLE / zero-search
- active manual room outside pool => baseline FEASIBLE / zero-search
- real maxConsecutive violation => baseline hâlâ rejected

### Kullanıcı dili temizliği

Kullanıcı Optimizasyon ekranındaki teknik/geliştirici dilinin düzeltilmesini istedi.

Commits:
```
3d3028111725fe2a34e26161e6e4783481c5a375
polish: simplify optimization UI language

ce20ffc3b076c522c2b6a2bbb144195107a82a74
polish: remove developer jargon from optimization copy

e89d69414fb482932fcbfa3a4dc53101997f81c9
polish: keep diagnostic tooltips user-facing
```

UI değişiklikleri:
- hard rules → zorunlu kurallar
- solver hazırlığı → program çözümleme hazırlığı
- provisional salon → salon bilgisi henüz kesin değil / salonu belirsiz kart
- snapshot → programın anlık kopyası
- Supabase → veritabanı
- baseline → mevcut program / mevcut yerleşim
- reason code → kullanıcıya görünen neden etiketi
- arama düğümü → incelenen seçenek
- M33.2 internal label kullanıcı yüzünden kaldırıldı
- tooltip'te raw reason code gösterilmiyor

Architecture doc:
```
c67a57b0a071049de536f6aadb8a39c89a57a719
docs: align feasibility baseline with manual overrides
```

Build:
- bbcb7528 PASS
- 79206cb6 PASS
- 74c8060d PASS
- 3d302811 PASS
- ce20ffc3 PASS
- e89d6941 production build sonucu ayrıca kontrol edilecek

Sıradaki production acceptance:
1. sayfayı yenile
2. Uygunluğu kontrol et
3. 8A B. Uygulama için planning-pool uyarısı artık görünmemeli
4. bu kart mümkünse mevcut I. K. Alataş placement'ını korumalı
5. kalan uyarılar yalnız gerçek hard-rule nedenleri olmalı
6. özellikle STANDARD · 5A BALLET · Cuma ek dersi max-consecutive uyarısının devam edip etmediğine bak
7. changed-card / mevcut-program-uyarısı / incelenen-seçenek sayılarını kaydet

M33.2 bu rerun ve Vitest PASS olmadan CLOSED değildir.


## 58. 30 Eylül 2026 — M33.2 second production rerun

Manual override baseline fix production'a çıktıktan sonra kullanıcı uygunluk denetimini yeniden çalıştırdı.

Observed:
- changed cards: 4
- current-program warnings: 2
- 8A BALLET · B. Uygulama manual teacher override artık diagnostic listede yok
- planning-pool false positive kaldırıldı
- kalan changed cards:
  - 5A BALLET · K. Bale · Blok 1 — doğrudan kural ihlali yok, zincirleme move
  - 5A BALLET · Point/Dans T. · Blok 1 — doğrudan kural ihlali yok, zincirleme move
  - 5A BALLET · V. Kondisyon · Blok 1 — doğrudan kural ihlali yok, zincirleme move
  - STANDARD · 5A BALLET · Cuma ek dersi · K. Bale · Blok 1 — BASELINE_MAX_CONSECUTIVE_PERIODS
- visible placement for Cuma ek dersi:
  - baseline: Cum · 7. ders · E. Gemalmaz
  - temporary solution: Pzt · 5. ders · E. Gemalmaz

Interpretation:
- manual override semantics fix confirmed in production
- 4 changed cards are now driven by remaining real hard-rule warnings, not planning-pool membership
- badge shows 2 current-program warnings but changed-card list exposed only 1 direct warning; second warning is on a card that remained in place
- baselineAudit requirement-level max-consecutive check can mark multiple cards belonging to the violating requirement/day

UI diagnostic completeness fix:
```
3fba56e83f62422e9b582ddb8cf8b72971ef7f8d
feat: show complete feasibility warning sources

1c0cabe9449f3c8bcbf7f2a053b05f26324de607
polish: show placement for unchanged rule warnings
```

New UI behavior:
- changed cards remain in comparison list
- baseline issues belonging to unchanged cards are shown in separate
  `Yer değiştirmeyen ancak uyarı taşıyan dersler` section
- structural rule details show declared values where available:
  - maxConsecutivePeriods
  - maxBlocksPerDay
  - minDistinctDays
- unchanged warning cards also show current day/period/teacher/room

Purpose of next rerun:
1. identify exact second warning card
2. display declared maxConsecutivePeriods value for the affected requirement
3. decide whether the rule data itself is wrong or the current schedule really violates an intended rule
4. do not relax/remove the rule without evidence

M33.2 remains OPEN until this remaining hard-rule issue is classified and Vitest passes.


## 59. 30 Eylül 2026 — M33.2 third production rerun / rule mismatch isolated / plain-language rewrite

Kullanıcı production diagnostic ekranını yeniden doğruladı.

### Kalan kural uyuşmazlığı kesinleşti

Production sonucu:
- FEASIBLE alternatif bulundu
- mevcut yerleşim korundu: 296/300
- provisional room card count: 54
- changed card count: 4
- current program warning count: 2

Değişen dersler:
- 5A BALLET · K. Bale · 1. blok — direct issue yok; zincirleme move
- 5A BALLET · Point/Dans T. · 1. blok — direct issue yok; zincirleme move
- 5A BALLET · V. Kondisyon · 1. blok — direct issue yok; zincirleme move
- STANDARD · 5A BALLET · Cuma ek dersi · K. Bale · 1. blok
  - current: Cum 7. ders · E. Gemalmaz
  - alternative: Pzt 5. ders · E. Gemalmaz
  - BASELINE_MAX_CONSECUTIVE_PERIODS

Yerinde kalan ikinci uyarılı ders:
- STANDARD · 5A BALLET · Cuma ek dersi · K. Bale · 2. blok
  - current: Cum 8. ders · E. Gemalmaz
  - BASELINE_MAX_CONSECUTIVE_PERIODS

Snapshot requirement contract ekranda:
- maxConsecutivePeriods = 1

Dolayısıyla kalan problem solver algoritması değildir:
- aynı requirement'ın iki 1-period kartı mevcut programda Cuma 7 + 8 olarak peş peşe
- requirement kuralı ise aynı gün en fazla 1 consecutive period diyor
- mevcut schedule ile requirement structural rule birbirine aykırı
- bu kuralın iş gereği gerçekten 1 mi olması gerektiği kanıtlanmadan DB değeri değiştirilmemeli

M33.2 bu kural sınıflandırılana kadar OPEN.

### Kullanıcı dili geri bildirimi

Kullanıcı mevcut Optimizasyon UI dilini hâlâ fazla teknik buldu ve İngilizce kaynak isimlerin
kullanıcı yüzünde görünmemesini istedi.

Karar:
- internal code/schema/type isimleri değişmez
- kullanıcı yüzü sade yönetici Türkçesi kullanır
- teknik motor/DB kavramları normal kullanıcı ekranından çıkarılır
- source group adları sadece display aşamasında normalize edilir; DB değeri mutate edilmez

Yeni plain-language commits:
```
ec12dbbbb3d9dfca26b1253168e5f581ebf8980b
polish: rewrite program preferences in plain Turkish

a581a0eeef306125916a64a0b5b155483a91dc60
polish: simplify priorities navigation messages

a6d991a98f4097a143eb6e19c1372b5f65635c35
polish: rewrite priorities help in plain Turkish
```

Vercel build:
- ec12dbbb PASS
- a581a0ee PASS
- a6d991a9 PASS

User-facing terminology changes:
- top nav: Optimizasyon -> Öncelikler
- Hedef profilleri -> Kayıtlı ayarlar
- Profil adı -> Ayar adı
- Etkin profil -> Kullanılıyor / Bu ayarları kullan
- hedef -> tercih
- Program uygunluk denetimi -> Program kontrolü
- Uygunluğu kontrol et -> Programı kontrol et
- technical snapshot/browser-memory/database explanation removed
- search-node metric removed from normal UI
- changed-card language -> ders / alternatif yerleşim
- Blok -> bölüm (diagnostic display)
- STANDARD prefix hidden in diagnostic display
- BALLET -> BALE, MUSIC -> MÜZİK, SECTION -> ŞUBE in display only
- baseline/current technical wording replaced by current-program language
- provisional room -> salonu henüz kesinleşmeyen/belirlenmeyen ders
- max-consecutive warning -> Aynı gün peş peşe fazla ders var
- detail -> “Bu ders aynı gün en fazla N ders saati peş peşe yapılabilir.”

Objective cards plain language:
- Mevcut programı mümkün olduğunca koru
- Aynı öğretmeni mümkün olduğunca koru
- Öğretmen boşluklarını azalt
- Aynı dersi mümkün olduğunca aynı salonda tut

Normal UI no longer shows visited search node count.

Sıradaki adım:
1. production refresh ile plain-language UI browser smoke
2. Cuma ek dersi requirement rule source'unu belirle
3. intended rule gerçekten 2 consecutive periods ise additive migration/UI edit path ile düzelt
4. intended rule 1 ise mevcut schedule gerçek kural ihlalidir ve program tarafı düzeltilmeli
5. M33.2 Vitest
6. sonra M33.3


## 60. 30 Eylül 2026 — M33.2.1 Friday K. Bale rule source resolved

Kullanıcı Öncelikler ekranında öncelik seviyelerini değiştirmenin
`Programı kontrol et` sonucunu değiştirmediğini gözlemledi.

Bu beklenen M33.2 davranışı:
- feasibility motoru objective weights kullanmıyor
- yalnız hard-rule geçerliliğini sınar
- ilk feasible solution'da durur
- objective weights M33.3'e kadar çözüm seçimini etkilemez

UI açıklaması eklendi:
```
1383862c95c75a11ba4d8dbf5995c8545d1b74ce
polish: clarify priorities are not used by program check yet
```

Normal kullanıcıya artık açıkça:
“Buradaki öncelikler henüz bu kontrolün sonucunu değiştirmez.
Önceliklere göre farklı program seçenekleri üretme özelliği bir sonraki aşamada devreye girecek.”
mesajı gösteriliyor.

### Cuma ek dersi maxConsecutivePeriods=1 kaynağı

Repo geçmişi ve kalıcı proje kaydı birlikte incelendi.

M2.2 observed bootstrap:
`20260920021000_management_m2_2_observed_requirement_bootstrap.sql`
- min_distinct_days = NULL
- max_blocks_per_day = NULL
- max_consecutive_periods = NULL
- dolayısıyla stale `1` ilk requirement bootstrap'tan gelmiyor

M25 clean effective schedule bootstrap:
`20260923030000_management_m25_clean_effective_schedule_bootstrap.sql`
explicit runtime adjustment olarak:
- subject = K. Bale
- group = STANDARD • 5A BALLET • Cuma ek dersi
- block 1 => Friday period 7
- block 2 => Friday period 8
- teacher = E. Gemalmaz
yerleşimini authoritative clean draft'a materialize ediyor.

Kalıcı ürün kuralı AGENTS.md §5'te zaten:
`5A Cuma K. Bale | 13:50'den itibaren 2 ders · E. Gemalmaz`

Bu üç kanıt birlikte current `max_consecutive_periods=1` değerinin
güncel iş kuralıyla uyumsuz stale structural constraint olduğunu gösteriyor.

Fix yaklaşımı:
- solver hard rule gevşetilmedi
- current placement değiştirilmedi
- yalnız hedef requirement structural rule'u 1 -> 2 düzeltiliyor
- additive migration
- migration exact target + current state guard'ları taşıyor

Migration:
```
20260930110000_management_m33_2_1_friday_k_bale_consecutive_rule.sql
8c0fd2723c4842f04c3035f08c01626cf2793bfe
fix: align Friday K Bale consecutive lesson rule
```

Migration safety:
- 2026-2027 / term 1
- ACTIVE
- K. Bale
- exact group STANDARD • 5A BALLET • Cuma ek dersi
- exactly one requirement
- current max_consecutive_periods must be 1
- active DRAFT must exist
- exactly 2 cards
- both cards must be 1 period
- both placements must be Friday
- min/max period must be 7/8
- only then update max_consecutive_periods=2
- placements/teacher/room unchanged
- affected candidate subset refreshed

Read-only verification:
```
docs/sql/m33_2_1_friday_k_bale_rule_qa.sql
5a310106a4848446100259a8dd01b6dace1f8c11
test: add Friday K Bale rule verification
```

Expected QA:
- max_consecutive_periods = 2
- card_count = 2
- one_period_card_count = 2
- friday_placed_count = 2
- friday_min_period = 7
- friday_max_period = 8
- teacher_names = {E. Gemalmaz}
- qa_status = PASS

Migration/QA sonrası production `Programı kontrol et` beklenen:
- Cuma ek dersi warning yok
- changed card diagnostic kaybolur
- baseline feasible ise 300/300 reuse
- program mutation yok

M33.2 bu apply + QA + browser rerun + Vitest sonrası CLOSED kabul edilecek.


## 61. 30 Eylül 2026 — M33.2.1 migration UUID aggregate hotfix

İlk migration çalıştırma denemesi transaction'ın ilk DO bloğunda durdu:

```
ERROR: function min(uuid) does not exist (SQLSTATE 42883)
```

Kök neden:
- requirement sayımı ve tek UUID seçimi aynı aggregate sorguda
  `min(requirement.id)` ile yapılmıştı
- PostgreSQL bu ortamda UUID için `min(uuid)` aggregate'i sağlamıyor

Önemli:
- hata ilk DO bloğunda, UPDATE öncesinde oluştu
- explicit `begin;` transaction error state'e geçti
- migration veri değişikliği yapmadan başarısız oldu
- migration applied kabul edilmedi; aynı dosyayı düzeltmek güvenli

Hotfix:
```
9cf4df58ca647785352fd5147e5ef165e8ad1b64
fix: avoid uuid aggregate in M33.2.1 migration
```

Yeni yaklaşım:
1. exact target count ayrı `count(*)` sorgusuyla alınır
2. count=1 ise requirement UUID ayrı `select id ... limit 1` ile alınır
3. kalan safety guard ve update semantiği değişmez

Dosyanın kalan PostgreSQL kullanımları tekrar gözden geçirildi:
- min/max(start_period) numeric/smallint aggregate
- count FILTER
- PL/pgSQL FOUND
- uuid[] ARRAY subquery
uygun.

Sıradaki adım:
- repo güncellendikten sonra migration dry-run/push yeniden çalıştır
- ardından docs/sql/m33_2_1_friday_k_bale_rule_qa.sql


## 62. 30 Eylül 2026 — Codespaces çalışma ortamı + M33.2.1 QA PASS

### Aktif çalışma ortamı sözleşmesi

Kullanıcı projenin bir süredir GitHub Codespaces üzerinde yürütüldüğünü ve ortam değişikliklerini
bundan sonra açıkça bildireceğini belirtti.

Kalıcı çalışma kuralı:
- aktif ortam: **GitHub Codespaces**
- çalışma dizini: `/workspaces/msgsud-bale-programi`
- terminal: Linux/bash
- npm/npx komutları: `npm`, `npx`
- **`npm.cmd` / `npx.cmd` kullanılmaz**
- build: `npm run build`
- test: `npm test`
- Supabase CLI: `npx supabase ...`
- kullanıcı yeni bir ortam bildirmedikçe Codespaces geçerli kabul edilir
- ortam değişikliğinde kullanıcı haber verir; asistan aynı oturumda AGENTS.md ve continuation handoff'u günceller

### M33.2.1 migration + QA sonucu

UUID aggregate hotfix sonrasında migration başarıyla uygulandı.

Kullanıcının read-only QA çıktısı:
```
requirement_id = bf0f82f8-e370-4426-9ea3-56b9e8462bf0
max_consecutive_periods = 2
card_count = 2
one_period_card_count = 2
friday_placed_count = 2
friday_min_period = 7
friday_max_period = 8
teacher_names = ["E. Gemalmaz"]
qa_status = PASS
```

Sonuç:
- M33.2.1 DB düzeltmesi PASS
- Cuma ek dersi structural rule artık confirmed schedule ile uyumlu
- iki 1-saatlik kart korunmuş
- Cuma 7 ve 8. ders korunmuş
- E. Gemalmaz korunmuş
- migration placement/teacher/room'u bozmadı

M33.2 kapanış için kalan:
1. production Öncelikler > Programı kontrol et browser rerun
2. beklenen: mevcut program artık hard-rule açısından baseline-feasible
3. ideal smoke: 300/300 yerinde kalan ders, kural uyuşmazlığı yok
4. Codespaces'te `npm test` ile Vitest PASS
5. ardından M33.2 CLOSED ve M33.3'e geçiş


## 63. 30 Eylül 2026 — M33.2 CLOSED / production 300 of 300 + 72 tests PASS

M33.2.1 migration + QA sonrasında kullanıcı production Öncelikler ekranında
`Programı kontrol et` işlemini yeniden çalıştırdı.

Browser smoke sonucu:
- `Kurallara uygun bir yerleşim bulundu`
- `Mevcut program bütün zorunlu kuralları karşılıyor`
- `Yerinde kalan ders: 300/300`
- `Salonu henüz belirlenmeyen ders: 54`
- Cuma ek dersi kural uyuşmazlığı diagnostic'i yok
- changed-card diagnostic yok
- program mutation yok

Bu, baseline fast-path'in production'da doğrulandığı anlamına gelir:
- baselineWasFeasible=true
- 300 kartın tamamı korunuyor
- solver alternatif placement aramak zorunda kalmıyor

Codespaces test:
```
npm test
```

Sonuç:
- Test Files: 14 passed / 14
- Tests: 72 passed / 72
- `lib/managementSolverPrototype.test.ts`: 8 tests PASS

Codespaces build:
```
npm run build
```

Sonuç:
- Next.js 16.3.4 webpack production build PASS
- TypeScript PASS
- static generation PASS
- `/yonetim` build PASS

### M33.2 karar

**M33.2 CLOSED / PASS**

Doğrulanan invariantlar:
- snapshot + in-memory feasibility
- hard constraints
- manual placement override semantiği
- M22 UNKNOWN room provisional semantiği
- baseline fast path
- no placement writes
- no automatic apply
- diagnostic explanation
- production 300/300 baseline reuse

### M33.3 başlangıç kapsamı

Sıradaki paket **M33.3 explainable objective optimization**.

Amaç:
- kullanıcı Öncelikler'deki ağırlıkları değiştirdiğinde sonuç gerçekten değişebilsin
- birden fazla hard-feasible çözüm arasında tercih profiline göre seçim yapılsın
- current schedule referans/baseline olarak kalsın
- program otomatik değiştirilmesin

M33.3-v0 hedefleri:
1. solution objective metric vector:
   - changeCost
   - preferredTeacherContinuityBreaks
   - teacherIdleGapPeriods
   - roomStabilityBreaks
2. normalized weighted objective score
3. deterministic in-memory improvement/search
4. baseline vs proposed metric delta
5. changed-card explanation
6. read-only preview UI
7. no Supabase placement mutation
8. no automatic apply

M33.3 search güvenlik ilkesi:
- 300-card full combinatorial exhaustive search yapılmayacak
- feasible baseline'dan deterministic local-improvement neighborhood başlanacak
- locked cards değişmez
- hard constraints her candidate move'da korunur
- objective weight = 0 ise ilgili metric çözüm seçimini etkilemez
- score improvement yoksa baseline korunur
- browser freeze riskine karşı move/iteration guard bulunur


## 64. 30 Eylül 2026 — M33.3-v0 weighted objective optimization implemented

M33.2 CLOSED sonrasında M33.3-v0 implementation başladı.

Core:
```
b14ca08089a47e0a4bc268107c0afe98b9884b33
feat: add weighted in-memory objective optimizer
```

Test:
```
f5f20f06881cd8b5ca86bb157a12e106caf6aef9
test: cover weighted objective optimization
```

UI:
```
00525899ec3e519ee7f356d949f327cfbd89958a
feat: expose preference-driven program option preview
```

Terminology:
```
507ca5a5c493b6b3f6ad0b86207f02b201b69c32
polish: finish priorities sidebar terminology
```

Contract:
```
51024660122838a3f45e6c0b3c93c0cfabf59688
docs: define M33.3 preference optimization contract
```

Vercel build:
- core b14ca080 PASS
- test commit f5f20f06 PASS
- UI 00525899 PASS
- terminology commit build pending at journal write time

### M33.3-v0 metric vector

Her solution için:
- changeCost
- preferredTeacherContinuityBreaks
- teacherIdleGapPeriods
- roomStabilityBreaks

changeCost:
- baseline'a göre değişen day/time/teacher/room kararlarının sayısı

Ağırlıklı score:
- her raw metric / cardCount
- normalized metric * 0..1000 user weight
- toplam düşükse tercih edilir
- weight=0 ise metric score'a girmez

### Search

Global exhaustive optimum aranmaz.

Deterministic local best-improvement:
- feasible baseline start
- locked cards immutable
- structural domains cache
- current placement'a en yakın candidate neighborhood
- hard feasibility her move'da doğrulanır
- strict score improvement dışında move kabul edilmez
- max 8 accepted iterations
- card başına 24 evaluated neighborhood candidate
- card domain guard 400

M22:
- UNKNOWN requirement'ın baseline room evidence'i soft score uğruna null'a düşürülmez

M32.4.2:
- active manual override baseline'da korunur
- alternatives planning pool'dan gelir
- öneri auto-apply edilmez

### User flow

`Programı kontrol et`:
- hard rules only
- preferences kullanmaz

`Bu tercihlerle seçenek oluştur`:
- ekrandaki mevcut weights'i doğrudan kullanır
- profile save zorunlu değildir
- read-only öneri üretir

UI sonucu:
- IMPROVED / UNCHANGED / BLOCKED
- changeCost baseline -> proposed
- teacher continuity baseline -> proposed
- teacher idle gaps baseline -> proposed
- room stability baseline -> proposed
- first 12 changed lessons current vs proposal
- no database write

### Unit test scenarios

Yeni `lib/managementObjectiveOptimizer.test.ts`:
1. teacherIdleGaps-only => gap 1 -> 0, one move
2. equal changeCost + gap tradeoff => baseline preserved
3. roomStability-only => room break 1 -> 0
4. zero supported weights => BLOCKED

M33.3 henüz CLOSED değil.

Kalan acceptance:
1. Codespaces git pull
2. npm test
3. npm run build
4. production browser refresh
5. at least two materially different priority combinations
6. verify result changes or UNCHANGED changes consistently
7. verify no schedule mutation
8. measure browser responsiveness / elapsed time


## 65. 30 Eylül 2026 — M33.3 optimizer test tie-case hotfix

Codespaces acceptance run:
- build PASS
- Vitest: 75 PASS / 1 FAIL

Failing test:
`lib/managementObjectiveOptimizer.test.ts`
`reduces teacher gaps when that is the only active priority`

Observed:
- optimizer correctly reduced teacherIdleGapPeriods 1 -> 0
- changeCost = 1
- exactly one card changed
- test expected specifically c2 startPeriod 2
- deterministic tie-break instead moved c1 to period 2 and left c2 at period 3

Both solutions are objective-equivalent:
- periods 1+2
- periods 2+3
Both produce zero teacher gap with one changed decision.

Conclusion:
- optimizer behavior is valid
- test was over-specified to one equivalent card identity

Hotfix:
```
74f1b66d4b8c81b39727d152af1f1e39a08bcf96
test: accept equivalent teacher-gap improvements
```

New assertion:
- two placements remain on Monday
- their start periods are consecutive
- does not force which specific card moves

Next:
`git pull --ff-only && npm test`
Expected: 76/76 PASS.
Build already passed before this test-only hotfix; rerun build optional unless full acceptance is desired.


## 66. 30 Eylül 2026 — M33.3 production A/B smoke exposed local optimum weakness

Kullanıcı production'da önerilen iki öncelik kombinasyonunu çalıştırdı.

Chronological screenshots:
- 14:16:22
  - changed decision cost: 0 -> 11
  - preferred teacher continuity: 0 -> 0
  - teacher idle gaps: 97 -> 67
  - room stability breaks: 40 -> 39
  - changed lessons shown: 8
- 14:16:53
  - changed decision cost: 0 -> 12
  - preferred teacher continuity: 0 -> 0
  - teacher idle gaps: 97 -> 67
  - room stability breaks: 40 -> 40
  - changed lessons shown: 8

Test intent:
A. teacherIdleGaps only
B. changeCost + teacherIdleGaps

Observed problem:
- B, which includes "preserve current program", produced MORE changed decisions (12 vs 11)
- gap improvement stayed identical (97 -> 67)
- room metric also became worse (40 vs 39)

Interpretation:
- objective weights are now actually affecting search
- but single-start greedy local improvement can converge to a weaker local optimum
- this is not acceptable for M33.3 acceptance because a combined-priority run must not ignore an already-discovered solution that scores better under the same combined weights

### Multi-seed search hardening

Core:
```
d656b22cc679bf09576388319636e28ee833cfd0
feat: add multi-seed objective search
```

New behavior:
1. baseline remains a candidate
2. combined-weight greedy local search runs
3. for each active supported non-changeCost objective, a single-objective local search seed is also generated
4. every seed is re-scored with the user's actual combined weights
5. candidate solutions are sorted by:
   - combined total score
   - changeCost
   - teacher continuity breaks
   - teacher idle gaps
   - room stability breaks
   - deterministic source key
6. lowest combined score is returned

This means:
- if teacher-gap-only search found 11 changes / 67 gaps,
- and combined greedy found 12 changes / 67 gaps,
- combined run will now select the former when changeCost is also active, because it has the lower combined score.

Search remains read-only and in-memory.

Regression:
```
b05860c4f27e0bbf65350a5cb6f36339ea878d17
test: guard combined search against weaker local optimum
```

Regression invariant:
- combined-weight result must have combined cost <= a relevant single-objective seed evaluated under those same combined weights

Vercel:
- d656b22c PASS
- b05860c4 PASS

### Remaining display-language cleanup

Production result list exposed remaining English source group labels:
- PARALELL
- SHARED

Display-only normalization:
```
21c87adb28f77625ccab77132b08fb3de91f8eff
polish: localize remaining group labels
```

Display:
- PARALELL / PARALLEL -> PARALEL
- SHARED -> ORTAK
- underlying DB values unchanged

M33.3 remains OPEN pending:
- Codespaces full Vitest after tie-case + multi-seed regression
- production A/B rerun with same two preference scenarios
- verify combined scenario no longer returns a worse combined score than gap-only seed
- no schedule mutation


## 67. 30 Eylül 2026 — M33.3 multi-seed production A/B PASS

Kullanıcı multi-seed düzeltmesi production'a çıktıktan sonra aynı A/B smoke'u yeniden çalıştırdı.

Chronological screenshots:
- 14:26:46 — scenario A: yalnız `Öğretmen boşluklarını azalt = Çok yüksek`
  - changeCost: 0 -> 12
  - preferredTeacherContinuityBreaks: 0 -> 0
  - teacherIdleGapPeriods: 97 -> 67
  - roomStabilityBreaks: 40 -> 40
  - changed lesson list: 8 visible
- 14:27:40 — scenario B:
  `Mevcut programı mümkün olduğunca koru = Çok yüksek`
  +
  `Öğretmen boşluklarını azalt = Çok yüksek`
  - changeCost: 0 -> 10
  - preferredTeacherContinuityBreaks: 0 -> 0
  - teacherIdleGapPeriods: 97 -> 67
  - roomStabilityBreaks: 40 -> 40
  - changed lesson list: 8 visible

Acceptance interpretation:
- same teacher-gap improvement: 30 periods removed in both scenarios
- preserve-current-program priority reduced changeCost from 12 to 10
- combined-priority run is now more conservative, as intended
- previous local-optimum pathology (combined 12 vs single 11) is no longer present
- weights demonstrably affect returned solution
- result remains read-only; UI still states program was not changed

Display-language acceptance:
- `PARALELL/PARALLEL` now appears as `PARALEL`
- `SHARED` now appears as `ORTAK`
- production screenshot confirms display-only localization

### M33.3-v0 browser acceptance

**PASS**

Confirmed:
1. different priority combinations return materially different solutions
2. preserve-current-program priority decreases disruption at equal teacher-gap benefit
3. teacher continuity metric remains unchanged where not affected
4. room stability metric remains stable in this A/B pair
5. no auto-apply
6. UI remains responsive in production
7. localized group labels render correctly

Remaining before M33.3-v0 CLOSED:
- Codespaces full Vitest after:
  - tie-case hotfix `74f1b66d`
  - multi-seed regression `b05860c4`
- expected current suite: 15 test files, 77 tests if the new regression is included
- production build evidence already PASS for core and regression; browser runtime also confirms deployed code


## 68. 30 Eylül 2026 — Öncelikler sayfası seçim/onay/çalışma akışı refactor

Kullanıcı Öncelikler sayfasında üç ayrı UX problemi bildirdi:
- kayıtlı ayar seçme/değiştirme mantığı belirsiz
- hangi işlemin kaydettiği / hangisinin sadece deneme yaptığı belirsiz
- program kontrolü, tercih düzenleme ve seçenek üretme bölümlerinin sayfa sırası ters

### Kalıcı UX kararı

Sayfa artık üç aşamalı okunur:
1. **Tercih ayarı**
2. **Program kontrolü**
3. **Program seçeneği**

Anlam:
- Tercih ayarı: kullanıcı neyi önemsediğini düzenler
- Program kontrolü: yalnız zorunlu kuralları kontrol eder
- Program seçeneği: ekrandaki tercihlerle read-only alternatif üretir

### Seçim güvenliği

Commit:
```
688f8df683f083d4c47dafd2a26795addb38cb12
feat: guard preference selection and activation flow
```

Davranış:
- kaydedilmemiş değişiklik varken başka profile / +Yeni'ye geçiş sessizce veri kaybettirmez
- sidebar uyarısı:
  - Burada kal
  - Değişiklikleri bırak ve geç
- profile değişince eski optimization preview temizlenir
- edit devam ederse pending profile switch iptal edilir

### Editor state görünürlüğü

Commit:
```
a0384694695f8be2e3b88f819e4f78e1a591e7a6
feat: make preference editor state explicit
```

UI:
- aktif profile adı header'da `Kullanımda: ...`
- dirty state `Kaydedilmemiş değişiklikler`
- durum:
  - Kullanımda
  - Kullanımda · değiştirildi
  - Taslak
  - Taslak · değiştirildi
  - Yeni · kaydedilmedi

### Save / activate semantics

Commit:
```
24543f0bf380a477dd5c72ad168b1922b3bef59c
refactor: align preferences page with save-use-run workflow
```

Active profile:
- değişiklik yoksa `Kaydedildi · kullanımda`
- dirty ise `Değişiklikleri kaydet`
- same active profile save ACTIVE kalır

Draft/new:
- `Taslak olarak kaydet`
- `Kaydet ve kullan`
- saved draft için `Kullanıma al`

Başka profile ACTIVE yapılacaksa explicit confirmation gerekir:
- mevcut active profile adı
- yeni profile adı
- `Vazgeç`
- `Onayla ve kullan`

Bu işlem yalnız preference default'unu değiştirir; schedule placement state'ini değiştirmez.

### Sayfa sırası

Commit:
```
c97b9ab07e0a898a27552a0c06ce53756ba55e76
refactor: place preference feedback in the correct workflow step
```

Yeni sıra:
- header / profile state
- ayar adı + not
- objective priority cards
- henüz kullanılamayan preference özeti
- save/use action bar
- 2 · Program kontrolü
- hard-rule result + diagnostic
- 3 · Program seçeneği
- weighted suggestion result

Hard-rule diagnostic artık 1. adımda değil, 2. Program kontrolü altında.

### Hiyerarşi / responsive cleanup

Commit:
```
f3342697d679dcfdc9d53d539408ee6ec469fd6b
polish: simplify preferences page hierarchy
```

- saved settings sidebar sticky
- desktop sidebar 260px
- smaller viewport'ta tek kolon
- objective cards responsive 1 -> 2 columns
- metric cards responsive 2 -> 4 columns
- UNKNOWN room notice Program kontrolü bölümüne taşındı
- unavailable preference cards tek compact bilgi satırına indirildi

### Preview provenance

Commit:
```
283290f73f2617dc33e4dfa9ef263afc7267e769
polish: label preference preview provenance
```

Program seçeneği sonucu artık hangi state ile hesaplandığını söyler:
- Kaydedilmemiş tercihlerle hesaplandı
- Kullanımdaki ayarla hesaplandı
- Kayıtlı taslakla hesaplandı
- Ekrandaki tercihlerle hesaplandı

Optimization preview için save zorunlu değildir.
Profile save / activation ile preview birbirinden bağımsızdır.

### Build

- 688f8df6 Vercel PASS
- a0384694 Vercel PASS
- 24543f0b Vercel PASS
- c97b9ab0 Vercel PASS
- f3342697 deployment pending/smoke required at journal time
- 283290f7 deployment pending/smoke required at journal time

Acceptance:
- production refresh
- dirty profile switch warning
- activation replacement confirmation
- 1 -> 2 -> 3 section order
- preview without save
- saved/unsaved provenance badge
- no schedule mutation


## 69. 30 Eylül 2026 — Öncelik kartları akordeonlaştırıldı

Kullanıcı Öncelikler ekranındaki dört tercih kartının açıklama + seviye seçimlerinin sürekli açık olmasının sayfayı gereksiz uzattığını belirtti.

UX kararı:
- dört ayrı büyük kart kaldırıldı
- tek bir `Tercihler` paneli içinde dört satırlık accordion kullanıldı
- kapalı satırda yalnız:
  - tercih başlığı
  - mevcut seviye (Kapalı / Düşük / Orta / Yüksek / Çok yüksek)
  - aç/kapa işareti
- satır açıldığında:
  - açıklama
  - mevcut program metriği
  - 5 seviye düğmesi
görünür
- aynı anda yalnız bir tercih açık kalır
- seviye değişikliği mevcut dirty/save/preview davranışını değiştirmez

Commit:
```
c8830c24171ac560a49868ed0a282beeda018926
polish: collapse preference controls into accordion
```

Amaç:
- vertical scroll azaltmak
- kullanıcıya önce mevcut seçim durumunu göstermek
- ayrıntıyı yalnız gerektiğinde açmak
- 1. Tercih ayarı bölümünü daha kompakt hale getirmek


## 70. 30 Eylül 2026 — Tercih akordeonu dropdown ile sadeleştirildi

Kullanıcı accordion yerine doğrudan dropdown kullanımının daha sade olacağını belirtti.

Karar:
- accordion tamamen kaldırıldı
- her tercih tek satır:
  - tercih adı
  - küçük mevcut-program metriği
  - sağda native select
- seçenekler:
  - Kapalı
  - Düşük
  - Orta
  - Yüksek
  - Çok yüksek
- açıklama metinleri sürekli gösterilmez
- extra open/close state kaldırıldı
- dirty/save/preview davranışı değişmez

Commit:
```
68902c7fe208643b12a215b8d4ba2772e8b6047b
polish: replace preference accordion with dropdowns
```

Amaç:
- tek hamlede seçim
- daha az dikey alan
- daha az etkileşim adımı
- daha doğrudan ayar ekranı


## 71. 30 Eylül 2026 — Öncelikler sayfasındaki tekrarlar azaltıldı

Kullanıcı production ekranında aynı durum bilgisinin birden fazla yerde tekrarlandığını gösterdi.

Kaldırılan tekrarlar:
- üst header'daki `Kurallar hazır` badge
- üst header'daki `Kullanımda: <ayar>` badge
- üst header'daki `Kaydedilmemiş değişiklikler` badge
- Ayar adı kartındaki ayrı `Durum` alanı
- active+clean durumda alttaki `Kaydedildi · kullanımda` action bar
- action bar içindeki profile adı / kullanımda badge / açık tercih sayısı tekrarları
- ayrı `Daha sonra açılacak tercihler` kartı
- Program kontrolü içindeki ikinci açıklama/info kutusu

Yeni tek-kaynak ilkesi:
- active/taslak bilgisi: sol `Kayıtlı ayarlar` listesi
- dirty state: yalnız gerçekten dirty ise compact amber save row
- hard readiness: normal durumda gösterilmez; sorun varsa Program kontrolü altında error gösterilir
- future objectives: Tercihler panelinin footer'ında tek satır `Yakında: ...`
- Program kontrolü açıklaması: tek cümle

Active + clean durumda save/action row hiç render edilmez.

Draft/new durumda yalnız gerekli eylem düğmeleri görünür:
- Taslak olarak kaydet
- Kullanıma al / Kaydet ve kullan

Commit:
```
94eb8b34a9aa359aec4fb453b597d15a7a87686b
refactor: remove repeated state from preferences page
```

Amaç:
- information duplication azaltmak
- status yerine actionable UI göstermek
- 1. Tercih ayarı bölümünü belirgin şekilde kısaltmak
- Program kontrolü metnini tek açıklamaya indirmek


## 72. 30 Eylül 2026 — Öncelikler UI freeze / M33.3 closure gate

Kullanıcı mevcut sadeleştirilmiş Öncelikler görünümünü şimdilik koruma kararı verdi.

### UI freeze

Bu görünüm **checkpoint/freeze** kabul edilir.

Kural:
- kullanıcı açıkça istemedikçe Öncelikler sayfasının yerleşimi, hiyerarşisi ve temel görsel yapısı değiştirilmez
- sonraki teknik paketlerde yalnız işlevsel gereksinim varsa minimal ekleme yapılır
- yeni özellik sırf eklendi diye mevcut sade düzen yeniden büyütülmez

Frozen structure:
1. sol Kayıtlı ayarlar
2. 1 · Tercih ayarı
3. Ayar adı / isteğe bağlı not
4. compact preference dropdown rows
5. dirty ise compact save action
6. 2 · Program kontrolü
7. 3 · Program seçeneği

No-repeat principle:
- active/taslak status tek kaynak: sidebar
- clean active state için action/status tekrarı yok
- success readiness badge yok
- yalnız sorun/eylem varsa ek UI gösterilir

### M33.3 closure gate

Browser acceptance zaten PASS:
- weights solution selection'ı değiştiriyor
- multi-seed fix production A/B PASS
- preserve-current objective eşit teacher-gap benefit'te disruption'ı 12 -> 10 düşürdü
- no auto apply
- production responsive

M33.3 CLOSED olmadan önce kalan zorunlu kanıt:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Beklenen:
- full Vitest PASS
- Next/TypeScript build PASS

Bu kanıt geldikten sonra M33.3 CLOSED/PASS.

### Sonraki paket

AGENTS tarihinde M33.4 için daha önce bağlayıcı bir kapsam yok.

M33.3 kapanınca önerilen sıradaki paket:
**M33.4 explicit proposal review/apply**
- generated proposal kalıcı schedule state değildir
- current vs proposed full diff review
- explicit human confirmation
- apply öncesi fresh snapshot/hash guard
- atomic apply
- undo/redo integration
- apply sonrası hard-rule revalidation
- auto apply kesinlikle yok

M33.4 kapsamı M33.3 kapanışından sonra kesinleştirilecek.


## 73. 30 Eylül 2026 — M33.3 CLOSED/PASS

Final Codespaces acceptance:

```
Test Files 15 passed (15)
Tests 77 passed (77)
```

Optimizer:
- `lib/managementObjectiveOptimizer.test.ts`: 5/5 PASS
- `lib/managementSolverPrototype.test.ts`: 8/8 PASS

Production build:
- Next.js 16.3.4 webpack compile PASS
- TypeScript PASS
- static generation PASS
- `/yonetim` route PASS

Browser acceptance daha önce:
- preference weights solution selection'ı materially değiştiriyor
- teacher-gap-only vs preserve-current + teacher-gap A/B PASS
- equal gap benefit'te preserve-current disruption'ı 12 -> 10 düşürüyor
- multi-seed local-optimum hardening production PASS
- read-only / no auto-apply
- responsive UI
- localized group labels PASS

### M33.3 karar

**CLOSED / PASS**

M33.3 tamamlanan sözleşme:
- weighted objective vector
- deterministic local improvement
- multi-seed candidate selection
- hard-feasible move guard
- baseline comparison
- read-only proposal
- current-vs-proposed changed lesson explanation
- no Supabase trial-and-error writes
- no automatic apply

### UI freeze

Öncelikler sayfasının mevcut görünümü kullanıcı tarafından kabul edildi.
Kullanıcı açıkça istemedikçe layout/hiyerarşi değiştirilmez.

### M33.4 açılışı

Sıradaki paket:
**M33.4 explicit proposal review/apply**

İlk zorunlu iş:
- mevcut placement transaction / undo / redo altyapısını incele
- yeni paralel apply sistemi yazma
- proposal apply mümkünse mevcut atomic transaction sisteminden geçir
- current snapshot/baseline hash stale ise apply reddedilsin
- apply yalnız explicit human confirmation ile
- apply sonrası hard-rule validation
- undo/redo aynı işlem kaydını geri alabilmeli
- auto-apply kesinlikle yok


## 74. 30 Eylül 2026 — M33.4-v0 explicit proposal apply implementation

M33.3 CLOSED sonrası mevcut management transaction altyapısı incelendi.

### Reuse kararı

Yeni solver apply transaction motoru yazılmadı.

Mevcut:
- M26.8 `management_move_card_bundle`
- bundle root tagging
- `management_undo_bundle`
- `management_redo_bundle`
- ManagementCommandState
altyapısı proposal apply için yeterli.

M33.3-v0 accepted move guard = 8.
M26.8 bundle contract = 1..24 cards.
Dolayısıyla current proposal boyutu mevcut atomic bundle sınırının içinde.

### Safe apply preparation

Commit:
```
19e6c964f72d517d63970d7e344e7802add6e96d
feat: prepare safe solver proposal apply plan
```

Yeni helper:
`lib/managementSolverProposal.ts`

Apply guard:
- proposal status IMPROVED
- fresh workspace mevcut
- fresh snapshotHash == proposal snapshotHash
- fresh baselineHash == proposal baselineHash
- changed final placement count >= 1
- changed count <= 24

Stale:
`Program, öneri oluşturulduktan sonra değişti. Seçeneği yeniden hesaplayın.`

### Unit tests

Commit:
```
0669ab2f6f4ce96f9bd280a7880da17903ee7c93
test: cover solver proposal freshness and bundle preparation
```

Coverage:
- changed placements -> atomic bundle items
- stale baseline reject
- stale structural snapshot reject
- non-improved / no-op reject

### Explicit confirmation UI

Commit:
```
f4b44a345ef75ade776da0e0a8bc6793ef34bc68
feat: add explicit solver proposal apply confirmation
```

Frozen layout korunarak yalnız Program seçeneği sonucunun altına minimal action eklendi:
- Öneriyi uygula
- confirmation
- Vazgeç
- Onayla ve uygula

Confirmation değişecek ders sayısını ve fresh-state check'i açıklar.

### Atomic apply wiring

Commit:
```
29b01fa94ede126eb62ab193dd85bdad4495efb6
feat: apply fresh solver proposals through atomic bundle move
```

Flow:
1. user confirms
2. `fetchLatestManagementSolverWorkspace`
3. snapshotHash + baselineHash freshness guard
4. final changed placements bundle items
5. existing `moveManagementCardBundle`
6. M26.8 exact VALID+complete candidate validation
7. one DB transaction
8. normal bundle history
9. refresh
10. existing Geri Al / Yinele

No new migration.
No trial-and-error Supabase writes.
No automatic apply.

Success:
`N ders için önerilen yerleşim uygulandı. İşlem Geri Al ile tek adımda geri alınabilir.`

### Contract

```
f5bac7ead73937f9566bbeb3a8996cace67f4a56
docs: define M33.4 explicit proposal apply contract
```

Vercel:
- 19e6c964 PASS
- 0669ab2f PASS
- f4b44a34 PASS
- 29b01fa9 PASS

M33.4 henüz CLOSED değil.

Acceptance:
1. Codespaces npm test
2. npm run build
3. proposal üret
4. apply confirmation / cancel
5. confirmed apply
6. Program view proposed placements
7. Geri Al one-step
8. Yinele one-step
9. stale proposal rejection
10. apply sonrası Programı kontrol et -> hard-rule valid / 300/300


## 75. 30 Eylül 2026 — M33.4 browser regression: history race + bundle redo

Kullanıcı gerçek browser acceptance sırasında optimizer proposal apply yaptı.

Gözlem:
- proposal confirmation UI çalıştı
- proposal programda uygulandı
- Geri Al çalıştı
- art arda ikinci Geri Al ilk tıklamada
  `M26 active bundle root not found`
  verdi; ikinci denemede çalıştı
- Yinele:
  `Seçtiğiniz yer artık uygun değil. Veriyi yenileyip yeniden deneyin.`
  ile başarısız oldu
- Öncelikler / proposal alanındaki 8–10px metinler kullanıcı tarafından fazla küçük bulundu

### Kök neden 1 — stale history descriptor race

`runUndo` / `runRedo` başarıdan sonra yalnız `refreshToken` artırıyordu.
Server transaction tamamlanmışken yeni workspace fetch bitene kadar eski
`commandState` birkaç render boyunca aktif kalabiliyordu.

Hızlı sonraki tıklama artık aktif olmayan eski root transaction id'sini yeniden
gönderiyordu. Bu, görülen `active bundle root not found` hatasıyla uyumludur.

Fix:

```
5e5ac459ba5fcf608b88c26df6cd53aa3b740248
fix: prevent stale history clicks during refresh
```

Davranış:
- successful apply / undo / redo sonrası commandState hemen null
- fresh server state gelene kadar history buttons disabled
- history buttons ayrıca `dataLoading` sırasında disabled

### Kök neden 2 — bundle REDO sibling self-conflict

M26.8 grouped MOVE önce bütün bundle'ı external occupancy'ye göre doğru
biçimde validate ediyor, ancak sonrasında her üyeyi
`management_move_bundle_member` ile tekrar tek tek exact-candidate validate
ediyordu.

UNDO sonrası REDO'da siblings eski/geri alınmış konumlarında bulunduğu için
ilk replay edilen kart diğer bundle üyelerini geçici blocker olarak görebiliyor.
Böylece final hedef bütün olarak valid olmasına rağmen single-card validation
`target candidate no longer exists / invalid` üretiyor.

Fix migration:

```
20260930160000_management_m33_4_1_bundle_redo.sql
ffe546b6a72ead9066fcf96e8fae5a869ec310bd
fix: replay grouped moves as one bundle on redo
```

M33.4.1:
- complete MOVE bundle external occupancy'ye karşı bir kez validate edilir
- member writes ikinci single-card candidate validation yapmadan aynı DB
  transaction içinde yürür
- candidate delta external cards için korunur
- final bundle subset refresh yapılır
- ordinary MOVE bundle REDO targetları topluca reconstruct edilir
- REDO aynı simultaneous bundle path ile uygulanır
- yeni replay roots `ROOT_REDO` audit metadata'sına çevrilir
- ROOT_UNDO rows redone olarak işaretlenir
- sonraki Geri Al/Yinele zinciri korunur
- M29 placement-resource override redo özel M29.5 yolunda kalır

Migration Vercel source build: PASS.
Remote Supabase apply henüz browser tarafından doğrulanmadı.

### UX text size

Commit:
```
b1338e8bdfc1d1aa560c32d99d7417e5d32846dd
ux: increase priorities workspace text size
```

Öncelikler workspace body/helper text minimumları yükseltildi:
- 8px -> 10px
- 9px -> 11px
- 10px -> 12px
- compact uppercase kickers 11px

Program toast:
- title 12px
- body 11px

Layout/hierarchy değiştirilmedi; yalnız readability düzeltildi.

### M33.4 durumu

**OPEN — regression fixes pending Codespaces + migration + browser acceptance.**

Sıradaki acceptance:
1. git pull
2. npm test
3. npm run build
4. supabase migration list
5. db push --dry-run => yalnız M33.4.1
6. db push
7. mevcut pending Yinele'yi dene
8. Geri Al -> Yinele -> Geri Al art arda; stale transaction hatası olmamalı
9. proposal apply -> undo -> redo
10. post-redo Programı kontrol et / hard-rule validity
11. typography browser review


## 76. 30 Eylül 2026 — M33.4 second browser acceptance

Kullanıcı ikinci browser turunda:
- ilk proposal apply denemesinde timeout gördü
- sonraki apply başarı toast'ı verdi
- Geri Al çalıştı
- Yinele yine `Seçtiğiniz yer artık uygun değil` ile başarısız oldu
- büyütülen Öncelikler yazıları okunabilir bulundu

Önemli teşhis:
`Seçtiğiniz yer artık uygun değil` çevirisi eski M26.1 single-root redo
`target candidate no longer exists / target invalid` yoluna karşılık gelir.
M33.4.1 bundle-redo migration aktif olduğunda ordinary MOVE bundle bu eski
single-root candidate replay yoluna girmemelidir.

Bu nedenle remote DB'de
`20260930160000_management_m33_4_1_bundle_redo.sql`
uygulama durumu doğrulanmadan yeni redo algoritması eklenmeyecek.

Proposal apply ilk timeout da eski M26.8 remote fonksiyonunun halen aktif olmasıyla
uyumlu olabilir; M33.4.1 per-member exact candidate revalidation'ı kaldırır.

Ek UI fix:
```
a55b0023fc7f44bba3daadea7a648070321a02f9
fix: invalidate applied and stale solver proposals
```

Davranış:
- successful proposal apply sonrası confirmation kapanır
- applied proposal result temizlenir; aynı stale öneri tekrar uygulanamaz
- workspace snapshotHash/baselineHash değişirse mevcut proposal otomatik temizlenir
- eski proposal error state temizlenir

Sıradaki zorunlu teşhis:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npx supabase migration list | tail -25
npx supabase db push --dry-run
```

Beklenti:
- remote migration list içinde 20260930160000 görünmeli
- görünmüyorsa dry-run yalnız M33.4.1 migration göstermeli ve push edilmelidir

Migration aktif olduğu doğrulandıktan sonra proposal apply/undo/redo yeniden test edilir.


## 77. 30 Eylül 2026 — M33.4.2 timeout kök nedeni ve fast apply/redo

Üçüncü browser turunda Yinele artık eski "yer uygun değil" hatasına değil,
doğrudan statement timeout'a düştü.

Bu değişiklik M33.4.1 bundle-redo yolunun aktif olduğuna, fakat transaction'ın
candidate-domain refresh maliyeti nedeniyle halen ağır olduğuna işaret eder.

Kök mimari gözlem:
- M33 global solver candidate assessments'ı solver truth olarak kullanmaz.
- Interactive candidate rows current occupancy'ye göre görecelidir.
- Buna rağmen M33.4.1 apply/redo M15/M26 candidate refresh zincirini transaction
  içinde sürdürüyordu.
- 8 kart için per-member delta refresh + bundle refresh + propagation path
  statement timeout üretebiliyor.

M33.4.2 kararı:
- solver proposal apply ve MOVE bundle redo kritik transaction'ında
  occupancy-relative candidate-domain write yapılmaz
- placement stale guard korunur
- direct time/teacher/room/group overlap validation korunur
- history bundle atomic kalır
- candidate rows drag/assistant gibi interactive kullanımda zaten on-demand
  refresh edilir

Migration:
```
20260930164500_management_m33_4_2_fast_solver_apply_redo.sql
b7697ca0a18780ad17354563256cf12b8392d28a
perf: remove candidate refresh from solver apply and redo
```

Yeni RPC:
`management_apply_solver_proposal_bundle(jsonb,text)`

DB-side stale guard:
- exact M33 baseline hash formula
- revision lock
- expected baseline hash mismatch => reject

DB direct safety:
- day/period bounds
- lunch crossing
- external teacher/room/group conflict
- internal proposal teacher/room/group conflict
- locked/DRAFT/placed/one-revision guards

MOVE bundle REDO:
- all current placements must exactly match undone before-state
- newer manual decision invalidates branch as before
- replay direct atomic move roots
- ROOT_REDO audit links preserved
- no candidate-domain rebuild in redo transaction

Client commits:
```
aa964985e5074a397415e421c66bbddb98117a64
feat: call fast solver proposal apply RPC

bc92faf394b7789ad8082f7dd4e94153c4030aa7
perf: route solver proposals through fast apply
```

Candidate-domain consistency policy:
- proposal apply does not mutate interactive candidate rows
- beginDrag refreshes selected group before reading candidates
- placement assistant refreshes each analyzed group before candidate evaluation
- therefore stale interactive rows are not authoritative and are lazily refreshed

Acceptance pending:
1. git pull
2. npm test
3. npm run build
4. migration list
5. dry-run must show M33.4.2 (and M33.4.1 only if not yet remote)
6. db push
7. fresh proposal apply => no timeout
8. undo => one step
9. redo => no timeout
10. repeated undo/redo
11. Programı kontrol et hard rules


## 78. 30 Eylül 2026 — M33.4.3 Öncelikler UX kapanış paketi

Kullanıcı M33.4.2 sonrasında proposal apply / undo / redo akışının düzeldiğini doğruladı.

Kalan iki UX ihtiyacı:
1. Öncelikler sayfasında Program sekmesine dönmeden son program işlemini geri alabilmek.
2. `Bu tercihlerle seçenek oluştur` tıklandığında in-memory optimizer birkaç saniye
   sürdüğü için kullanıcıya işlemin devam ettiğini görünür biçimde göstermek.

### Öncelikler sayfası Geri Al

Commit:
```
54a3a9f25d87c4a2ff16ea219eabd1dfb5619c35
ux: add solver undo and visible optimization progress

64a3a45be8dfa99fae7942ff6f23ff3cf1220c92
feat: expose program undo on priorities page
```

`ManagementSolverWorkspacePanel` artık:
- `undoAvailable`
- `onUndo`
props alır.

Üst tercih ayarı kartında `↶ Geri Al` butonu yer alır.
Buton global management history'deki mevcut root/bundle undo sözleşmesini kullanır;
ayrı bir solver-history motoru yazılmaz.

Buton:
- undo yoksa disabled
- command busy ise disabled
- optimizer çalışırken disabled
- data refresh sürerken parent tarafından unavailable gönderilir

### Uzun optimizer işlemi için görünür feedback

Kök UX nedeni:
`runManagementObjectiveOptimization` browser main thread'de synchronous çalışır.
Önceden `setOptimizationBusy(true)` ile optimizer aynı event içinde hemen
başlatıldığı için React busy state'i ekrana boyayamadan thread bloklanabiliyordu.
Bu nedenle kullanıcı tıklamanın algılanmadığını düşünebiliyordu.

Yeni davranış:
- `runOptimization` async wrapper
- busy state set edilir
- iki `requestAnimationFrame` ile browser'a paint fırsatı verilir
- sonra existing in-memory optimizer çalıştırılır
- buton `Seçenek aranıyor…` olur
- görünür status kartı:
  `Program seçenekleri karşılaştırılıyor…`
  `Bu işlem birkaç saniye sürebilir. İşlem devam ediyor; tamamlandığında sonuç burada görünecek.`

Bu değişiklik optimizer algoritmasını veya DB davranışını değiştirmez.

Durum:
- source implementation complete
- Vercel / Codespaces / browser visual acceptance pending
- M33.4 UX acceptance sonrası CLOSED yapılabilir


## 79. 30 Eylül 2026 — Global history controls + UI consistency audit

Kullanıcı:
- Öncelikler'de Geri Al varsa Yinele de olmalı
- Kaynaklar ve gerekli diğer sekmelerde de history actions erişilebilir olmalı
- feature geliştikçe görsel bütünlüğün azaldığını gözlemledi

### History UX kararı

Undo/redo sekmeye özel değil, yönetim çalışma alanının global işlem geçmişidir.

Bu nedenle:
- Program toolbar içindeki yerel Geri Al/Yinele kaldırıldı
- Öncelikler içindeki yerel Geri Al kaldırıldı
- ortak `ManagementHistoryActions` bileşeni eklendi
- ana üst bar içine taşındı
- Program / Ders Planı / Kaynaklar / Öncelikler / Program Durumu boyunca aynı yerde görünür
- dar genişliklerde label gizlenip ikon moduna geçer
- gerçek command descriptor context'i tooltip/aria-label olarak korunur
- quick-tour `history-actions` target global bileşene taşındı

Commits:
```
9e9fa54e35635a35c75501ed4ef217803f274704
ui: add shared management history controls

f0d3aac5b520dc9a561fbd48a34c06b6dbabac5f
refactor: make history controls global across management tabs

c22d98042ed81d8435db7ff4e888e37a112396ac
refactor: remove duplicated solver history button

964fd6263a6d976cf34cbbae0cfd52aac4cc04de
fix: keep quick-tour target on global history controls
```

Not:
Current management command history placement/structure/solver program mutationsını kapsar.
Kaynak adı, kaynak durumu, kaynak profili gibi M18 resource mutations henüz bu history engine'e
ROOT_UNDO/ROOT_REDO olarak yazılmaz. Global history butonları Kaynaklar sekmesinde erişilebilir
olur ancak mevcut commandState'in temsil ettiği son undoable program işlemini yönetir.
Universal resource undo ayrı backend paketi gerektirir; UI'da yanlış şekilde "resource edit undo"
olarak varsayılmamalı.

### Görsel bütünlük audit

Kullanıcı gözlemi doğrulandı.

Current explicit typography counts:
- ManagementResources:
  - 8px: 6
  - 9px: 40
  - 10px: 41
  - 11px: 5
  - 12px: 2
- ManagementCoursePlan:
  - 8px: 12
  - 9px: 17
  - 10px: 30
  - 11px: 4
  - 12px: 1
- ManagementProgramStatus:
  - 9px: 5
  - 10px: 16
  - 11px: 3
- ManagementSolverWorkspacePanel:
  - 8px/9px/10px: 0
  - 11px: 42
  - 12px: 43

Sonuç:
Öncelikler readability turu sonrası 11–12px tabanına geçmişken eski Kaynaklar/Ders Planı
ekranları 8–10px legacy density taşımaya devam ediyor. Visual drift gerçek.

### Sıradaki önerilen UX paketi

Yeni feature eklemeden kısa bir `Management UI normalization` turu:

1. typography floor:
   - body/helper >= 11px
   - compact meta >= 10px
   - labels 10–11px
2. common history/header/action components
3. common section header hierarchy
4. primary / secondary / destructive button semantics
5. card radii/border/shadow token normalization
6. spacing rhythm:
   - 4 / 8 / 12 / 16 / 20 / 24
7. status badge semantics:
   - emerald success/active
   - amber warning/pending
   - rose destructive/error
   - slate neutral
8. avoid redesign; preserve accepted page information architecture

Goal:
görsel yeniden tasarım değil, existing screens'i aynı product family'ye döndürmek.


## 80. 30 Eylül 2026 — Management UI normalization

Kullanıcı tüm ana sekmelerin ekran görüntülerini paylaştı:
- Program
- Ders Planı
- Kaynaklar
- Öncelikler
- Program Durumu

Gözlem:
Program deliberately dense workbench olarak tutarlı; ancak eski geliştirme paketlerinden kalan
Kaynaklar / Ders Planı / Program Durumu typography ve card-density dili Öncelikler'den belirgin
biçimde farklılaşmıştı.

History controls daha önce global top bar'a taşındığı için tüm sekmeler aynı işlem geçmişi
kontrollerini artık aynı konumda kullanıyor.

### Typography / width normalization

Commits:
```
310145deb1c067bcae8904b2bf28d2b44b7cfc74
ui: normalize resources typography and content width

1612a533db553f2a7c46392f4b4d090a8947ee46
ui: normalize course plan typography

aa8db2608af4b74ab828f1a0396546b9f4a3e8a5
ui: normalize publication comparison typography

b5bf4a928abb3315717ecf21965b3a66904f1334
ui: normalize publication gate typography

f15fee41d61fad2a1b3f32a90c1cfad6545b9521
ui: simplify and normalize program status
```

Results:
- legacy 8px / 9px text eliminated from normalized content screens
- body/helper/meta floor moved to readable 10–11px+ range
- Kaynaklar content width -> 1220px
- Ders Planı already 1220px
- Program Durumu content width -> 1220px
- Program Durumu zero-count "0 başlık" badges hidden
- Program Durumu three explanatory side cards consolidated into one structured information card
- accepted information architecture preserved
- Program timetable full-width density intentionally preserved
- Solver keeps wider 1460px shell because saved-settings sidebar is persistent

All five implementation commits Vercel PASS.

### Visual system contract

```
8799ac2224a95eaf5971db4f1f7f5b4a80733ca7
docs: define management UI normalization rules
```

New:
`docs/MANAGEMENT_UI_SYSTEM.md`

Rules frozen:
- page families / density modes
- typography floor
- surface/radius/border/shadow language
- spacing rhythm
- action hierarchy
- global history placement
- semantic status colors
- user-facing Turkish
- progress feedback
- deliberate Program/Solver exceptions

Goal:
future features must fit this system rather than introducing another local UI dialect.


## 81. 30 Eylül 2026 — UI normalization visual acceptance

Kullanıcı normalization sonrası tüm ana sekmelerin yeni ekran görüntülerini paylaştı.

Visual acceptance:
- Program: intentional full-width dense workbench; no regression observed
- Ders Planı: normalized typography and width visually coherent
- Kaynaklar: typography/readability improved, no clipping observed
- Öncelikler: accepted layout preserved
- Program Durumu: wider 1220px content, larger type and consolidated help card visibly improved
- global Geri Al/Yinele placement consistent across tabs

Remaining visual defect found:
Program Durumu empty blocker/warning sections still rendered `0 başlık` badges.
Previous intended patch did not match the post-normalization class string.

Fix:
```
2b7a2a7b2f11da1c6a29f27bc00c470e8d6b0f76
ui: hide zero issue badges on program status
```

Optional future refinement:
publication comparison currently shows 8 rows + "+ N ders daha" and makes Program Durumu long.
Could later switch to 5–6 default rows with explicit expand/collapse, but this is not a blocker.


## 82. 30 Eylül 2026 — M33.4 + UI normalization final acceptance

Kullanıcı Codespaces üzerinde final doğrulama yaptı:

```
Test Files  16 passed (16)
Tests       81 passed (81)
```

Production build:
- Next.js 16.3.4
- TypeScript PASS
- PWA compile PASS
- static pages PASS
- /yonetim dynamic route build PASS

Browser acceptance daha önce:
- program seçeneği oluşturma PASS
- explicit apply confirmation PASS
- fast atomic proposal apply PASS
- Geri Al PASS
- Yinele PASS
- tekrar undo/redo PASS
- timeout regression M33.4.2 ile kapandı
- stale proposal invalidation PASS
- global history controls tüm ana sekmelerde görünür
- Öncelikler progress feedback kullanıcıya işlem sürdüğünü gösteriyor
- management UI normalization visual review PASS

Final small UI fix:
```
2b7a2a7b2f11da1c6a29f27bc00c470e8d6b0f76
ui: hide zero issue badges on program status
```

### Paket durumu

**M33.4 CLOSED / PASS**

**Management UI normalization CLOSED / PASS**

### Korunan ürün kuralları

- Program full-width yoğun workbench kalır.
- Ders Planı / Kaynaklar / Program Durumu 1220px içerik ailesini kullanır.
- Öncelikler sidebar nedeniyle daha geniş shell kullanabilir.
- Geri Al / Yinele global management history kontrolüdür.
- Yeni 8–9px body/meta typography eklenmez.
- Uzun süren işlem görünür progress feedback vermelidir.
- UI contract: `docs/MANAGEMENT_UI_SYSTEM.md`.

### Bilinen sınır

Kaynaklar ekranındaki teacher/room profile-name-status gibi resource mutations mevcut
management command history engine'e ROOT_UNDO/ROOT_REDO olarak yazılmıyor.
Global Geri Al/Yinele Kaynaklar sekmesinde görünse de yalnız mevcut undoable management
history item'ını yönetir.

Bu davranış şu aşamada açıkça kayıtlı bir ürün/altyapı sınırıdır; universal resource undo
istenirse ayrı backend history paketi açılmalıdır.


## 83. 1 Ekim 2026 — M39.1 hard teacher availability + Partisyon branding — CLOSED / PASS

Branch:
`feat/management-m39-teacher-planning-inputs`

Implementation checkpoint before this journal commit:
`8ac11517018e1047c50bef46fe558903c91198a9`

### M39.1 architecture

Goal:
- add explicit term-scoped teacher hard unavailability
- preserve current placements when availability changes
- block new candidate/placement/solver choices that use unavailable teacher slots
- keep M39.0 min/target/max load inputs as planning/audit data only

New table:
`management_teacher_unavailable_periods`

Scope:
- key: `(requirement_set_id, teacher_id, day_of_week, period)`
- weekdays 1..5
- periods 1..12
- hard availability is term/requirement-set scoped, not a permanent teacher attribute

Hard rule enforcement layers:
1. persisted candidate domain:
   - `TEACHER_UNAVAILABLE`
   - candidate becomes INVALID
2. manual placement/resource preview:
   - `TEACHER_UNAVAILABLE` block reason
3. placement write guard:
   - new teacher/day/start tuple is rejected if it overlaps an unavailable period
   - unchanged existing conflicting placement may still be edited for unrelated metadata
4. solver snapshot / in-memory solver:
   - `teacherUnavailablePeriods`
   - hard rule `TEACHER_HARD_UNAVAILABLE`
   - baseline audit reports unavailable baseline placements

Important product rule:
- saving hard availability does NOT auto-move existing placements
- existing overlaps are reported for explicit human/solver repair
- publication is unchanged

### M39.1 migrations

Applied:
- `20261001143000_management_m39_1_teacher_hard_availability.sql`
- `20261001185000_management_m39_1_1_candidate_summary_ownership.sql`
- `20261001190000_management_m39_1_2_fast_availability_refresh.sql`

M39.1.1 root cause:
- M39.1 availability AFTER-statement trigger used `INSERT ... ON CONFLICT` for
  `schedule_card_domain_summaries`
- this violated the existing M32.5.1 ownership rule:
  candidate-domain builders own summary creation; policy triggers may only update existing summaries
- during candidate rebuild the M39 trigger created the summary too early
- builder final INSERT then failed:
  `duplicate key value violates unique constraint "schedule_card_domain_summaries_pkey"`

M39.1.1 fix:
- availability summary trigger now UPDATEs only existing summary rows
- missing summary creation remains exclusively builder-owned

M39.1.2 root cause:
- availability save reclassified every candidate row for the selected teacher
- this invoked M32.5 same-requirement fan-out
- normal UI save hit statement timeout

M39.1.2 fix:
- targeted refresh only touches:
  - rows currently overlapping the new unavailable slots
  - rows already carrying `TEACHER_UNAVAILABLE` so removals can be repaired
- the availability RPC suppresses only the M32.5 AFTER-statement same-requirement fan-out
  for this targeted refresh
- M39.1 + M22 BEFORE-row semantics remain active
- M39.1.1 summary UPDATE remains active
- ordinary candidate writes retain normal M32.5 behavior

### Solver regression fix

Initial M39.1 test exposed a real solver hole:
- raw candidate generation filtered unavailable slots
- baseline audit detected unavailable baseline placements
- but `tryBaseline()` called `canAssign()` and could still accept an unavailable baseline

Fix:
- hard availability check moved into `canAssign()`
- baseline, search and future assignment paths share the same last-line hard gate

Regression:
- `treats teacher hard unavailability as a structural solver constraint`

Final automated gate:
```
Test Files  21 passed (21)
Tests       110 passed (110)
```

Production build:
- Next.js 16.3.4 PASS
- TypeScript PASS
- PWA compile PASS
- static generation PASS
- `/yonetim` route build PASS

### Live DB / browser acceptance

Remote migration parity confirmed through:
- `20261001143000`
- `20261001185000`
- `20261001190000`

Resources → Teachers live acceptance:
- teacher planning modal saves unavailable periods successfully
- observed live example: `3 saat uygun değil`
- existing overlap audit visible: `1 mevcut blok çakışıyor`
- existing program was not auto-moved
- duplicate-key regression closed
- statement-timeout regression closed

Hard-block smoke:
- Program → teacher change preview attempted to select the unavailable teacher
- preview blocked the operation
- user-facing reason:
  `Öğretmen bu ders saatinde uygun değil.`
- no write was applied

**M39.1 CLOSED / PASS**

### Teacher planning UI polish

Resources → Teachers was polished without changing accepted information architecture:
- `Mevcut gerçek yük` → `Mevcut ders yükü`
- `Hard uygunluk` → `Uygunluk kısıtları`
- `Minimum / Maksimum` → `En az / En fazla`
- technical user-facing terms such as hard constraint / solver / baseline audit / optimizer
  were removed from the planning modal
- planning modal now separates:
  - `Yük hedefi`
  - `Uygunluk`
- unavailable-period matrix is Monday–Friday × 12 periods
- UI explicitly states that existing program is not automatically changed
- table shows configured availability count and existing overlap count
- actions remain compact: Program / Planlama / Diğer…

### Partisyon product branding

Official MSGSÜ logo kit is now the source for the owl asset:
- `public/brand/msgsu-owl.svg`
- official kit blue: `#06038d`
- temporary hand/PDF-derived owl asset removed

Header lockup:
- official MSGSÜ owl
- vertical separator
- `MSGSÜ İDK`
- Partisyon wordmark as `P mark + artisyon`

Accepted visual rules:
- P mark and `artisyon` form one wordmark
- no overlap / blob effect
- P is optically aligned to the word baseline
- menu active indicator sits close to its label rather than at the bottom of the taller branded header
- audience filter icons `📚 / 🩰 / 🎶` enlarged while keeping filter capsule height stable

Branding is UI-only; no DB semantics changed.

### Continuation

Next roadmap step:
- M40 teacher load readiness/health + objective metric integration
- do not enable load-balancing scoring until explicit readiness is defined
- preserve M33 immutable snapshot + in-memory/no-trial-write solver architecture
- preserve M39.1 hard availability as a non-negotiable structural constraint

Working method remains:
- assistant patches/commits through GitHub
- user only pulls, runs tests/build/migration gates and performs browser/runtime validation
- never ask user to hand-edit patches
- DB changes: migration list → dry-run → exact pending migration only → real push → live smoke


## 84. 1 Ekim 2026 — M40 teacher load readiness/objective — IMPLEMENTATION READY / VALIDATION PENDING

Branch:
`feat/management-m39-teacher-planning-inputs`

Implementation checkpoint before this diary commit:
`6c0899981dd92e00fa7da312576df073c0f9f13f`

### Product semantics frozen

M40 does not invent load defaults.

A teacher is load-relevant only when the teacher is ACTIVE and either:
- belongs to the teacher pool of an ACTIVE requirement in the requirement set, or
- is currently used by an ACTIVE placed card in the selected DRAFT.

Readiness:
- every relevant teacher must have an explicit `target_load`
- `minimum_load` and `maximum_load` remain optional
- no relevant teachers => load-balance readiness is false
- unused/inactive teacher records do not block readiness

Load values remain weekly timetable periods.

Hard/soft boundary:
- M39.1 hard availability remains structural
- M40 load targets are NEVER hard placement constraints
- min/max are soft planning bands
- the optimizer may violate a min/max band when other weighted objectives justify it

### M40 objective metric

Teacher load score is explainable:

```
target deviation =
  Σ abs(proposed teacher load - explicit target load)

range violation =
  Σ below-minimum periods + above-maximum periods

teacherLoadBalance raw metric =
  target deviation + range violation
```

The existing weighted objective normalization remains:
- raw metric / card count
- multiplied by preference weight
- lower total score is better
- weight 0 disables the objective

Engine result version:
`M40-v1`

### New migration

`20261001200000_management_m40_teacher_load_readiness_objective.sql`

It adds/redefines:
- `management_teacher_load_health(requirement_set_id, revision_id)`
- contextual teacher-load readiness
- generic objective validator now recognizes `teacherLoadBalance` as implemented
- `subjectTimePreference` remains unsupported
- ACTIVE profile with positive load-balance weight is rejected when target readiness is incomplete
- teacher resource load audit gains per-teacher health fields
- load-target save now reports `solverBehaviorChanged=true`
- current M39.1 snapshot is wrapped as M40:
  - `teacherLoadTargets`
  - `teacherLoadReadiness`
  - baseline target-deviation/range-violation metrics
  - contextual objective catalog support
  - `snapshotVersion = M40-v1`
  - snapshot hash recomputed
- existing dynamic snapshot capture remains compatible

No published schedule mutation is introduced.

### In-memory optimizer integration

`lib/managementSolverPrototype.ts`:
- context carries explicit teacher load targets
- metric vector adds:
  - `teacherLoadTargetDeviationPeriods`
  - `teacherLoadRangeViolationPeriods`
- weighted score adds `teacherLoadBalance`
- single-objective seed search includes teacher load balance
- tie-break includes load metrics
- positive objective support count includes teacher load balance
- load objective returns `TEACHER_LOAD_INPUT_NOT_READY` when readiness is false
- proposal generation remains in-memory / no trial writes
- hard feasibility still runs for every accepted move

### UI integration

Resources → Teachers:
- summary shows `ready/relevant` target coverage
- relevant teacher with no target: `Yük dengesi için hedef gerekli`
- ready teacher shows target deviation
- min/max range violation is shown explicitly
- planning modal explains:
  - target is used by load-balance preference
  - min/max are soft bands
  - every relevant teacher needs target before load-balance can be used
  - these values are not hard placement rules

Öncelikler:
- new preference: `Öğretmen yüklerini hedeflere yaklaştır`
- shows current target deviation / range violation
- when readiness is incomplete, positive levels are disabled
- an already-saved positive value can still be turned OFF
- ACTIVE save and option generation are gated by readiness
- result comparison adds load target deviation + band-out metric
- future footer now only lists subject day/time preferences

### Regression coverage added

Expected suite after this package:
- 21 test files
- 112 tests

New tests:
1. load optimization is BLOCKED when relevant teacher targets are incomplete
2. with complete targets, load-only weighting moves a card from overloaded teacher to underloaded teacher and reduces both target deviation and range violation to zero

### Validation still required

Do NOT call M40 CLOSED/PASS yet.

Required Codespaces gate:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
git rev-parse HEAD
npm test
npm run build
npx supabase migration list | tail -25
npx supabase db push --dry-run
```

Dry-run must show ONLY:
`20261001200000_management_m40_teacher_load_readiness_objective.sql`

Only after code/build/dry-run PASS:
- real DB push
- migration parity check
- Resources load-readiness browser smoke
- Öncelikler load objective readiness/metric smoke
- verify proposal remains explicit/read-only until user confirms apply
- then update this diary to M40 CLOSED/PASS


### M40 validation note — first code gate

First Codespaces gate at `b6009c56337736674715671684da9b319fc478ab`:
- Vitest PASS: 21/21 files, 112/112 tests
- production compile reached TypeScript
- build failed only because `lib/managementSolverProposal.test.ts` still used the pre-M40 `ManagementOptimizationResult` fixture shape:
  - `engineVersion: M33.3-v0`
  - missing load metric fields
  - missing `teacherLoadBalance` score component
- DB dry-run was correctly not reached/pushed

Fix:
- proposal fixture aligned to `M40-v1`
- zero-valued teacher load target/range metrics added to baseline/proposed/delta fixture
- zero-weight `teacherLoadBalance` score component added to baseline/proposed fixture
- proposal contract note aligned to M40

M40 remains **VALIDATION PENDING** until test/build rerun and migration dry-run PASS.


## 85. 1 Ekim 2026 — M40.1 approved teacher-load defaults — IMPLEMENTATION READY / VALIDATION PENDING

User explicitly approved institutional starting defaults:

```
En az = 1
Hedef = 10
En fazla = 20
```

This supersedes M40's earlier "no hidden defaults" assumption. The values are now explicit product policy, not inferred solver behavior.

Rules:
- defaults apply only to relevant ACTIVE teachers with no planning-input row
- existing custom values are never overwritten
- existing partial/custom planning rows remain authoritative
- defaults remain soft planning inputs, not hard placement constraints
- clearing an individual teacher's values remains possible and can make readiness incomplete again

Frontend:
- `MANAGEMENT_TEACHER_LOAD_DEFAULTS = 1 / 10 / 20`
- opening a relevant but unconfigured teacher planning form pre-fills 1 / 10 / 20
- explanatory copy states the starting defaults
- regression test locks the approved constants

Migration:
`20261001213000_management_m40_1_teacher_load_defaults.sql`

Backfill scope:
- requirement sets with a DRAFT revision
- ACTIVE requirements / ACTIVE teachers
- teachers in active requirement pools OR used by active DRAFT placements
- INSERT only when no `management_teacher_planning_inputs` row exists
- `ON CONFLICT DO NOTHING`
- no UPDATE path, therefore existing 3/10/20 or any other custom values are preserved

Expected effect on current browser acceptance:
- current screen reports 51 relevant teachers missing target load
- those currently unconfigured relevant teachers should receive 1 / 10 / 20 after migration
- readiness should then reach full coverage unless a pre-existing partial planning row exists

Expected test gate after M40.1:
- 21 test files
- 113 tests
- production build PASS

M40.1 remains **VALIDATION PENDING** until code gate + dry-run + DB push + browser readiness smoke pass.


## 86. 3 Ekim 2026 — management workspace load isolation

Browser symptom:
- red banner: `Load failed`
- Program board showed 0 placed / 0 pool / 0 operations
- whole management workspace became empty

Root architectural issue:
- page startup used one `Promise.all(...)` for seven independent reads:
  overview, board, course plan, resources, solver workspace, publication preview,
  publication gate
- one network/RPC failure rejected the whole batch
- successful board data was discarded together with the failed secondary module
- Safari may surface a fetch/network failure as the raw message `Load failed`

Fix:
- startup now uses `Promise.allSettled(...)`
- each data source is applied independently
- failed modules are explicitly nulled to avoid stale misleading data
- Program board remains usable when a secondary module fails
- if the Program/board fetch itself fails, board is cleared for safety
- command-state fetch is separately isolated
- error banner identifies failed subsystem(s):
  Genel özet / Program / Ders Planı / Kaynaklar / Öncelikler /
  Yayın önizleme / Yayın güvenliği / Geri Al-Yinele
- raw Safari `Load failed` is translated to
  `ağ veya sunucu bağlantısı kurulamadı`

No DB migration is associated with this UI resilience fix.

Implementation checkpoint:
`89c93c0b96b4deb221a87db5cf497dcfe0bebb98`

Validation pending:
- npm test
- npm run build
- browser reload
- verify exact failing subsystem if any


## 87. 3 Ekim 2026 — bounded management startup fan-out

Observed after load-isolation diagnostics:
- failed subsystems:
  - Genel özet
  - Program
  - Ders Planı
  - Kaynaklar
  - Yayın önizleme
- each failed with browser-level `Load failed`
- lighter solver/publication-gate paths were not in the failure list

Interpretation:
- not a single table/RPC/schema failure
- management startup was still launching all major modules at once
- several modules internally issue large `Promise.all` REST batches
- combined startup could create dozens of simultaneous requests
- Safari/WebKit may surface connection saturation/transient fetch abort as
  `Load failed`

Fix:
- Program board loads first and alone
- then only the lighter reads run together:
  - Genel özet
  - Öncelikler
  - Yayın güvenliği
- heavy fan-out modules run sequentially:
  - Ders Planı
  - Kaynaklar
  - Yayın önizleme
- Geri Al/Yinele loads last
- transient browser/network fetch failures get exactly one retry after 300 ms
- only browser-network style failures are retried; HTTP/DB/application errors
  remain immediate and visible
- subsystem isolation from M40 diagnostic remains in place

Implementation checkpoint:
`f5e95125aabe5f2b809c227f8f821432f2ddbdb1`

No DB migration.


## 88. 3 Ekim 2026 — emergency rollback to M39.1 stable

User requested full rollback after Program/drag-drop regressions.

Last fully accepted application checkpoint:
`980b8487992c7a0ea1021143384eeb7e1b25a806`

Evidence at that checkpoint:
- M39.1 CLOSED/PASS
- 21/21 test files
- 110/110 tests
- production build PASS
- hard availability save PASS
- existing-overlap audit PASS
- manual unavailable-teacher hard block PASS
- Program drag/drop and history had been working in the accepted management baseline

Rollback implementation:
- commit `b2670ace1705795e2c99f0a14e0a9e679cc64435`
- application source files modified during M40+ were restored exactly from the
  M39.1 stable tree
- post-rollback compare against `980b848...` shows no application source
  differences; only docs and migration-history files differ

Applied DB history cannot be deleted:
- `20261001200000_management_m40_teacher_load_readiness_objective.sql`
- `20261001213000_management_m40_1_teacher_load_defaults.sql`

Rollback migration prepared:
- `20261003150000_management_rollback_m40_to_m39_1.sql`
- commit `5b3ab1d0b5665dd390164027b8e4eb0aaa8dd817`

It restores:
- M33 objective validator/profile behavior
- M39.1 teacher planning audit
- M39.0 load-target write semantics (`solverBehaviorChanged=false`)
- exact M39.1 solver snapshot wrapper by removing the M40 wrapper and renaming
  the preserved `management_preview_solver_snapshot_m40_base` back
- drops the now-unused M40-only `management_teacher_load_health` helper

Data preservation:
- M40.1-inserted 1/10/20 planning rows are NOT deleted during emergency rollback
- deleting them cannot be safely distinguished from later user edits
- under restored M39.1 semantics those rows are planning-only and do not affect
  candidate/placement/solver behavior

Do not resume M40 work until the restored baseline passes:
1. test
2. build
3. rollback migration dry-run/push
4. Program load
5. drag/drop
6. undo
7. redo

No other feature work before these pass.


## 89. 3 Ekim 2026 — Program interaction recovery — PASS

Browser validation after rollback + targeted network/read fixes:

PASS:
- Program board loads in Firefox
- drag card to another valid slot works
- remove to pool works
- Undo works
- Redo works

Important diagnosis:
- Safari remains affected by browser-level Supabase fetch failures
  (`Load failed`), while Firefox can operate the app
- Firefox also exposed intermittent Supabase/Cloudflare `522` responses
- apparent CORS messages after 522 are secondary because the 522 error
  response does not include the expected CORS header
- do not change CORS policy based on these 522-derived console messages

Targeted resilience added without retrying writes:
- active drag IDs use a synchronous ref to prevent stale second-drag IDs
- ambiguous remove results are reconciled read-only against `placements`
- transient drag candidate reads retry once
- transient command-history GET retries once
- MOVE / PLACE / REMOVE writes are never blindly retried

Accepted implementation checkpoint:
`290debd16199b141d73ac811f5bfea0286025194`

Core Program interaction status:
**PASS**

Still open and separate:
- Yerleştirme Asistanı:
  `management_preview_candidate_forward_impacts` returns HTTP 500 in at
  least one live scenario
- investigate this independently; do not destabilize Program drag/remove/history


## 90. 3 Ekim 2026 — Management Workspace v1 — local editing foundation + UI checkpoint 1 PASS

Branch:
`feat/management-workspace-v1`

Architecture goal confirmed by user:

```text
DB Snapshot
  ↓
Local Working Copy / Matrix
  ↓
Local trial edits + validation + undo/redo
  ↓
Atomic final commit to DB
```

The purpose is to stop the previous pattern where every drag/remove/resource trial
read or wrote Supabase. The accepted direction is snapshot once, edit locally, then
commit once with stale-baseline protection.

### Baseline before workspace work

- rollback to M39.1 behavior applied and migration parity confirmed through
  `20261003150000_management_rollback_m40_to_m39_1.sql`
- pre-workspace code gate: 21/21 test files, 110/110 tests, production build PASS
- M33 snapshot was selected as the authoritative structural input instead of creating
  a parallel snapshot source

### Phase 1 — immutable Workspace Snapshot — PASS

Files:
- `lib/managementWorkspace.ts`
- `tests/managementWorkspace.test.ts`

Main properties:
- immutable/deep-frozen app snapshot
- revision / requirement-set / version / snapshotHash / baselineHash identity
- requirements, cards, groups, relations, teacher/room pools, resources,
  hard availability, baseline placements and metrics
- source validation and referential-integrity checks
- candidate domain intentionally excluded because it is occupancy-relative

Checkpoint result:
- 22/22 test files
- 114/114 tests
- build PASS

### Phase 2A — local Working Copy + Diff — PASS

Files:
- `lib/managementWorkspaceWorkingCopy.ts`
- `tests/managementWorkspaceWorkingCopy.test.ts`

Behavior:
- snapshot remains immutable
- every card gets a mutable local placement state
- local SET / REMOVE operations do not touch baseline
- deterministic dirty-card diff against snapshot baseline
- stale/different snapshot identity is rejected

Checkpoint result:
- 23/23 test files
- 119/119 tests
- build PASS

### Phase 2B — local operation history / Undo / Redo — PASS

Files:
- `lib/managementWorkspaceHistory.ts`
- `tests/managementWorkspaceHistory.test.ts`

Behavior:
- local operation sequence numbers
- undo stack / redo stack
- Undo Undo Redo Redo semantics
- new edit after undo drops redo branch
- full placement state restored on undo
- no DB history required

Checkpoint result:
- 24/24 test files
- 124/124 tests
- build PASS

### Local hard-rule validator — PASS

Files:
- `lib/managementWorkspaceValidation.ts`
- `tests/managementWorkspaceValidation.test.ts`

Covered rules:
- day/time bounds
- lunch-boundary crossing
- locked-card pin
- required/inactive/ineligible teacher
- hard teacher unavailability
- required/inactive/ineligible/capability-mismatched room
- teacher / canonical-room / participant-group conflict
- required teacher continuity
- max blocks/day
- max consecutive periods
- min distinct days

Validation modes were separated:
- `EDIT`: temporary incomplete draft states may exist during editing
- `COMMIT`: final hard requirements must hold

Existing baseline violations do not block unrelated edits; only newly introduced
hard violations reject a local command.

Checkpoint result:
- 25/25 test files, then 26/26 after command-mode refinements
- 131/131, then 137/137 tests
- build PASS

### Local validated command executor — PASS

Files:
- `lib/managementWorkspaceCommands.ts`
- `tests/managementWorkspaceCommands.test.ts`

Flow:

```text
command
  ↓
trial copy
  ↓
EDIT validation
  ↓
invalid → no mutation
valid   → apply to working copy + local history
```

Also added atomic local command batches for future grouped operations.

### Board projection adapter — PASS

Files:
- `lib/managementWorkspaceBoardAdapter.ts`
- `tests/managementWorkspaceBoardAdapter.test.ts`

The server-fetched board remains the baseline. Local placement state is projected
onto a derived board for display. This lets the UI show a local remove/move without
mutating or refetching the server board.

Checkpoint before UI integration:
- 27/27 test files
- 141/141 tests
- build PASS

### First Program UI integration — PASS

Implementation checkpoint:
`3c6a2329818b82bdda6a539f239ebd202b3ff07e`

Integrated behavior:
- single-card `Kaldır / Havuza kaldır` now executes locally
- no Supabase write for that local remove
- board immediately projects the card into the pool
- local Undo restores the card immediately
- local Redo removes it again immediately
- dirty badge: `Yerel değişiklik · kaydedilmedi`
- refresh and logout are blocked while local dirty changes exist, preventing loss
- legacy write surfaces are locked while a local workspace session is active to
  prevent mixing local state with old DB-write state
- server board remains baseline and can be restored cleanly

Browser acceptance performed by user:
1. remove cards to pool → worked immediately
2. Undo quickly restored them to their old positions → worked
3. local remove/undo behavior felt fast and successful
4. page reload transiently hit known Supabase/Cloudflare 522/CORS-looking noise,
   but a reload recovered; this is not treated as a workspace failure
5. dragging/moving a card still used the legacy DB path and therefore remained slow

User verdict:
**successful**

### Current architectural boundary

LOCAL now:
- single-card REMOVE
- Undo/Redo for local workspace history
- board projection

LEGACY DB-backed still:
- MOVE / drag-drop
- PLACE
- grouped remove semantics
- resource edits
- assistant apply
- final persistence

Do not mix both write engines during a dirty local session.

### Next implementation target

**MOVE → local workspace**

Acceptance target:
- drag card to another valid slot
- no placement write/RPC during drag/drop
- local validator decides acceptance
- board moves immediately via projection
- Undo / Redo are local and instant
- DB remains unchanged until future explicit Save/Commit

After single-card MOVE passes browser acceptance, add grouped/batch history transaction
semantics so one visual grouped move/remove is one Undo step.


### Workspace UI checkpoint 2 — single-card MOVE browser PASS

Implementation checkpoint:
`f401b1ee12c54e41f504c717aa293490d5bd274a`

Changes:
- single-card drag/drop MOVE uses local `SET_PLACEMENT`
- no placement write RPC on drop
- local validator is authoritative at apply time
- board projection updates the visible slot immediately
- local Undo/Redo moves the card back/forward immediately
- single-card drag skips `management_refresh_card_group_candidates`; persisted candidate detail is read and final safety is local validation

User browser acceptance:
- card move became noticeably faster
- Undo works
- Redo works
- behavior accepted

Still open:
- grouped/visual-combined card MOVE and REMOVE are not yet one local transaction
- drag still performs candidate-detail reads, so it is not yet zero-network at drag start
- final atomic DB Save/Commit RPC is not yet implemented


### Workspace UI checkpoint 3 — grouped local editing browser PASS

Browser acceptance after grouped batch integration and inspector resolver fix:
- grouped/visual-combined card MOVE works locally
- grouped REMOVE works locally
- one Undo restores the whole grouped user action
- one Redo reapplies the whole grouped user action
- sibling cards are treated as coordinated and do not create false teacher/room/group conflicts against each other
- inspector "Taşı" no longer requires every sibling to have exactly one raw candidate
- primary card uses the user's explicit resource choice
- sibling cards preserve current teacher+room when valid, then current teacher, then current room, and only auto-resolve when a unique option remains
- ambiguous sibling resource choice is still not guessed arbitrarily
- dirty badge remains visible and refresh is correctly blocked while unsaved local state exists

Accepted browser evidence:
- user confirmed the issue is fixed: `ok. düzeldi.`
- screenshot showed local dirty state and successful moved timetable card

Current local Program coverage:
- single-card REMOVE: local
- single-card MOVE/PLACE: local
- grouped MOVE: local batch
- grouped REMOVE: local batch
- Undo/Redo: local, grouped batch = one user step
- board projection: local

Next architectural milestone:
**Atomic Save / Commit**
- compute deterministic diff from immutable snapshot
- reject stale revision/version/snapshotHash/baselineHash
- server revalidates hard constraints
- apply all placement changes in one DB transaction
- rollback everything on any error
- refresh snapshot only after successful commit


## 91. 4 Ekim 2026 — Live student baseline reset + DRAFT v3

Reason:
- browser acceptance and workspace development produced many deliberate test moves
- management DRAFT v2 had drifted far from the student-facing live schedule
- user requested a clean reset to the current live student program without
  weakening future placement validation

Authoritative source:
- public `schedule_sessions` / `session_groups`
- M25 clean-bootstrap source evidence
- M25 runtime adjustments
- public baseline hashes were verified unchanged from M25:
  - sessions hash: `a0bb49d37440119271457d0f678456d4`
  - groups hash: `e9ff78dfe6bc55cc98c5aa589a80142e`
- public baseline health: PASS
- public projection remained untouched: 517 sessions / 609 session-group rows

Reset migration applied directly to Supabase:
`20261004170240_management_reset_draft_to_live_baseline`

Result:
- old DRAFT v2:
  `02a42aa9-b6e1-47e2-8e4d-188d5dcfd0b5`
  - ARCHIVED
  - 300 cards
  - 300 placements
  - 552 move transactions retained for audit/history
- new clean DRAFT v3:
  `16d8cb8e-1ea2-4af2-899c-a9df052bde8c`
  - 299 cards
  - 299 placements
  - 0 move transactions
  - base revision = archived v2
  - source = EFFECTIVE_STUDENT_SCHEDULE
- one test-era extra card was intentionally discarded:
  - 10A MUSIC / Müzik Teorisi
- reset is audited in `management_live_baseline_reset_runs`

Important interpretation discovered after reset:
- the 6A/7A K. Bale + Point pattern that looked asymmetric in the Program UI is
  present in the authoritative live student baseline
- example Friday:
  - Parallel group 1: K. Bale period 4, Point period 5
  - Parallel group 2: K. Bale periods 4-5
- therefore "equal block lengths for both parallel groups" is NOT a valid hard
  rule and must not be introduced

### Parallel-bundle safety rule — implementation pending gate

New local validator rule:
`PARALLEL_BUNDLE_BROKEN`

Purpose:
- infer linked parallel lesson bundles from the immutable baseline
- normalize Turkish/English Parallel/Paralel group-family labels
- build connected baseline components from overlapping/adjacent cards
- preserve each component's relative day/start geometry
- allow a whole bundle to translate to another day/time when relative offsets
  stay unchanged
- reject moving/removing only one member in a way that breaks the live-baseline
  geometry

Implementation:
- `lib/managementWorkspaceValidation.ts`
- commit `eb4173ee22b71693060bb7f419843e83d7cdfb7d`

Tests:
- reject moving only Point away from its linked K. Bale bundle
- allow translating the complete K. Bale/Point bundle while preserving offsets
- commit `5d77a747a3bcef6699e9c42168ed13d624a83a8f`

Required next gate:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
npx supabase migration list | tail -10
```

Expected DB state:
- migration `20261004170240_management_reset_draft_to_live_baseline` present remotely
- new active DRAFT is v3 / `16d8cb8e-1ea2-4af2-899c-a9df052bde8c`

After gate PASS:
- browser reload must pick up DRAFT v3
- confirm Program visually matches live student schedule
- test that a linked parallel bundle cannot be broken by a single-card move
- test that a coordinated whole-bundle move remains allowed


### 4 Oct continuation — reset parity + UI reason translation

Repository parity:
- local migration file added for remote version
  `20261004170240_management_reset_draft_to_live_baseline.sql`
- this file records the already executed live operational reset and reproduces
  its persistent audit-table/RLS schema idempotently
- it intentionally does NOT replay the destructive data reset on another DB;
  the original live reset was pinned to the exact live DRAFT/hash state
- repo commit: `082870791f6de4645809d4ed8ffa4f563c317f4a`
- remote migration history currently ends with:
  - 20261003150000 rollback M40 -> M39.1
  - 20261003202000 workspace atomic commit
  - 20261004170240 live-baseline reset
- active DB state rechecked:
  - DRAFT v3 `16d8cb8e-1ea2-4af2-899c-a9df052bde8c`
  - 299 cards
  - 299 placements
  - 0 move transactions

Parallel-bundle blocker is now translated consistently in the UI:
- Program command notice:
  `Bağlı paralel ders paketi birlikte taşınmalı`
- candidate reason:
  `Bağlı paralel dersler birlikte taşınmalı`
- board drop marker:
  `Paralel paket`

UI commits:
- `6a84b8026dbba37c544ad88cf7c3cb14d5817a3c`
- `b3ceed62e40c9f8786c86a8f6e579b0ea4dd43f8`
- `0a34f661d2baaaaefdf33337ee7bcb662fffa4e9`

Safety status:
- a move that would break a baseline-linked parallel bundle should now be
  marked unsuitable before drop by the same local preview validator used at
  apply time
- this specifically prevents the previous UX mismatch where a target appeared
  green/valid but was rejected only after dropping
- full offset-preserving drag of a compound K. Bale/Point geometry is not yet
  implemented; until it is, an individual move that would break that geometry
  is intentionally blocked rather than guessed
