# MSGSÜ Ders Programı — Devam Handoff

> Not: Dosya adı tarihsel olarak `MAC_CONTINUATION.md` kaldı. Aktif çalışma ortamı GitHub Codespaces'tir.

Tarih: 1 Ekim 2026

## 1. Aktif çalışma ortamı

- Ortam: **GitHub Codespaces**
- Çalışma dizini: `/workspaces/msgsud-bale-programi`
- Shell: Linux/bash
- Branch: `feat/management-m39-teacher-planning-inputs`
- Komut biçimi: `npm`, `npx`
- Kullanıcı yeni ortam bildirmedikçe Codespaces geçerli kabul edilir

Başlangıç:

```bash
cd /workspaces/msgsud-bale-programi
git fetch origin
git switch feat/management-m39-teacher-planning-inputs
git pull --ff-only
git rev-parse HEAD
git status --short
cat AGENTS.md
cat docs/MAC_CONTINUATION.md
```

## 2. Güncel doğrulanmış durum

### M33.2 — CLOSED / PASS
- hard-rule valid
- 300/300 placement
- Cuma ek dersi warning yok
- provisional salon bilgileri blocker değil

### M33.3 — CLOSED / PASS
- weighted in-memory objective optimizer
- browser A/B priorities materially affect output
- no auto-apply
- Codespaces önceki acceptance PASS

### M33.4 — CLOSED / PASS
- explicit proposal confirmation
- DB-side baseline stale guard
- fast atomic solver proposal apply
- bundle Geri Al / Yinele
- timeout fix M33.4.2
- stale proposal auto invalidation
- global history controls

### Management UI normalization — CLOSED / PASS
- Program deliberate full-width dense workbench
- Ders Planı / Kaynaklar / Program Durumu normalized content family
- Öncelikler accepted wider sidebar layout
- typography floor / status color / action hierarchy contract frozen
- `docs/MANAGEMENT_UI_SYSTEM.md`

### Final Codespaces proof — 30 Eylül 2026
```
Test Files  16 passed (16)
Tests       81 passed (81)
npm run build PASS
```

Latest implementation checkpoint:
```
2b7a2a7b2f11da1c6a29f27bc00c470e8d6b0f76
ui: hide zero issue badges on program status
```

Known limitation:
Kaynak adı/durum/profil gibi resource mutations henüz global management history engine'e
undoable root olarak yazılmıyor. Global history controls sekmeler arasında görünür, fakat
resource-edit undo ayrı backend package gerektirir.

## 3. M33.3 davranışı

`Programı kontrol et`:
- yalnız zorunlu kurallar
- preferences kullanmaz

`Bu tercihlerle seçenek oluştur`:
- ekrandaki weights'i doğrudan kullanır
- read-only
- current program baseline
- local best-improvement search
- no auto apply

Metric vector:
- changeCost
- preferredTeacherContinuityBreaks
- teacherIdleGapPeriods
- roomStabilityBreaks

Score:
- raw metric / cardCount
- normalized * preference weight
- toplam düşük daha iyi
- weight 0 metric'i devre dışı bırakır

Search guard:
- max 8 accepted move
- kart başına 24 yakın candidate
- structural domain guard 400
- locked immutable
- hard rules her move'da korunur

Global optimum garantisi yok; local improvement.

## 4. Tarihsel M33.3 acceptance notu

Codespaces:

```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Beklenen:
- eski 72 test + yeni optimizer testleri PASS
- build PASS

Browser:
1. Öncelikler refresh
2. sol başlık `Öncelikler / Kayıtlı ayarlar`
3. en az bir tercih açık
4. `Bu tercihlerle seçenek oluştur`
5. sonucu ve süreyi kaydet
6. farklı bir ağırlık kombinasyonu seç
7. yeniden çalıştır
8. önerinin veya UNCHANGED sonucunun önceliklere göre anlamlı biçimde değiştiğini doğrula
9. Program ekranında mevcut schedule'ın değişmediğini doğrula

Önerilen ilk iki smoke:
- A: yalnız `Öğretmen boşluklarını azalt = Çok yüksek`
- B: `Mevcut programı mümkün olduğunca koru = Çok yüksek` + `Öğretmen boşluklarını azalt = Çok yüksek`

A'nın daha fazla değişiklik yapabilmesi; B'nin daha muhafazakâr kalması beklenir.

## 6. Değişmez kurallar

- Applied migration geriye dönük düzenlenmez
- Force push yok
- Runtime/browser kanıtı varsayımdan üstündür
- M32.4.2 planning pool != manual placement override
- M22 UNKNOWN != ABSENT != UNAVAILABLE
- Solver snapshot + in-memory
- no automatic apply
- kullanıcı yeni ortam bildirmedikçe Codespaces/Linux


## 7. M33.3 production A/B smoke ve multi-seed düzeltmesi

Production A/B smoke:
- ilk koşu: changeCost 11, teacher gaps 67, room breaks 39
- ikinci koşu: changeCost 12, teacher gaps 67, room breaks 40

Birleşik öncelik koşusunun daha fazla değişiklik üretmesi local optimum zayıflığını gösterdi.

Fix:
```
d656b22cc679bf09576388319636e28ee833cfd0
feat: add multi-seed objective search

b05860c4f27e0bbf65350a5cb6f36339ea878d17
test: guard combined search against weaker local optimum
```

Yeni seçim:
- baseline
- combined-weight local search
- aktif tek-hedef seed'leri
aynı combined weights ile yeniden puanlanır; en düşük combined score seçilir.

Vercel core + regression build PASS.

Display cleanup:
```
21c87adb28f77625ccab77132b08fb3de91f8eff
polish: localize remaining group labels
```

PARALELL/PARALLEL -> PARALEL
SHARED -> ORTAK

Sıradaki acceptance:

```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
```

Beklenen full suite PASS.

Ardından production aynı iki koşu:
A. yalnız Öğretmen boşluklarını azalt = Çok yüksek
B. Mevcut programı mümkün olduğunca koru = Çok yüksek + Öğretmen boşluklarını azalt = Çok yüksek

B sonucu, A'da bulunan çözümün combined score'undan daha kötü olmamalı.
Özellikle aynı 67 boşluk seviyesinde changeCost 12 yerine 11 veya daha iyi beklenir.


## 8. M33.3 multi-seed production acceptance — PASS

Production A/B rerun:

Scenario A:
- yalnız Öğretmen boşluklarını azalt = Çok yüksek
- changeCost 12
- teacher gaps 97 -> 67
- room breaks 40 -> 40

Scenario B:
- Mevcut programı mümkün olduğunca koru = Çok yüksek
- Öğretmen boşluklarını azalt = Çok yüksek
- changeCost 10
- teacher gaps 97 -> 67
- room breaks 40 -> 40

Sonuç:
- aynı 30-period teacher-gap improvement
- preserve-current priority 2 daha az changed decision üretti
- multi-seed fix production'da beklenen yönde çalışıyor
- preferences gerçekten solution selection'ı etkiliyor
- no auto apply

Display:
- PARALELL/PARALLEL -> PARALEL production PASS
- SHARED -> ORTAK production PASS

Browser acceptance M33.3-v0: PASS.

Kapanış için kalan tek ana teknik kanıt:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
```

Beklenen:
- 15 test files PASS
- 77 tests PASS (multi-seed regression dahil)

Bu da PASS olursa M33.3-v0 CLOSED.


## 9. Öncelikler sayfası seçim/onay/çalışma akışı refactor

Yeni UX sırası:
1. Tercih ayarı
2. Program kontrolü
3. Program seçeneği

Selection safety:
- dirty edit varken başka kayıt/+Yeni seçimi confirmation ister
- `Burada kal`
- `Değişiklikleri bırak ve geç`

Activation safety:
- başka saved/new ayar ACTIVE yapılacaksa mevcut active profile'ın yerini alacağı açıkça gösterilir
- `Vazgeç`
- `Onayla ve kullan`

Save semantics:
- active + dirty -> Değişiklikleri kaydet
- active + clean -> Kaydedildi · kullanımda
- draft/new -> Taslak olarak kaydet
- draft/new -> Kaydet ve kullan
- clean saved draft -> Kullanıma al

Preview semantics:
- `Bu tercihlerle seçenek oluştur` save gerektirmez
- local ekran weights kullanılır
- result badge source'u söyler:
  - Kaydedilmemiş tercihlerle hesaplandı
  - Kullanımdaki ayarla hesaplandı
  - Kayıtlı taslakla hesaplandı
  - Ekrandaki tercihlerle hesaplandı

Layout:
- sticky saved-settings sidebar
- responsive 1-column / desktop sidebar+main
- objective cards preference edit altında
- unavailable preferences compact
- save/use bar preferences'tan hemen sonra
- UNKNOWN room status + hard diagnostics Program kontrolü altında
- optimizer Program seçeneği altında

Commits:
```
688f8df683f083d4c47dafd2a26795addb38cb12
a0384694695f8be2e3b88f819e4f78e1a591e7a6
24543f0bf380a477dd5c72ad168b1922b3bef59c
c97b9ab07e0a898a27552a0c06ce53756ba55e76
f3342697d679dcfdc9d53d539408ee6ec469fd6b
283290f73f2617dc33e4dfa9ef263afc7267e769
```

Production acceptance pending.

Codespaces after pull:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Browser smoke:
1. aktif bir ayarı değiştir; kaydetmeden başka kayda tıkla -> warning
2. warning'de Burada kal -> edit korunmalı
3. tekrar başka kayda tıkla -> Değişiklikleri bırak ve geç -> target yüklenmeli
4. bir draft seç -> Kullanıma al -> replacement confirmation
5. Vazgeç -> active değişmemeli
6. tekrar onay -> yeni ayar Kullanımda olmalı
7. yeni/draft preference'ı kaydetmeden değiştir -> seçenek oluştur -> provenance = Kaydedilmemiş tercihlerle hesaplandı
8. Program ekranına geç -> schedule unchanged


## 10. Öncelik kontrolleri accordion

Tercih kartları compact accordion'a çevrildi.

Commit:
```
c8830c24171ac560a49868ed0a282beeda018926
polish: collapse preference controls into accordion
```

Collapsed görünüm:
- tercih başlığı
- mevcut seviye badge
- chevron

Expanded görünüm:
- açıklama
- mevcut program metriği
- Kapalı / Düşük / Orta / Yüksek / Çok yüksek seçimleri

Aynı anda yalnız bir tercih açık.
Dirty/save/use/preview semantiği değişmedi.


## 11. Öncelikler sayfası tekrar azaltma

Commit:
```
94eb8b34a9aa359aec4fb453b597d15a7a87686b
refactor: remove repeated state from preferences page
```

Tekrarlanan UI kaldırıldı:
- top status badges
- ayrı Durum field
- active+clean save bar
- profile/status/count repetition
- separate future-preferences card
- duplicate Program kontrolü info box

Yeni davranış:
- active/taslak state yalnız sidebar'da
- active+dirty -> compact Kaydedilmemiş değişiklikler + Kaydet
- active+clean -> action bar yok
- draft/new -> yalnız save/use buttons
- future preferences -> Tercihler footer'ında tek satır
- hard-ready success badge yok; yalnız problem varsa hata görünür

Production smoke pending.


## 12. Öncelikler UI freeze / M33.3 kapanış kapısı

Kullanıcı mevcut Öncelikler görünümünü şimdilik koruma kararı verdi.

UI freeze:
- kullanıcı istemedikçe layout/hiyerarşi değiştirilmez
- yeni teknik paketler mevcut sade yapıyı büyütmez
- yalnız gerekli işlevsel eklemeler minimal biçimde yapılır

Frozen order:
1. Kayıtlı ayarlar
2. Tercih ayarı
3. Ayar adı / not
4. preference dropdown rows
5. dirty ise compact save
6. Program kontrolü
7. Program seçeneği

M33.3 browser acceptance PASS:
- weights sonucu gerçekten değiştiriyor
- multi-seed A/B PASS
- same teacher-gap improvement'ta preserve-current objective changeCost'u 12 -> 10 düşürdü
- no auto apply

M33.3 CLOSED için kalan:

```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

PASS sonrası M33.3 CLOSED.

Sonraki paket için öneri:
M33.4 explicit proposal review/apply
- current vs proposed full diff
- human confirmation
- fresh snapshot/hash guard
- atomic apply
- undo/redo
- hard-rule revalidation
- no automatic apply


## 13. M33.3 CLOSED / M33.4 açılışı

Final Codespaces acceptance:
```
Test Files 15 passed (15)
Tests 77 passed (77)
```

Build:
- Next.js webpack PASS
- TypeScript PASS
- /yonetim PASS

M33.3: **CLOSED/PASS**

Öncelikler UI: frozen.

M33.4:
**explicit proposal review/apply**

İlk iş:
- mevcut atomic placement transaction
- undo/redo
- preview/apply
- transaction history
altyapısını reuse edecek yolu belirle.

No auto-apply.
Stale snapshot/hash apply reddedilmeli.


## 14. M33.4-v0 explicit proposal apply hazır

Implementation:
```
19e6c964f72d517d63970d7e344e7802add6e96d
0669ab2f6f4ce96f9bd280a7880da17903ee7c93
f4b44a345ef75ade776da0e0a8bc6793ef34bc68
29b01fa94ede126eb62ab193dd85bdad4495efb6
```

Contract:
```
f5bac7ead73937f9566bbeb3a8996cace67f4a56
docs/M33_4_PROPOSAL_APPLY.md
```

Vercel implementation commits PASS.

Flow:
- proposal IMPROVED
- Öneriyi uygula
- explicit Onayla ve uygula
- fresh snapshotHash + baselineHash compare
- stale ise reject
- changed final placements -> existing M26.8 move bundle
- atomic transaction
- normal bundle undo/redo
- no auto apply
- no new migration

Codespaces acceptance:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Browser acceptance:
1. proposal oluştur
2. Öneriyi uygula
3. Vazgeç -> unchanged
4. tekrar Onayla ve uygula
5. Program view changes
6. Geri Al one step
7. Yinele one step
8. stale proposal reject
9. apply sonrası Programı kontrol et -> valid / 300/300


## 15. M33.4 browser regression fixes

User acceptance sonucu:
- proposal apply: PASS
- explicit confirmation: PASS
- undo: çalışıyor
- hızlı art arda undo: stale command-state race bulundu
- redo: bundle sibling self-conflict nedeniyle FAIL
- optimizer UI text: fazla küçük

Fix commits:
```
ffe546b6a72ead9066fcf96e8fae5a869ec310bd
fix: replay grouped moves as one bundle on redo

5e5ac459ba5fcf608b88c26df6cd53aa3b740248
fix: prevent stale history clicks during refresh

b1338e8bdfc1d1aa560c32d99d7417e5d32846dd
ux: increase priorities workspace text size
```

New migration:
```
20260930160000_management_m33_4_1_bundle_redo.sql
```

Codespaces:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
npx supabase migration list
npx supabase db push --dry-run
```

Dry-run yalnız `20260930160000_management_m33_4_1_bundle_redo.sql`
gösterirse:
```bash
npx supabase db push
```

Sonra browser:
- pending Yinele tekrar dene
- undo/redo art arda dene
- stale root hatası olmamalı
- proposal apply -> undo -> redo
- Programı kontrol et
- typography kontrol


## 16. M33.4 remote migration verification required

Second browser acceptance:
- first proposal apply timeout
- later apply success
- undo works
- redo still shows old `Seçtiğiniz yer artık uygun değil` error

This exact message indicates old single-root redo path is still being hit.
Before further redo code changes, verify remote DB migration:

```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npx supabase migration list | tail -25
npx supabase db push --dry-run
```

Required remote migration:
```
20260930160000_management_m33_4_1_bundle_redo.sql
```

If dry-run shows only that migration:
```bash
npx supabase db push
```

Additional UI safety fix:
```
a55b0023fc7f44bba3daadea7a648070321a02f9
fix: invalidate applied and stale solver proposals
```

Successful apply now clears the proposal/confirmation; workspace hash changes clear stale proposals.


## 17. M33.4.2 fast apply/redo

Latest browser result:
- redo now hits statement timeout rather than old single-card invalid-candidate error
- interpreted as M33.4.1 path active but too heavy

New migration:
```
20260930164500_management_m33_4_2_fast_solver_apply_redo.sql
b7697ca0a18780ad17354563256cf12b8392d28a
```

Client:
```
aa964985e5074a397415e421c66bbddb98117a64
bc92faf394b7789ad8082f7dd4e94153c4030aa7
```

M33.4.2 removes occupancy-relative candidate-domain refresh from solver apply
and MOVE redo critical transactions.

Safety retained:
- baseline hash stale guard
- DRAFT/revision/lock checks
- external + internal time/resource/group overlap validation
- atomic history bundle
- undo/redo audit semantics

Interactive candidate data remains lazy; drag/assistant already refresh selected groups.

Codespaces:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
npx supabase migration list | tail -30
npx supabase db push --dry-run
```

Then push expected pending migrations and browser test:
proposal -> apply -> undo -> redo -> undo -> redo.


## 18. M33.4.3 Öncelikler UX

M33.4.2 apply/undo/redo kullanıcı tarafından düzeldi olarak doğrulandı.

Kalan UX paketi:

```
54a3a9f25d87c4a2ff16ea219eabd1dfb5619c35
ux: add solver undo and visible optimization progress

64a3a45be8dfa99fae7942ff6f23ff3cf1220c92
feat: expose program undo on priorities page
```

Öncelikler:
- üst kartta `↶ Geri Al`
- global management undo kullanır
- fresh history yokken disabled

Program seçeneği:
- click sonrası önce busy UI browser'a paint edilir
- sonra synchronous in-memory optimizer başlar
- `Seçenek aranıyor…`
- mavi status kartı:
  `Program seçenekleri karşılaştırılıyor…`
  `Bu işlem birkaç saniye sürebilir. İşlem devam ediyor; tamamlandığında sonuç burada görünecek.`

Codespaces acceptance:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Browser:
1. Öncelikler -> seçenek oluştur -> progress mesajı anında görünmeli
2. proposal apply
3. aynı Öncelikler ekranında Geri Al etkinleşmeli
4. Geri Al tek adımda proposal bundle'ı geri almalı
5. refresh sırasında buton çift tıklamaya izin vermemeli


## 19. Global history + visual consistency

History controls artık global top bar'da.

Commits:
```
9e9fa54e35635a35c75501ed4ef217803f274704
f0d3aac5b520dc9a561fbd48a34c06b6dbabac5f
c22d98042ed81d8435db7ff4e888e37a112396ac
964fd6263a6d976cf34cbbae0cfd52aac4cc04de
```

Visible on:
- Program
- Ders Planı
- Kaynaklar
- Öncelikler
- Program Durumu

Local duplicate history buttons removed.

Important:
resource edits themselves are not yet written to the management undo/redo history.
Global buttons on Resources operate on the current undoable program history item.

Visual audit:
- Resources still has many 8/9px legacy text styles
- Course Plan still has many 8/9px legacy text styles
- Solver is now predominantly 11/12px

Recommended next UX package:
Management UI normalization without changing accepted page IA:
typography floor, section headers, buttons, badges, radii, spacing.


## 20. Management UI normalization

Visual screenshots confirmed UI drift between tabs.

Normalization commits:
```
310145deb1c067bcae8904b2bf28d2b44b7cfc74
1612a533db553f2a7c46392f4b4d090a8947ee46
aa8db2608af4b74ab828f1a0396546b9f4a3e8a5
b5bf4a928abb3315717ecf21965b3a66904f1334
f15fee41d61fad2a1b3f32a90c1cfad6545b9521
```

Vercel: PASS.

Visual contract:
```
8799ac2224a95eaf5971db4f1f7f5b4a80733ca7
docs/MANAGEMENT_UI_SYSTEM.md
```

Key rules:
- no new 8/9px body/meta on content screens
- normal content pages 1220px
- Program intentionally full-width dense
- Solver intentionally wider due sidebar
- global undo/redo in top bar
- common status colors / surfaces / spacing
- long work must visibly show progress

Next Codespaces:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Then browser review all 5 tabs for clipping/overflow after typography growth.


## 21. UI normalization visual acceptance

Post-normalization screenshots reviewed.

Accepted:
- Program
- Ders Planı
- Kaynaklar
- Öncelikler
- Program Durumu overall hierarchy
- global history placement

No visible clipping/overflow regressions.

Small follow-up:
```
2b7a2a7b2f11da1c6a29f27bc00c470e8d6b0f76
ui: hide zero issue badges on program status
```

Optional later:
make publication comparison list collapsible/shorter; not required for current acceptance.


## 22. Final Codespaces acceptance

30 Eylül 2026 / GitHub Codespaces:

```
Test Files  16 passed (16)
Tests       81 passed (81)
Duration    2.98s
```

`npm run build`:
- compile PASS
- TypeScript PASS
- page generation PASS
- build traces PASS
- final optimization PASS

Current closure:
- M33.4 CLOSED/PASS
- Management UI normalization CLOSED/PASS

Next session must not reopen these packages unless a regression is reproduced.

## 23. M34 resource history + Program card actions + Codespaces local dev — PASS

1 Ekim 2026 / GitHub Codespaces.

Branch history:
- M34 resource history: `feat/management-m34-resource-history`
- Program card actions: `feat/management-program-card-actions`

M34 migrations:
```
20260930230000_management_m34_0_resource_history.sql
20260930230500_management_m34_1_resource_mutation_history.sql
```

Remote migration status:
- both local/remote matched
- applied successfully

M34 result:
- resource mutations are first-class global history roots
- teacher/room create, delete, rename, status/profile edits enter global LIFO
- undo/redo preserves exact resource UUIDs
- structural epoch boundary retained
- stale-state guards retained
- schedule + resource history interleave correctly

Regression proof:
```
Test Files  17 passed (17)
Tests       84 passed (84)
npm run build PASS
TypeScript PASS
```

Program card actions:
- placed card can be dragged directly back to Ders Havuzu
- if pool is closed, top Ders Havuzu button acts as remove drop target
- drop remove uses existing REMOVE / bundle REMOVE authority
- right-click context menu:
  - Düzenle
  - Kaldır
- Düzenle opens/focuses right inspector
- Kaldır preserves confirmation flow
- browser smoke PASS
- undo after drag-remove PASS

Codespaces local dev:
- Vercel deployment is no longer required for daily MSGSÜ İDK work
- dev server runs through forwarded port 3000
- Next.js 16 Turbopack/webpack conflict fixed by:
```
"dev": "next dev --webpack"
```
- development env is provided locally via ignored `.env.local`
- standard Supabase command form in Codespaces is always:
```
npx supabase ...
```

Local start:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
cp .env.production .env.local   # only if .env.local is missing
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Important:
- do not re-open M33.4, UI normalization, or M34 unless a concrete regression is reproduced.
- runtime/browser proof is accepted for M34 + Program card actions.

## 24. M35 UX / operational safety — OPEN

Working branch:
```
feat/management-m35-ux-safety
```

Goal: one consolidated UX/safety package without changing accepted solver/history authority.

Planned scope:
- more descriptive Undo/Redo labels
- richer timetable card context actions
- direct resource-aware Program navigation where existing data permits
- clearer placement/candidate diagnostics
- no new solver engine
- no M33/M34 backend rewrite
- no migration unless strictly necessary

### M35 consolidated implementation — ready for Codespaces acceptance

Commits after M34/program-card baseline:
```
551de5ef4297167c48d49d05a78e7e147a1b4b2b  docs: checkpoint M34 and open M35 UX package
145bf705e52374accc63f3f165aff539e3751c4a  ux: add inspector intents and clearer candidate diagnostics
66518744fe2cf22aea89433ced8243bec374c1d2  ux: link resources directly back to program usage
f6213272ac9ad872487cf2923d0b4afac0757612  ux: consolidate M35 program navigation and context actions
ed827d89efdcc51a2be7b4222964eccdacb1e2a2  fix: reset inspector intent on ordinary card selection
79eac033804daaf5ae1b7bafd3d9f349d38ad6cd  ux: include current placement context in history labels
```

Implemented:
- global history tooltips now include bundle/automatic counts and current placement context where available
- resource history labels retain resource name + operation type
- timetable right-click menu expanded:
  - Düzenle
  - Alternatif yerler
  - Öğretmeni değiştir
  - Salonu değiştir
  - Kaldır
- context actions reuse existing inspector / candidate / resource-preview authorities
- placed cards can now display the existing valid-candidate list in inspector
- candidate diagnostics surface the most frequent blocking reason and usable/unresolved summary
- Resources rows with live program usage have a Program shortcut
- resource Program shortcut switches to teacher/room Program view, finds a real placed card using that resource, opens the correct day/stage and focuses its inspector
- ordinary card selection resets any previous context-menu inspector intent
- no new backend authority
- no new migration
- M33/M34 algorithms untouched

Static review:
- modified TSX files have balanced braces/parentheses
- new prop chains verified
- branch is based directly on accepted Program-card-actions checkpoint
- branch ahead of baseline: 6 commits / behind 0 at implementation checkpoint

Acceptance gate:
```bash
git switch feat/management-m35-ux-safety
git pull --ff-only
npm test
npm run build
```

Browser smoke:
1. right-click a placed card -> all five menu actions visible
2. Alternatif yerler -> inspector opens candidate list; current placement is marked Mevcut
3. Öğretmeni değiştir -> inspector opens teacher change mode
4. Salonu değiştir -> inspector opens room change mode
5. Kaldır -> confirmation remains
6. normal left-click another card -> previous special edit mode is cleared
7. Kaynaklar -> a used teacher/room -> Program -> correct resource view/day/card opens
8. candidate diagnostics -> En sık engel summary appears when blockers exist
9. global Undo/Redo hover text -> subject/resource and available placement/bundle context is more descriptive

### M35 browser feedback round 1 — fixes applied

User browser review:
- right-click five-action menu: PASS
- Alternatif yerler opened inspector but target accordion stayed closed and panel did not scroll
- teacher/room shortcut selected the right mode but did not scroll/focus if inspector was already open and scrolled
- Kaynaklar -> Program picked an arbitrary first card when a resource had many lessons
- Kaynaklar teacher action buttons could overlap
- history tooltip enrichment was acceptable; no major issue reported

Fix commits:
```
7b0711e3d879461e6dc5785f1539e1183f4e3f4f  fix: scroll inspector shortcuts to their target sections
7146f7ff1b91e8b110bf79c208bc94ded893eaa8  fix: size resource actions and pass resource label
ea412bad7729e978aebd7140010bcc5ed4509d7c  fix: show resource program as an explicit filtered view
344b82111621ee21a71393fdc0e1cadab47cf6a9  fix: preserve context-menu inspector intent across card reset
55167a94fcf48b7b8a4650e9a29da812386b0e9e  polish: make resource program filtering explicit and dismissible
```

Behavior after fixes:
- context-menu inspector shortcuts use target section refs + smooth scrollIntoView
- target section receives a visible blue focus ring
- candidate accordion is forced open for CANDIDATES intent
- old card-change reset effects are intent-aware and no longer close the requested section
- repeated click on same shortcut still re-focuses via openIntentNonce
- resource Program no longer selects an arbitrary card
- resource Program opens Teacher/Room Program view with a resource filter pill
- only placements using that resource are shown
- current stage/day are retained when they contain usage; otherwise first stage/day with usage is selected
- filter is removable with the pill or by choosing a normal resource view / top Program navigation
- teacher resource action column widened and actions can wrap safely
- no migration / backend authority changes

Acceptance rerun:
```bash
git switch feat/management-m35-ux-safety
git pull --ff-only
npm test
npm run build
```

Browser:
1. right-click placed card -> Alternatif yerler -> inspector scrolls to open candidate list
2. right-click -> Öğretmeni değiştir -> scrolls to highlighted teacher edit section
3. right-click -> Salonu değiştir -> scrolls to highlighted room edit section
4. Kaynaklar -> used teacher/room -> Program -> no card is arbitrarily selected; one filtered resource row opens
5. switch days/stage while filter is active -> browse that resource's usage
6. click filter pill × or normal Program/resource-view navigation -> filter clears
7. resource row actions no longer overlap

### M35.1 teacher departure + multi-resource Program filters — implementation ready

User requirement:
- a teacher may leave after term start without forcing the timetable to move
- used teachers must be closable/deletable with explicit warning
- affected lessons may remain in the exact same day/time/room with teacher empty
- later a normal or temporary teacher can be assigned through the existing Program resource-change flow
- Program teacher/room rows should show only the resource name
- right-clicking the Program title strip should allow multiple teacher/room filters

New migration:
```
20261001010000_management_m35_teacher_departure.sql
```

Teacher departure contract:
- `INACTIVATE_KEEP`: teacher becomes unavailable for new candidates; current placement teacher links stay
- `INACTIVATE_CLEAR`: current draft requirement links + placement teacher ids are cleared; day/time/room remain exactly unchanged
- `ARCHIVE_CLEAR`: same clear behavior plus logical archive (`teachers.archived_at`); teacher disappears from active Resources while historical/FK identity remains
- unused teachers keep the old physical-delete path
- unused/unreferenced teachers keep the old direct inactive/active status path
- warnings/previews are shown only when active requirements or placements are actually affected
- candidate domains are refreshed for affected cards
- current published projection is not rewritten by this draft operation

History:
- new RESOURCE operation `TEACHER_DEPARTURE`
- one global LIFO history root per departure action
- scoped snapshots contain status/archive state, exact current-revision requirement links, requirement `teacher_mode`, and exact placement teacher ids
- undo/redo restores the same teacher UUID, teacher modes, requirement links, and placement teacher ids
- M34 legacy RESOURCE operations continue through the existing snapshot/apply functions
- structural history epoch rules remain unchanged

Resources UI:
- used teacher “Atamaya kapat” opens impact preview
- options:
  - Derslerden çıkar ve atamaya kapat
  - Yalnız yeni atamalara kapat
- used teacher “Sil” opens archive warning and preserves timetable slots
- unused teacher “Sil” remains physical delete
- archived teachers are omitted from active Resources inventory
- teacher and room action columns aligned/wrap safely

Program resource rows:
- teacher rows no longer append “Öğretmen”
- room rows no longer append “Salon”
- first column shows only the actual resource name

Program multi-resource filters:
- right-click Program title strip -> Filtre ekle
- multiple teachers can be selected (OR within teacher group)
- multiple rooms can be selected (OR within room group)
- teacher + room filters combine with AND between groups
- filters appear as removable pills
- Sınıflar / Öğretmenler / Salonlar views retain the filters
- empty class/resource rows collapse while filters are active
- Resources -> Program initializes the same filter system with one selected resource
- top Program navigation and Ders Planı -> Program navigation clear resource filters
- card context menu and filter popup are mutually exclusive

Implementation commits after browser-feedback checkpoint include:
```
adb67887305fbb07ee80bafe9e28668a80ae18a3  feat: add controlled teacher departure with undoable slot preservation
a5e2798fcb84ed546d4a1ee5e27a180770360663  feat: expose teacher departure preview and apply client
04521a9355616aac478b2aaf15ca3af1c9c0a04c  feat: register teacher departure history operation
9eae2312deb5dff2a035eef95369b1f181aeeceb  ui: remove redundant teacher and room secondary row labels
a4d2abe7cd1e6ceaa0c8b4b6d8779499d193455e  feat: warn and preserve slots when teachers leave
76929c1f0198143ec98243e8c7ccddcb061d3be4  feat: wire teacher departure history labels and client imports
623a08e95e7b1575b5ebd2e5f5dfb0d862bb0b8f  feat: connect resource teacher departure workflow
97fd3c437c8a6925c5c8f71773522a82d5df5e91  feat: support multi teacher and room filters in Program
f6514dd03ab3b86ff5965c794da8783a68b51325  ux: add right-click multi-resource filter menu
5951fd72220e8365d5188a17958e1f41a9e2990b  polish: stabilize multi-filter header interactions
01c929cd02157b95f9275a3456cccbdc00a99388  test: cover teacher departure in global resource history
7536274623d8880f53d28ec6c8537f5de4c2f993  ux: collapse empty class rows under resource filters
6c96633132253044be994bb9078507d103459736  fix: align room resource action column
ffdc5f95fd1c804bbcbd97905f240d7f16f1b23d  fix: preserve teacher departure snapshot array order
4f4410c34c95fa8fefbe06e7cf7e8fe5bedd8cad  fix: preserve physical delete for unused teachers
97a5d11246da97fe68c562cd45dcbba1baa04a6c  fix: retain unused teacher physical deletion path
fa54eda980f80d8774253470b394209785cf8d69  fix: preserve exact teacher mode through departure undo redo
```

Static gate before Codespaces:
- modified TS/TSX files: balanced braces/parens/brackets
- migration: 20 `$$` delimiters, one transaction BEGIN/COMMIT
- no legacy single-resource `programResourceFocus` references
- no teacher/room row secondary labels
- room/teacher action column mismatch removed
- SQL runtime and TypeScript build still require Codespaces acceptance before migration push

Expected regression count after added history test:
```
17 test files
85 tests
```

Codespaces gate:
```bash
git pull --ff-only
npm test
npm run build
npx supabase migration list | tail -30
npx supabase db push --dry-run
```

Dry-run must show only:
```
20261001010000_management_m35_teacher_departure.sql
```

Only after code gate + dry-run PASS:
```bash
npx supabase db push
npx supabase migration list | tail -30
```

Then restart local dev and run browser smoke.

### M35.2 timeout fix + explicit VE/VEYA resource filtering — ready for acceptance

Browser failure after M35.1 migration:
- used-teacher departure preview opened correctly
- apply failed with PostgreSQL: `canceling statement due to statement timeout`
- reproduced conceptually on teachers with many active requirements/placements
- root cause: `management_apply_teacher_departure_state` synchronously called
  `refresh_management_candidate_domain_subset(...)` inside the same RPC transaction
- the older M28 teacher status path uses the same expensive rebuild primitive

Fix migration:
```
20261001043000_management_m35_2_teacher_departure_fast_path.sql
```

M35.2 departure behavior:
- teacher status / requirement links / placement teacher ids / archive state still change atomically
- day, period and room remain untouched
- global RESOURCE history snapshot/undo/redo remains exact
- synchronous candidate-domain rebuild is removed from departure + undo/redo critical path
- current requirement teacher links and teacher operational status are authoritative immediately
- stale persisted candidate rows are revalidated client-side:
  - inactive teacher -> `TEACHER_INACTIVE`
  - teacher no longer in requirement pool -> `TEACHER_NOT_IN_REQUIREMENT_POOL`
- stale rows cannot remain in the UI's valid-candidate list
- archived teachers are removed from current board/planning options

Program resource filter semantics revised:
- explicit mode selector added to right-click filter menu
- default: `Herhangi biri · VEYA`
  - a card is shown when ANY selected teacher OR ANY selected room matches
  - best for combined schedule/usage overview
- optional: `Kesişim · VE`
  - within teacher selections: OR
  - within room selections: OR
  - between teacher group and room group: AND
  - e.g. (Teacher A OR Teacher B) AND (Room 101 OR Room 102)
- this avoids impossible semantics such as requiring one lesson to have Teacher A AND Teacher B simultaneously

Regression coverage added:
- stale candidate from a departed/inactive teacher becomes INVALID
- VEYA mode includes cards matching either selected resource group
- VE mode requires teacher-group + room-group intersection

Expected tests after this patch: 88 total if no other test-count changes.

Acceptance:
```bash
git pull --ff-only
npm test
npm run build
npx supabase migration list | tail -10
npx supabase db push --dry-run
```

Dry-run must show only:
```
20261001043000_management_m35_2_teacher_departure_fast_path.sql
```

Then:
```bash
npx supabase db push
```
### M35.2 acceptance — PASS

Browser/runtime acceptance completed successfully.

Accepted behavior:
- used teacher departure no longer hits statement timeout
- `Derslerden çıkar ve atamaya kapat` preserves day/time/room and clears teacher assignment
- teacher departure remains globally undoable/redoable
- archived/inactive teachers are excluded from active planning choices
- stale persisted candidate rows from departed teachers are rejected by live client validation
- Program resource filters work with explicit `Herhangi biri · VEYA` and `Kesişim · VE` modes
- teacher/room first-column labels remain simplified
- multi-resource filter pills and right-click filter menu accepted
- no further regression reported in this acceptance round

Migration status:
```
20261001010000_management_m35_teacher_departure.sql              APPLIED
20261001043000_management_m35_2_teacher_departure_fast_path.sql  APPLIED
```

Checkpoint:
```
branch: feat/management-m35-ux-safety
HEAD before acceptance-log commit: d45ecf846715b8e3c7264810666c770c406fa548
status: M35.2 PASS
```

Do not reopen M35.2 unless a concrete regression is reproduced.
## 25. M36 operational resource gaps + publication safety — READY FOR ACCEPTANCE

Base checkpoint: M35.2 PASS.

Working branch:
```
feat/management-m36-operational-gaps
```

Goal:
- make intentionally preserved teacher/room gaps operationally visible after mid-term resource changes
- let the administrator jump directly from health/status to the affected timetable card
- prevent publication from relying only on potentially stale candidate-domain summaries
- keep M33/M34/M35 history and solver authority unchanged

Implemented:
- shared live-gap semantics in `lib/managementBoard.ts`:
  - required teacher + placed card + null teacher => teacher gap
  - non-UNKNOWN room strategy + placed card + null room => room gap
- Program top bar now shows `Öğretmensiz · N` / `Salonsuz · N` controls when relevant
- clicking a gap control:
  - opens Program / Sınıflar
  - filters to the relevant operational gaps
  - opens the first affected card
  - focuses the Teacher or Room assignment section
- gap filters stay visible even when the current stage/day has zero matches so they can always be cleared
- empty rows collapse under gap filtering
- a resolved card automatically leaves the gap view and its inspector closes after refresh
- timetable cards with a live resource gap show a compact `!` badge + tooltip
- teacher/room timetable row headers now say only `Öğretmen` / `Salon` instead of the generic `Sınıf / Alan`
- inspector changes `Öğretmen değiştir` -> `Öğretmen ata` and `Salon değiştir` -> `Salon ata` when the current resource is empty
- teacher options outside the course-plan pool are labelled `Geçici / manuel seçim` for a teacherless placed lesson
- Program Durumu health is now live-placement-aware and does not depend solely on persisted candidate summaries
- direct teacher/room gaps are not double-counted as generic unresolved health issues
- Program Durumu issue cards have actionable buttons (`Öğretmen ata`, `Salon ata`, `Programda incele`, `Ders havuzunu aç`)

Publication safety:
```
20261001094500_management_m36_0_publication_resource_gap_gate.sql
```
- wraps the established `management_preview_publication` gate instead of rewriting publication logic
- adds server-side blockers:
  - `MISSING_REQUIRED_TEACHER_PLACEMENT`
  - `MISSING_REQUIRED_ROOM_PLACEMENT`
- adds exact counts:
  - `missingRequiredTeacherPlacementCount`
  - `missingRequiredRoomPlacementCount`
- `management_apply_publication` continues calling the public gate name, therefore publication inherits the new blockers
- publication remains blocked even if M35.2 deliberately skipped synchronous candidate-domain rebuild

Regression coverage:
- new `tests/managementHealth.test.ts`
- verifies direct teacher gap with stale-valid domain
- verifies direct room gap
- verifies OPTIONAL teacher / UNKNOWN room strategy are not falsely blocked
- verifies direct gaps are not duplicated as generic unresolved warnings

Expected test count:
```
18 test files
92 tests
```

Acceptance gate:
```bash
git switch feat/management-m36-operational-gaps
git pull --ff-only
npm test
npm run build
npx supabase migration list | tail -12
npx supabase db push --dry-run
```

Dry-run must show only:
```
20261001094500_management_m36_0_publication_resource_gap_gate.sql
```

Only after test/build/dry-run PASS:
```bash
npx supabase db push
npx supabase migration list | tail -12
```

Browser acceptance:
1. leave one REQUIRED placed lesson teacherless using the accepted M35 flow
2. Program top bar shows `Öğretmensiz · N` and the card shows `!`
3. clicking the chip filters the board and opens `Öğretmen ata` on the affected card
4. assign an active teacher; the card disappears from the gap filter after refresh
5. Program Durumu shows/removes the corresponding blocker consistently
6. server publication gate shows/removes `Öğretmeni boş bırakılmış ders var` consistently
7. repeat the same flow for a room gap if a safe test lesson is available

Checkpoint before journal commit: f1f8969005d2c722b3c0d3c2b2cacff0aec1b5f0
### M36 final static checkpoint

Final implementation HEAD before this journal commit: `45e62944935a3fd8ce1b96cb478de5336467f273`

Final refactor notes:
- live teacher/room gap semantics are centralized in `cardHasMissingRequiredTeacher` / `cardHasMissingRequiredRoom`
- Program filters, Program Durumu, and timetable warning badges use the same helpers
- room-gap rule was checked against the schema: `resource_mode` is only `FIXED | ELIGIBLE_POOL | CAPABILITY | UNKNOWN`; therefore non-UNKNOWN + null placement room is a real operational gap
- selected-card cleanup includes gap filters, so a resolved card automatically leaves the filtered view

Final static proof:
- all modified TS/TSX files have balanced braces / parentheses / brackets
- M36 migration has 2 `$$` delimiters and exactly one transaction BEGIN/COMMIT
- branch is based on accepted M35.2 and is behind 0
- files changed from M35.2 baseline: 11

Runtime acceptance still required in Codespaces before applying the M36 migration.
### M36 test-gate regression fix

Codespaces first gate result:
```
18 test files
91 passed / 1 failed / 92 total
```

Failure:
`tests/managementTeacherPolicyCandidates.test.ts`
`counts policy rows already invalidated by the persisted domain layer`

Root cause:
- `policyFilteredCount` counted only rows that changed from persisted VALID to final INVALID
- this omitted rows already persisted as INVALID with `REQUIREMENT_TEACHER_MISMATCH`
- the test contract requires policy filtering to be counted from the active policy semantics, not only from status transitions

Fix:
- recompute `policyFilteredCount` from live teacher membership/status plus active REQUIREMENT+REQUIRED continuity policy
- persisted policy-invalid rows are counted
- BLOCK-scoped independent candidates remain excluded from requirement-policy counting
- M35 live `TEACHER_INACTIVE` / `TEACHER_NOT_IN_REQUIREMENT_POOL` enforcement remains intact

Fix implementation HEAD: f2071126c49d879de5af586268768b14088cc0ac

Required rerun before migration:
```bash
npm test
npm run build
```
### M36 browser feedback + M36.1 corrective package — READY FOR CODE GATE

Browser feedback after M36.0:
- live teacher-gap detection: PASS
- Program Durumu teacher-gap blocker: PASS
- server publication blocker for missing required teacher: PASS
- manual/temporary teacher UI opened correctly
- placement resource preview failed with `column "card_id" does not exist`
- room-gap flow could not be exercised because an in-use room could not be deleted/cleared

Root cause of manual teacher failure:
- M32.4.2 `management_preview_placement_resource_change_v2` CTE `effective_cards` exposes column `id`
- function incorrectly aggregated `card_id` from that CTE
- exact failing expression: `array_agg(card_id order by card_id)`
- M36.1 corrects it to `array_agg(effective.id order by effective.id)`

New follow-up migration:
```
20261001101500_management_m36_1_room_departure_and_override_fix.sql
```

M36.1 room departure model:
- adds logical `rooms.archived_at`
- adds `ROOM_DEPARTURE` as a first-class global RESOURCE history operation
- used canonical room with no aliases can be removed while preserving lesson day/time/teacher
- placement `room_id` becomes null; card remains in the same slot
- explicit requirement room link is removed
- if the removed room was the final explicit room, the existing non-UNKNOWN room requirement semantics are preserved so the lesson becomes a real `Salonsuz` operational gap
- remaining explicit pools normalize to FIXED (1) / ELIGIBLE_POOL (>1)
- CAPABILITY strategy metadata is preserved defensively
- no synchronous candidate-domain rebuild is performed inside room departure
- undo/redo restores exact room UUID, status/archive flag, requirement links, resource mode/capability, and placement room ids
- archive is blocked for canonical rooms with aliases; alias-family retirement is intentionally not implemented in this package
- unused alias-free rooms retain the existing physical delete path

Client/UI:
- in-use alias-free room `Sil` now opens an impact warning instead of being disabled
- warning states that day/time/teacher stay fixed and the room becomes empty
- archived canonical rooms disappear from Resources / Course Plan / Program room choices
- stale persisted candidates referencing non-ACTIVE rooms are rejected live with `ROOM_INACTIVE`
- roomless lesson manual choices show `Geçici / manuel seçim` outside the Course Plan room pool
- command history label supports `ROOM_DEPARTURE`

Regression coverage added:
- `ROOM_DEPARTURE` is recognized by global resource history
- stale candidates using OUT_OF_SERVICE rooms are rejected live

Expected next test count:
```
18 test files
94 tests
```

Static proof:
- modified TS/TSX brace/paren/bracket counts balanced
- M36.1 SQL has 18 `$$` delimiters (9 function bodies)
- SQL comments/strings stripped: parentheses 197/197
- broken `array_agg(card_id order by card_id)` occurrence: 0
- corrected `array_agg(effective.id order by effective.id)` occurrence: 1

Implementation HEAD before this journal commit: dc1b6893a3dce2f325f115a76c83a0f0d488b161

Next gate — do NOT push migration before both commands pass:
```bash
git pull --ff-only
npm test
npm run build
```

Then:
```bash
npx supabase migration list | tail -15
npx supabase db push --dry-run
```

Dry-run should show only:
```
20261001101500_management_m36_1_room_departure_and_override_fix.sql
```

Post-migration browser smoke:
1. teacherless lesson -> manual teacher -> Etkiyi hesapla: no `card_id` error
2. apply teacher -> same slot, teacher fills, teacher gap clears
3. used alias-free room -> Kaynaklar / Salonlar / Sil -> warning modal
4. apply room archive -> same day/time/teacher, room becomes empty
5. Program shows `Salonsuz · N`; Program Durumu + publication gate block it
6. assign active room -> same slot, room fills, gap clears
7. Undo/Redo ROOM_DEPARTURE restores/clears exact room state
### M36.1 browser acceptance — PASS / ready to merge

Browser smoke passed:
- teacherless operational gap shown in Program, Program Durumu and publication gate
- manual teacher assignment preview works after M32.4.2 `card_id` fix
- in-use alias-free room can be retired while preserving lesson day/time/teacher
- room becomes a live `Salonsuz` gap
- Program Durumu and publication gate both detect the room gap
- Program top-bar operational counters / card warning marker work

Final UX cleanup before merge:
- Program Durumu no longer repeats the same health issue as a second publication card
- health cards remain the actionable source (`Öğretmen ata`, `Salon ata`, etc.)
- publication gate suppresses overlapping health reasons and shows a compact note that those checks were also verified server-side
- publication-only blockers/warnings remain visible as separate cards

Final feature HEAD before journal commit: ca26df97d73815bf58c15e86f42bfad29447e464

Merge recommendation:
- branch is ahead of main and behind 0
- use fast-forward merge into main
- after merge, start next work from a fresh branch (M37)
## 26. M34–M36 merged to main — stable checkpoint

Final merge completed successfully.

Main checkpoint:
```
main: 9e1f2e738f73371fa7a47b776a50dc06f71de024
```

Verification before merge:
- 18/18 test files PASS
- 94/94 tests PASS
- TypeScript PASS
- Next.js production build PASS
- Supabase remote up to date
- M36 browser acceptance PASS

Merged scope:
- M34 global resource history
- Program card right-click / pool-drop removal
- M35 teacher departure with slot preservation
- M35.2 fast-path departure without synchronous candidate rebuild
- Program multi-resource filters with explicit VEYA / VE modes
- M36 live teacher/room operational-gap tracking
- M36 publication blockers for live resource gaps
- M36.1 manual resource-preview `card_id` fix
- M36.1 room departure / archival with slot preservation
- Program Durumu publication-card deduplication

Git merge:
```
feature: feat/management-m36-operational-gaps
strategy: fast-forward
main HEAD: 9e1f2e738f73371fa7a47b776a50dc06f71de024
```

Rule:
- treat this SHA as the stable rollback/checkpoint before M37
- do not reopen M34/M35/M36 unless a concrete regression is reproduced
- all new work starts from a fresh M37 branch
## 27. M37.0 operational queue — READY FOR ACCEPTANCE

Goal:
- turn M36 live resource-gap detection into a practical one-by-one operations workflow
- avoid repeating the same teacher/room gap in multiple Program Durumu sections
- let administrators work through missing resources in timetable order without returning to the summary screen each time

New model:
- `lib/managementOperations.ts`
- `buildManagementOperationalQueue(cards, stage)`
- queue task kinds:
  - `TEACHER`
  - `ROOM`
- tasks are sorted by day, period, subject, group
- a lesson missing both resources produces two explicit operational tasks
- OPTIONAL teacher / UNKNOWN room-strategy gaps are excluded

Program Durumu:
- new `Operasyon kuyruğu / Kaynağı tamamlanacak dersler` panel
- compact counters: `Öğretmensiz · N`, `Salonsuz · N`
- each row shows:
  - missing resource type
  - subject
  - group/class
  - day + period
  - preserved opposite resource (room or teacher)
  - `Aç ve ata` action
- teacher/room resource-gap blocker cards are removed from the lower generic blocker list so the same issue is shown only once in detail
- publication gate suppression from M36 remains unchanged

Program workflow:
- operational gap mode now has previous/next navigation in the top bar
- current position is shown as `x / n`
- navigation wraps through the current teacher-gap or room-gap set
- after a resource is assigned and the current card leaves the active gap filter, the next unresolved card opens automatically when one remains
- last resolved card closes normally when no matching gap remains

Regression coverage:
- new `tests/managementOperations.test.ts`
- queue teacher/room task generation
- deterministic day/period ordering
- dual-task generation for a lesson missing both resources
- OPTIONAL teacher / UNKNOWN room exclusion

Expected gate:
```
19 test files
98 tests
```

No migration in M37.0.

Implementation HEAD before journal commit: 4913316a011440d83071469a7f902222723b4435
Branch vs main: ahead 5, behind 0

Acceptance commands:
```bash
git pull --ff-only
npm test
npm run build
```

Browser smoke:
1. Program Durumu -> operation queue lists current teacher/room gaps once
2. `Aç ve ata` opens the exact card and correct Teacher/Room editor
3. top bar shows x/n navigation while the gap filter is active
4. previous/next moves across gaps and changes day automatically
5. assign resource -> resolved card leaves the gap list and next unresolved card opens
6. return to Program Durumu -> resolved item is gone from the operation queue
### M37.0 code gate — PASS

Final gate:
```
19 test files PASS
98 / 98 tests PASS
Next.js production build PASS (previous run; comparator-only follow-up did not affect build surface)
```

Regression fixed during gate:
- dual-gap queue item ordering is now explicit: TEACHER before ROOM for the same lesson/slot
- comparator no longer relies on alphabetical enum ordering

Checkpoint before journal commit: 33d41ee9a427649208cd070326495b15971b435b

Status:
- code gate PASS
- browser acceptance pending
### M37.1 management session resilience — READY FOR GATE

Browser feedback:
- M37 operational queue and Program Durumu layout behave as intended
- manual teacher assignment eventually failed with raw `JWT expired` after the management page remained open

Root cause:
- refresh-token support already existed in `managementAuth.ts`
- management page/component state could retain an old access token for a long-lived session
- authenticated data/RPC helpers used the supplied access token directly and did not resolve the newer stored session at request time

Fix:
- added `getFreshManagementAccessToken()` in `managementAuth.ts`
- expiry safety window increased to 2 minutes
- stored session is checked at every authenticated management request
- when expiring/expired, refresh token is used automatically
- concurrent requests share one in-flight refresh promise, preventing refresh-token fan-out/rotation races
- if localStorage already contains a newer token than React state, request uses the stored token
- server/test callers without browser storage retain their explicitly supplied token

Authenticated modules migrated to fresh-token resolution:
- managementBoard
- managementCommands
- managementCoursePlan
- managementOverview
- managementPublicationGate
- managementPublicationPreview
- managementResources
- managementSolver
- management access-context check

Logout intentionally remains best-effort with the session token and always clears local state.

Regression tests:
- valid stored token does not refresh
- three concurrent calls near expiry share exactly one refresh request and all receive the new access token

Expected next gate:
```
20 test files
100 tests
```

No migration in M37.1.

Implementation HEAD before journal commit: 02eb55fa3e17678b85c4185be8ee5558a6a7a2af

Required gate:
```bash
git pull --ff-only
npm test
npm run build
```

Browser acceptance:
1. keep/open management session and perform a normal teacher assignment
2. no raw `JWT expired` should surface
3. if the stored token is near expiry, request should refresh transparently and continue
4. queue navigation/auto-advance must remain unchanged
### M37.1 forced JWT-expiry browser acceptance — PASS

Manual browser acceptance:
- local stored session expiry was forced to ~5 seconds
- after waiting, user opened Operational Queue -> assignment flow
- `Etkiyi hesapla` completed without raw `JWT expired`
- automatic refresh path recovered transparently

Accepted:
- fresh-token resolution works in real browser flow
- concurrent refresh dedupe remains covered by automated tests
- M37.1 JWT resilience is closed unless a concrete regression is reproduced

Checkpoint before journal commit: f310f6a90b92a6750530e460b5f65a26bf6a2931
### M37 final acceptance — PASS / ready to merge

Final verification:
```
20 test files PASS
100 / 100 tests PASS
Next.js production build PASS
TypeScript PASS
forced JWT-expiry browser acceptance PASS
Operational Queue browser flow PASS
```

Accepted M37 scope:
- Program Durumu operational queue for teacher/room gaps
- exact-card `Aç ve ata` navigation
- sequential previous/next gap navigation with x/n indicator
- automatic advance after resolving a gap
- duplicate health/publication issue presentation reduced
- centralized management access-token refresh
- 2-minute expiry safety window
- concurrent refresh deduplication
- all authenticated management modules use fresh-token resolution
- raw `JWT expired` no longer surfaced in forced-expiry browser test

Feature HEAD before this journal commit: 20bf4df1acc5787486b3e6df02ff423cba01ac51
Branch vs main before close: ahead 21, behind 0

Merge recommendation:
- fast-forward M37 to main
- treat resulting main SHA as the stable M37 checkpoint
- start subsequent work from a fresh M38 branch

Do not reopen M37 unless a concrete regression is reproduced.
## 28. M37 merged to main — stable checkpoint

Final merge completed successfully.

Main checkpoint:
```
main: d3befd95f45855bb6c2887d360f06df6a67b9d8a
```

Verified before merge:
- 20/20 test files PASS
- 100/100 tests PASS
- Next.js production build PASS
- TypeScript PASS
- forced JWT-expiry browser acceptance PASS
- Operational Queue browser acceptance PASS

Merged scope:
- M37 operational queue
- exact-card `Aç ve ata` navigation
- sequential previous/next gap navigation
- automatic advance after resolving a gap
- centralized management access-token refresh
- 2-minute expiry safety window
- concurrent refresh deduplication
- fresh-token resolution across management authenticated modules

Git merge:
```
feature: feat/management-m37-operations
strategy: fast-forward
main HEAD: d3befd95f45855bb6c2887d360f06df6a67b9d8a
```

Rule:
- treat this SHA as stable rollback/checkpoint before M38
- do not reopen M37 unless a concrete regression is reproduced
- start all new work from a fresh M38 branch
## 29. M38.0 bulk operational assignments — READY FOR ACCEPTANCE

Goal:
- resolve multiple teacherless or roomless timetable gaps in one controlled operation
- reuse the existing placement-resource preview/apply authority instead of creating a new backend path
- preserve preview safety, conflicts, state-token freshness and global bundle history

Bulk operation model:
- Program Durumu / Operasyon Kuyruğu shows:
  - `Öğretmenleri toplu ata` when more than one teacher gap exists
  - `Salonları toplu ata` when more than one room gap exists
- bulk modal preselects all tasks of the chosen resource kind
- tasks can be included/excluded individually
- source selection uses active Course Plan teacher/room options
- one resource is assigned to all selected cards
- day/time and the opposite resource stay unchanged

Safety preview:
- calls existing `management_preview_placement_resource_change_v2` with `cardIds[]`
- shows selected count / affected card count / affected requirement count
- shows requirement-wide expansion when teacher continuity expands scope
- shows outside-planning-pool/manual selection count
- shows planning-pool expansion count if returned
- shows translated block reasons and up to five concrete conflicts
- `Toplu uygula` is disabled unless preview `canApply=true`
- any selection/resource change invalidates the previous state token and requires a new preview

Apply/history:
- calls existing `management_apply_placement_resource_change_v2`
- M32.4.2 policy layer remains authoritative
- M29 base apply tags all affected per-card MOVE transactions under one bundle root
- existing bundle-aware Undo/Redo therefore remains the history mechanism
- no new migration / RPC / database authority introduced

Refactors:
- `operationalQueueCardIds(queue, kind)` centralizes same-kind bulk selection
- resource-preview blocker translations centralized in `managementCommands.ts`
- Inspector and bulk modal reuse the same Turkish reason messages

Regression coverage:
- teacher bulk selection never includes room-gap-only tasks
- room bulk selection never includes teacher-gap-only tasks
- a dual-gap lesson appears once in each kind-specific bulk selection

Expected gate:
```
20 test files
102 tests
```

No migration in M38.0.

Implementation HEAD before journal commit: 485decfcaccee81a70c27086c228eb61f6785a36
Branch vs main: ahead 11, behind 0

Acceptance commands:
```bash
git pull --ff-only
npm test
npm run build
```

Browser smoke:
1. Program Durumu -> Operasyon Kuyruğu -> `Öğretmenleri toplu ata`
2. deselect/select several rows; choose an active teacher
3. `Etkiyi hesapla` shows affected scope and blocks conflicts safely
4. safe preview -> `Toplu uygula`; selected teacher gaps disappear after refresh
5. verify one Undo action restores the bulk assignment bundle
6. repeat same flow with `Salonları toplu ata` when 2+ room gaps are available
### M38.0 code gate — PASS

Codespaces verification:
```
20 test files PASS
102 / 102 tests PASS
Next.js production build PASS
TypeScript PASS
```

Status:
- bulk operational assignment code gate PASS
- no migration
- browser acceptance pending

Checkpoint before journal commit: c39277cfeb31701ffaa0f1e97edebb8ef165cb05
### M38.0 browser acceptance — PASS

Browser acceptance confirmed:
- bulk teacher assignment flow completed successfully
- selected cards were updated through the existing placement-resource authority
- resulting operation remained in global history
- a single `Geri Al` action restored the bulk assignment bundle
- screenshot confirmation shows the grouped Armoni operation restored with teacher/room context preserved

Accepted:
- bulk preview/apply path works in the real management UI
- bundle-root history semantics are preserved
- M38.0 teacher bulk operation is closed unless a concrete regression is reproduced

Room bulk flow remains the same code path with resource type ROOM; repeat browser smoke only when 2+ real room gaps are available.

Checkpoint before journal commit: 0c4e7243c3f3ba0ce02801250c5f97f97211e0ab
### M38.1 semantic history labels — READY FOR GATE

Browser feedback after M38.0 acceptance:
- bulk teacher assignment undo worked correctly as one bundle
- notification still described the operation as an Armoni `taşıması` because M29 history uses MOVE transactions internally

Goal:
- keep M29/M32 history and replay mechanics unchanged
- interpret placement-resource overrides semantically in UI history labels

Implementation:
- `ManagementCommandDescriptor` now carries placement-resource semantics:
  - `placementResourceType`
  - `placementResourceBeforeId`
  - `placementResourceId`
- history derivation recognizes M29.4 placement-resource overrides using existing payload metadata:
  - `engine_version = M29.4-placement-resource-override`
  - or `propagation_stop_reason = PLACEMENT_RESOURCE_OVERRIDE`
- compares `before.teacher_id/room_id` with `after.teacher_id/room_id` to distinguish TEACHER vs ROOM
- same semantics are recovered for REDO from the original root transaction

UI wording:
- missing -> resource becomes `öğretmen ataması` / `salon ataması`
- existing resource -> resource becomes `öğretmen değişikliği` / `salon değişikliği`
- bundle size > 1 adds `toplu`
- bulk resource history no longer shows one root card's day/time as if it described the entire bundle
- target teacher/room name is shown when available
- single-card resource changes keep day/time context
- history tooltip, busy-state text and completion notice all use the same semantic formatter

Examples:
- `9A + 9B + ... Armoni toplu öğretmen ataması · Test Öğretmen geri alındı.`
- `5A Matematik salon değişikliği · Pazartesi · 3. ders · B1 105A yeniden uygulandı.`

Regression coverage:
- bundled teacher placement override is recognized at UNDO head
- room placement override semantics survive into REDO descriptor

Expected gate:
```
20 test files
104 tests
```

No migration in M38.1.

Implementation HEAD before journal commit: 621757b26c2f130a8517d3869dff91c0e739cd88
Branch vs main: ahead 17, behind 0

Required gate:
```bash
git pull --ff-only
npm test
npm run build
```

Browser acceptance:
1. perform or redo a bulk teacher assignment
2. inspect Geri Al tooltip and then execute undo
3. wording should say `toplu öğretmen ataması/değişikliği`, never `taşıması`
4. undo completion notice should not claim one day/period for a multi-card bundle
5. Yinele should preserve the same semantic wording
### M38.1 code gate — PASS

Codespaces verification:
```
20 test files PASS
104 / 104 tests PASS
Next.js production build PASS
TypeScript PASS
```

Status:
- semantic history-label implementation PASS
- no migration
- browser acceptance pending

Checkpoint before journal commit: 4f936e9727534fae910a3fcde8d089c504297e8c
### M38.1 browser acceptance — PASS

Browser acceptance confirmed:
- bulk teacher assignment history tooltip now uses semantic wording
- observed tooltip: `... Armoni toplu öğretmen ataması · Test Öğretmen · 5 kayıt geri al`
- legacy `taşıması` wording is no longer shown for placement-resource override history
- multi-card bundle does not claim one shared day/period
- resource target name and affected-record count are visible

Accepted:
- placement-resource override semantics are recovered correctly at history UI level
- M29/M32 storage/replay mechanics remain unchanged
- M38.1 semantic history labels are closed unless a concrete regression is reproduced

Checkpoint before journal commit: 5467cd58f803ba26297df177c3a8c2e588d6bff9
## 30. M38 closure + main-roadmap realignment

Full diary and solver/policy contract reread completed after M38.1 browser acceptance.

### M38 status

**M38.0 CLOSED / PASS**
- bulk teacher/room operational assignment UI
- multi-select + one preview/state token
- existing M32.4.2/M29 authority reused
- bundle history preserved
- teacher bulk browser apply + single-step undo PASS

**M38.1 CLOSED / PASS**
- placement-resource override history is interpreted semantically
- bulk teacher assignment no longer appears as generic `taşıması`
- undo/redo descriptors preserve TEACHER/ROOM assignment semantics
- 20/20 test files, 104/104 tests PASS
- Next.js production build + TypeScript PASS
- browser tooltip acceptance PASS

No M38 migration was added.

### What the full reread shows

M34–M38 was a stabilization/operations leg after M33.4, not a replacement for the long-term solver roadmap:
- M34: resource mutations entered global undo/redo history
- M35: teacher departure + operational safety + multi-resource filtering
- M36: live teacher/room gaps + publication safety + room departure
- M37: operational queue + sequential repair + resilient JWT/session refresh
- M38: safe bulk repair + semantic history labels

These packages close the major day-to-day administration gaps uncovered after solver proposal apply became usable.

### Main roadmap state

Already completed from the original teacher-policy / solver-readiness order:
1. additive teacher assignment policy foundation
2. read-only policy audit
3. schema validation without destructive placement rewrite
4. Course Plan policy UI
5. ambiguous requirement classification / reconciliation path
6. policy-aware candidate generation
7. Placement Assistant forward-impact metrics
8. solver-readiness snapshot/checks
9. immutable in-memory feasibility prototype (M33.2)
10. explainable soft-objective local optimization (M33.3)
11. explicit human-reviewed atomic proposal apply + undo/redo (M33.4)

Still intentionally incomplete in the foundation contracts:

**A. Teacher planning/load inputs — first main-roadmap gap**
- `minimum_load`
- `target_load`
- `maximum_load`
- hard unavailable times
- legal/administrative leave
- later: preferred times / preferred free day / gap preferences
- without explicit load targets, `teacherLoadBalance` remains disabled by design

**B. Subject time preferences — second input gap**
- explicit subject/day/time preference data does not yet exist
- `subjectTimePreference` objective remains disabled by design

**C. Fine-grained manual authority / pins**
- current card-level `locked` flag is coarse
- target pin dimensions remain: `TIME`, `TEACHER`, `ROOM`, `STRUCTURE`
- full-auto must respect these independently

**D. Team teaching / role-aware staff**
- intentionally separate future problem
- current `placements.teacher_id` is one primary teacher
- accompanist / assistant / co-teacher should eventually use role-aware placement staff rather than overloading teacher assignment scope

### Return-to-main-roadmap decision

Do not open M38.2 unless a concrete M38 regression appears.

Next milestone should be **M39 — Teacher Planning Inputs / Load Foundation**, deliberately small and additive:
1. audit current teacher data and actual placed weekly loads
2. define schema/semantics for min/target/max load and hard unavailability
3. add read-only readiness/audit before changing solver behavior
4. expose inputs in Resources or Course Plan using the frozen management UI system
5. only after data is explicit, enable teacher-load metrics/objective work

Suggested later sequence:
- M39: teacher load + hard availability foundation
- M40: teacher load readiness/health + objective metric integration
- M41: subject time preference foundation
- M42: fine-grained pin model
- then revisit stronger/full-auto generation against immutable snapshot

Rule:
- preserve M33 solver snapshot/in-memory/no-trial-write architecture
- preserve human review + explicit commit
- do not add hidden defaults for institutional preferences
- every new optimization input must be explicit, auditable and explainable

M38 branch checkpoint before this diary commit: 602dd62b36c3ca8d7a4bfc06b458bdd7e2f0091e
## 31. M39.0 teacher load planning foundation — READY FOR CODE GATE

Main-roadmap return started after M38 closure.

Goal:
- create explicit term-scoped teacher load planning inputs before enabling any teacher-load optimizer objective
- audit real weekly teacher load from the current DRAFT without trial writes
- keep solver behavior unchanged in M39.0

### Data model

New migration:
`20261001133000_management_m39_0_teacher_load_foundation.sql`

New table:
`management_teacher_planning_inputs`

Scope:
- key: `(requirement_set_id, teacher_id)`
- `minimum_load`
- `target_load`
- `maximum_load`
- values are weekly timetable periods, not permanent teacher attributes
- every field is optional
- range: 0..60
- ordering guards: minimum <= target <= maximum when values are present
- all-null input deletes the planning row instead of storing fake zero defaults

New RPCs:
- `management_list_teacher_load_targets(revision_id)`
  - read-only VIEWER audit
  - actual load = sum of placed active card `duration_periods`
  - also returns placed block count and active requirement count
- `management_set_teacher_load_targets(...)`
  - EDITOR + DRAFT only
  - explicit validation
  - does not mutate placements/candidates/publication
  - returns `solverBehaviorChanged=false`

### Resources UI

Teacher inventory now shows:
- weekly actual load in periods/hours
- placed block count as secondary context
- `Min / Hedef / Maks` values
- count of teachers with load targets configured
- `Yük` action opens a compact planning editor

Editor semantics:
- fields may remain blank
- blank != zero
- current actual load is shown for comparison
- clearing all targets removes the planning input row
- UI states explicitly that optimizer behavior does not change yet

### Client contract

`ManagementTeacherResourceRow` gains:
- `actualLoadPeriods`
- `minimumLoad`
- `targetLoad`
- `maximumLoad`
- `loadConfigured`

New pure validator:
`validateManagementTeacherLoadTargets()`

Regression coverage:
- empty/partial targets accepted
- invalid min/target/max ordering rejected
- non-integer / outside 0..60 rejected

Expected gate after implementation:
```
21 test files
107 tests
```

Important architecture rule:
- M39.0 does NOT enable `teacherLoadBalance`
- M39.0 does NOT change solver snapshot/objective scoring
- M39.0 only establishes explicit institutional input + audit
- hard availability/unavailability is intentionally deferred to M39.1

Implementation HEAD before journal commit: b689dab1c9a7366075e7f7055520d16237cb8eac
Branch vs main: ahead 5, behind 0

Required code gate before DB push:
```bash
git pull --ff-only
npm test
npm run build
```

Only after code gate PASS:
```bash
npx supabase migration list | tail -25
npx supabase db push --dry-run
```

Dry-run expectation:
- only `20261001133000_management_m39_0_teacher_load_foundation.sql` should be pending
- do not push if any unexpected migration appears
### M39.0 code gate + migration dry-run — PASS

Codespaces verification:
```
21 test files PASS
107 / 107 tests PASS
Next.js production build PASS
TypeScript PASS
```

Supabase migration verification:
- migration list shows `20261001133000` local-only
- all prior migrations through `20261001101500` match remote
- `npx supabase db push --dry-run` reports exactly one pending migration:
  - `20261001133000_management_m39_0_teacher_load_foundation.sql`
- no unexpected migration detected

Status:
- code gate PASS
- migration dry-run PASS
- real DB push pending
- browser acceptance pending

Checkpoint before journal commit: aad72347a5c87d15cba7c840bf2cdfa8cc39556e
### M39.0 migration applied — PASS

Supabase verification:
- `20261001133000_management_m39_0_teacher_load_foundation.sql` applied successfully
- migration list now shows local/remote match for `20261001133000`
- no unexpected pending migration reported

Status:
- code gate PASS
- migration dry-run PASS
- real DB push PASS
- browser acceptance pending

Checkpoint before journal commit: bd16e1a4b81c0aacd20d4b3b7f326a52bdaab3ac
### M39.0 browser acceptance — PASS / CLOSED

Browser acceptance confirmed on Resources → Teachers:
- actual weekly load is shown as duration-period total, separate from block count
- observed example: `12 saat · 5 blok`
- unconfigured load targets show `Tanımsız`
- invalid ordering `20 / 18 / 24` is blocked in UI with `Minimum yük hedef yükten büyük olamaz.`
- clearing all three targets succeeds and returns row to `Tanımsız`
- valid `1 / 12 / 20` target set saves successfully and is reflected in the teacher row
- success message confirms program and publication are unchanged
- actual weekly load remains unchanged after planning-target edits

Final M39.0 status:
- 21/21 test files PASS
- 107/107 tests PASS
- Next.js production build PASS
- TypeScript PASS
- migration dry-run PASS
- `20261001133000` applied and local/remote match
- browser validation/edit/clear flow PASS

**M39.0 CLOSED / PASS**

Next:
- M39.1 hard teacher availability foundation
- keep load objective disabled until subsequent readiness/objective integration package

Checkpoint before journal commit: 85843c3d783b27aa40e6b387cee441e6f6763729
### M39.1 UI polish scope — user requested

Alongside hard teacher availability foundation, polish Resources → Teachers without redesign:
- improve table column balance after weekly-load fields were added
- make `Haftalık yük` and `Min / Hedef / Maks` hierarchy easier to scan
- reduce crowding in the right-side action group
- improve row spacing/alignment while preserving the normalized management UI system
- make configured vs undefined load targets visually clearer
- keep all existing functionality and accepted information architecture intact


## 32. M39.1 hard teacher availability — CLOSED / PASS

Date: 1 Oct 2026

Branch:
`feat/management-m39-teacher-planning-inputs`

Implementation checkpoint before diary close:
`8ac11517018e1047c50bef46fe558903c91198a9`

Delivered:
- term-scoped `management_teacher_unavailable_periods`
- hard candidate blocker `TEACHER_UNAVAILABLE`
- manual placement/resource preview block
- placement write guard
- solver snapshot `teacherUnavailablePeriods`
- solver hard rule `TEACHER_HARD_UNAVAILABLE`
- baseline audit for existing unavailable placements
- existing placements are never auto-moved by an availability edit

Applied migrations:
- `20261001143000_management_m39_1_teacher_hard_availability.sql`
- `20261001185000_management_m39_1_1_candidate_summary_ownership.sql`
- `20261001190000_management_m39_1_2_fast_availability_refresh.sql`

Regression 1 — solver baseline:
- initial test showed unavailable baseline could still be accepted
- root cause: `tryBaseline()` reached `canAssign()` without a final availability gate
- fix: hard availability is enforced inside `canAssign()`
- baseline, search and future assignment paths now share one last-line rule

Regression 2 — duplicate domain summary:
```
duplicate key value violates unique constraint
"schedule_card_domain_summaries_pkey"
```

Root cause:
- M39.1 availability summary trigger created a missing summary row
- this violated M32.5.1 ownership semantics

M39.1.1 fix:
- domain builders remain the only creators of missing summary rows
- availability summary trigger only updates summaries that already exist

Regression 3 — save timeout:
```
canceling statement due to statement timeout
```

Root cause:
- availability save touched all candidate rows for the teacher
- M32.5 expanded this into a same-requirement candidate refresh

M39.1.2 fix:
- refresh only candidates that:
  - overlap the new unavailable slots, or
  - already carry `TEACHER_UNAVAILABLE`
- availability-only refresh skips the M32.5 requirement-wide fan-out
- M39.1 and M22 row semantics remain active
- normal M32.5 behavior is unchanged outside this RPC

Remote migration parity confirmed through:
- `20261001143000`
- `20261001185000`
- `20261001190000`

Live browser acceptance:
- save of three unavailable periods succeeds
- UI shows `3 saat uygun değil`
- UI reports `1 mevcut blok çakışıyor`
- existing program remains unchanged
- manual teacher-change preview blocks the unavailable teacher
- visible reason: `Öğretmen bu ders saatinde uygun değil.`

Final gate:
```
Test Files  21 passed (21)
Tests       110 passed (110)
```

Build:
- Next.js 16.3.4 PASS
- TypeScript PASS
- PWA PASS
- static generation PASS
- `/yonetim` build PASS

**M39.1 CLOSED / PASS**

## 33. Partisyon branding and header polish

Official MSGSÜ logo kit is now the brand source.

Asset:
- `public/brand/msgsu-owl.svg`
- official blue `#06038d`

Accepted management header:
- official MSGSÜ owl
- vertical divider
- upper label `MSGSÜ İDK`
- product wordmark `P mark + artisyon`

UI acceptance:
- P and `artisyon` read as one wordmark
- no overlap/blob effect
- optical baseline alignment corrected
- active nav underline moved close to the menu label after header height increased
- audience filter icons `📚 / 🩰 / 🎶` enlarged without increasing the filter capsule height

Teacher-planning language was simplified:
- `Mevcut ders yükü`
- `Uygunluk kısıtları`
- `En az / Hedef / En fazla`
- internal engineering terms were removed from user-facing copy

Next roadmap:
- M40 teacher load readiness / health
- then objective metric integration
- no hidden institutional defaults
- M39.1 hard availability remains a structural constraint

Working method:
- assistant patches and commits through GitHub
- user validates with pull, tests, build, migration gates and browser smoke
- DB changes follow migration list → dry-run → exact pending check → real push → live smoke
- record regressions and checkpoint SHAs after PASS


## 34. M40 teacher load readiness/objective — IMPLEMENTATION READY

Implementation checkpoint before this diary commit:
`6c0899981dd92e00fa7da312576df073c0f9f13f`

New migration:
`20261001200000_management_m40_teacher_load_readiness_objective.sql`

M40 rules:
- no hidden teacher-load defaults
- relevant = ACTIVE teacher in active requirement pool or active DRAFT placement
- all relevant teachers need explicit `target_load` for load-balance readiness
- min/max are optional soft bands, never hard constraints
- unused/inactive teachers do not block readiness
- M39.1 hard availability remains structural

Objective:
```
target deviation = Σ abs(load - target)
range violation = Σ under-min + over-max
load metric = target deviation + range violation
```

Implemented:
- contextual DB load health
- load readiness in Resources
- M40 snapshot targets/readiness/baseline metrics
- generic objective validator supports `teacherLoadBalance`
- ACTIVE load profile is DB-gated by readiness
- in-memory weighted load metric
- load-only seed search
- result metric comparison
- Öncelikler load objective UI
- user-facing readiness guidance
- load-target edits now intentionally change optimizer readiness/behavior, while program/publication stay unchanged

Regression tests added:
- incomplete target readiness blocks load optimization
- complete targets allow load-only optimizer to rebalance a one-card eligible-pool fixture

Expected final code gate:
- 21 test files
- 112 tests
- production build PASS

Status:
**M40 implementation complete; test/build/DB validation pending.**

Required next gate:
```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
git rev-parse HEAD
npm test
npm run build
npx supabase migration list | tail -25
npx supabase db push --dry-run
```

Expected pending DB migration:
`20261001200000_management_m40_teacher_load_readiness_objective.sql`

Do not push any unexpected migration.

After dry-run PASS:
1. push M40
2. confirm local/remote parity
3. Resources → Teachers: verify ready/relevant counts and missing-target health
4. define targets for relevant teachers
5. Öncelikler: verify load-balance becomes selectable only when ready
6. run load-weighted option generation; verify load metric is reported and no trial write occurs
7. only explicit proposal confirmation may change placements
8. mark M40 CLOSED/PASS and update checkpoints


### M40 first validation gate result

At `b6009c56337736674715671684da9b319fc478ab`:
- tests: 21/21 files, 112/112 PASS
- build: compile PASS, TypeScript failed in `managementSolverProposal.test.ts` due stale M33.3 fixture type
- migration dry-run/push intentionally not reached

Fixture was updated for M40 result contract:
- engine `M40-v1`
- teacher load target/range metrics
- `teacherLoadBalance` score component

Re-run test/build before any DB push.


## 35. M40.1 teacher load defaults — implementation ready

Approved starting values:
- En az: 1
- Hedef: 10
- En fazla: 20

This is an explicit product decision and supersedes the earlier M40 assumption that no institutional defaults existed.

Implementation:
- shared frontend constant: `MANAGEMENT_TEACHER_LOAD_DEFAULTS`
- blank relevant teacher form starts at 1 / 10 / 20
- existing custom values remain untouched
- migration `20261001213000_management_m40_1_teacher_load_defaults.sql`
- migration inserts defaults only for relevant ACTIVE teachers with no existing planning row
- no UPDATE path; custom rows such as 3 / 10 / 20 are preserved

Expected current effect:
- the 51 missing teacher targets visible in M40 acceptance should be populated automatically if they are genuinely unconfigured rows
- after migration, Öncelikler → teacher load balance should become selectable when readiness reaches full coverage

Expected gate:
- 21 test files
- 113 tests
- build PASS
- dry-run shows only M40.1 migration
- then DB push + browser readiness smoke


### M40 acceptance diagnostic — hard readiness blocker visibility

During browser acceptance, Program Kontrolü showed:
- provisional rooms warning: 41 requirements, explicitly non-blocking
- hard readiness false, therefore Programı kontrol et disabled
- previous UI only showed a generic error and hid `readiness.hardBlockers`

Wrapper audit:
- M33.0.1 provisional-room correction is still in the wrapper chain
- `RESOURCE_MODE_UNKNOWN` is filtered out of hard blockers before M39.1/M40 wrappers
- therefore the 41 unknown rooms are not the cause of hard readiness false

UI diagnostic added:
- Program Kontrolü now renders each hard blocker with Turkish label + count
- no DB semantics changed
- next browser refresh should identify the actual blocker before any corrective migration is written


### 3 Oct — management load isolation

Observed browser failure:
`Load failed` caused the entire Program workbench to render empty because all
startup reads were coupled in one `Promise.all`.

Fix checkpoint:
`89c93c0b96b4deb221a87db5cf497dcfe0bebb98`

New invariant:
- startup reads are independent through `Promise.allSettled`
- one optional module failure no longer erases Program board data
- board failure itself clears board to avoid stale schedule display
- error banner names the failing subsystem
- Safari raw `Load failed` becomes a Turkish network/server connection message
- no DB migration

Next:
pull, test/build, reload browser and use the labeled error to identify any
remaining backend/network failure.


### 3 Oct — bounded startup fan-out

After subsystem isolation, Safari reported browser-level `Load failed` for
Genel özet, Program, Ders Planı, Kaynaklar and Yayın önizleme at the same time.

This pattern points to startup request saturation rather than one broken DB
contract.

Checkpoint:
`f5e95125aabe5f2b809c227f8f821432f2ddbdb1`

Startup order is now:
1. Program board alone
2. light group: overview + solver + publication gate
3. Course Plan
4. Resources
5. Publication Preview
6. Undo/Redo

Transient fetch/network failures are retried once after 300 ms.
HTTP/DB errors are not retried.

No migration.


## 36. Emergency rollback to M39.1 stable — 3 Oct 2026

M40/M40.1 acceptance produced management load and drag/drop regressions.
New feature work is stopped.

Target stable checkpoint:
`980b8487992c7a0ea1021143384eeb7e1b25a806`

Application rollback:
`b2670ace1705795e2c99f0a14e0a9e679cc64435`

All application source files changed after the target checkpoint were restored
from that exact tree. Compare now shows only docs + migration-history files
different from M39.1 stable.

DB rollback migration:
`20261003150000_management_rollback_m40_to_m39_1.sql`

Prepared commit:
`5b3ab1d0b5665dd390164027b8e4eb0aaa8dd817`

Important:
- do not remove applied M40/M40.1 migration files
- do not delete 1/10/20 teacher planning rows during emergency rollback
- restored M39.1 semantics treat load targets as planning-only, so preserved
  rows do not change solver/candidate/placement behavior

Next gate only:
```bash
git pull --ff-only
npm test
npm run build
npx supabase migration list | tail -25
npx supabase db push --dry-run
```

Dry-run must show only:
`20261003150000_management_rollback_m40_to_m39_1.sql`

Then push it, verify migration parity, and smoke:
Program load → drag/drop → undo → redo.

Do not resume M40 until this baseline is accepted.


## 37. Program interaction recovery — PASS

Accepted browser smoke in Firefox:
- drag/drop to another slot PASS
- remove to pool PASS
- undo PASS
- redo PASS

Accepted implementation checkpoint:
`290debd16199b141d73ac811f5bfea0286025194`

Network context:
- Safari still shows browser-level `Load failed` against Supabase
- Firefox works, but intermittent Supabase/Cloudflare 522 was observed
- CORS console messages accompanying 522 are secondary symptoms
- no write RPC receives automatic retry

Separate remaining issue:
`management_preview_candidate_forward_impacts` can return HTTP 500 in
Yerleştirme Asistanı. Treat it as an isolated follow-up; preserve the now
accepted Program interaction path.


### 8 Oct 2026 — Management Workspace local history gate CLOSED / PASS

Branch:
- `feat/management-workspace-v1`

Accepted implementation checkpoint:
- `523ac21b9e5e5f0838fc7524747def6f9e7b0018`

Scope verified:
- local operations use monotonic sequence numbers
- multi-step local Undo/Redo remains DB-history-independent
- new local edit clears redo history
- placement remove restores complete placement state
- requirement resource edits share the same local history
- resource inventory edits share the global local history
- teacher availability edits are local-history-native
- room profile edits are local-history-native
- locally created resources Undo/Redo as one operation
- structural bundles remain on the structural path and do not fall through to placement dispatch
- requirement time preferences participate in the same Undo/Redo chain

Validation gate:
- focused `tests/managementWorkspaceHistory.test.ts`: **12/12 PASS**
- full suite: **38/38 files, 270/270 tests PASS**
- production build: **PASS**
- TypeScript: **PASS**
- static generation: **9/9 PASS**
- `/yonetim`: build route PASS
- `git diff --check`: PASS
- working tree after gate: **CLEAN**

Status: **LOCAL HISTORY GATE CLOSED / PASS**

Contract reinforced:
- unsaved Management Workspace edits are owned by the local workspace history
- placement, resource, availability, room-profile, structure and time-preference edits must remain in one coherent local Undo/Redo chain
- DB persistence remains an explicit Save boundary
- legacy server history must not re-own workspace-native structural changes

Next active acceptance:
**browser end-to-end local workspace persistence boundary**
1. make several mixed local edits (placement + resource/input)
2. exercise multi-step Undo/Redo in the UI
3. confirm no DB persistence before Save
4. Save once and verify atomic persistence after reload
5. only then open the next objective-model expansion package (teacher-load balance / preferred day-time) from the stable workspace baseline


### 8 Oct 2026 — Mixed workspace persistence-boundary regression added — GATE PENDING

Implementation commit:
- `7232b9f0a2122d4be86b22f44a4ca43780586ea8` — test: cover mixed workspace persistence boundary

Coverage added:
- placement move + teacher availability + room profile share one local history
- three-step Undo restores the baseline so commit preparation returns no payload
- three-step Redo restores the same mixed local state
- commit preparation then produces one atomic workspace payload containing placement, teacher availability and room profile deltas
- no production logic or DB migration changed

Validation status:
- implementation committed
- focused/full tests and production build: **PENDING user/Codespaces gate**
- last verified checkpoint remains `523ac21b9e5e5f0838fc7524747def6f9e7b0018`


### 8 Oct 2026 — Mixed workspace persistence-boundary code gate CLOSED / PASS

Verified implementation checkpoint:
- `7232b9f0a2122d4be86b22f44a4ca43780586ea8` — test: cover mixed workspace persistence boundary

Codespaces validation:
- full suite: **38/38 files, 271/271 tests PASS**
- production build: **PASS**
- Next.js 16.3.4 / webpack: PASS
- TypeScript: **PASS**
- static generation: **9/9 PASS**
- `/yonetim`: build route PASS

Accepted regression contract:
- mixed local edits across placement + teacher availability + room profile share one local history chain
- multi-step Undo can restore baseline so commit preparation has no persistence payload
- multi-step Redo restores the mixed local state deterministically
- one Save boundary can serialize the resulting mixed deltas atomically

Status: **CODE GATE CLOSED / PASS**

Next acceptance boundary:
**real browser mixed-edit persistence test**
1. make one placement change
2. make one teacher availability change
3. make one room profile change
4. Undo all three and confirm UI returns to baseline
5. Redo all three and confirm UI restores the local state
6. before Save, reload/new session must not persist those local edits
7. repeat the mixed edits, Save once, reload and verify all persisted together

No DB migration was introduced by this package.


### 8 Oct 2026 — Undo/Redo history authority isolation fix — GATE PENDING

Observed browser defect:
- after local Management Workspace operations, global Undo/Redo could fall through to stale server history when the local stack became empty
- this exposed and could apply unrelated persisted MOVE/RESOURCE/STRUCTURE operations from earlier work instead of representing the current workspace session

Root cause:
- `canUseServerManagementHistoryDescriptor()` only suppressed server STRUCTURE history while workspace history existed
- non-STRUCTURE server descriptors remained eligible as a fallback

Fix:
- Management Workspace is now the single global history authority whenever a workspace is active
- all server Undo/Redo descriptors are suppressed while workspace history is available
- server history is eligible only before/without an active workspace
- when the local stack is empty, global Undo/Redo now correctly reports no local operation instead of falling through to unrelated server history

Implementation:
- `b37be8286b8c8b4bba905d234f99172d73b31f7c` — fix: keep workspace undo isolated from server history
- `2d6e5d2600c260e03c22de29bd52e4dfd8948a82` — test: enforce single workspace history authority

Validation status:
- focused/full tests and production build: **PENDING Codespaces gate**
- previous verified baseline remains `7232b9f0a2122d4be86b22f44a4ca43780586ea8`


### 8 Oct 2026 — Workspace-native subject time preferences v12 — IMPLEMENTATION READY / GATE PENDING

Goal:
- remove the last direct-DB exception from the Management Workspace editing model
- requirement preferred day/start-period edits must stay local until the main Save
- include those edits in the same atomic persistence boundary as placement/resource/structure changes

Observed architecture gap:
- `SET_REQUIREMENT_TIME_PREFERENCE` already participated in local Undo/Redo
- however the UI still called `management_set_requirement_time_preferences` immediately on edit, Undo and Redo
- therefore time preferences violated the workspace rule that Save is the persistence boundary

Implemented:
- requirement catalog now retains baseline preferred days/start periods after Course Plan hydration
- workspace diff now emits deterministic `requirementTimePreferenceChanges`
- time preference changes contribute to `hasChanges` and dirty requirement IDs
- atomic commit payload now includes `timePreferenceChanges`
- client commit target advanced from `management_commit_workspace_v11` to `management_commit_workspace_v12`
- Course Plan time preference edit is now local-only
- local Undo/Redo no longer writes time preferences directly to the database
- UI still projects the local preference state immediately to Course Plan / solver view

Migration prepared:
- `20261008135000_management_workspace_time_preferences.sql`
- new `management_commit_workspace_v12`
- validates original snapshot/baseline freshness
- stale-checks each preference change against its recorded before-state
- applies preference changes and delegates the existing v11 workspace commit in the same PostgreSQL transaction
- recomputes final snapshot hash after the complete transaction
- authenticated execute only; anon/public revoked

Implementation commits:
- `0f6d603d360fe8c28c71fc6ab4b2f1241f6d2bde` — feat: diff local time preferences in workspace
- `c5f67c3b32bafd8604c51ef31e16ddf23cab9c3b` — feat: include time preferences in workspace commit
- `e8de449cdd6e3fa8e8981c86fb215f9fbc459e1e` — fix: keep time preferences local until workspace save
- `4afe3892c50372db6ae89c529dc2ec14196d1a66` — feat: persist time preferences in workspace save
- `198efa52f0622147729b1847bd5afb0eb7061995` — test: cover atomic time preference save
- `97df7d1c21e48820173bcff64d715012905210a8` — chore: expose workspace time preference commit count

Validation status:
- focused/full tests: PENDING
- production build: PENDING
- migration list/dry-run: PENDING
- DB push: NOT DONE
- browser acceptance: PENDING

Required gate:
1. pull branch and run focused workspace history/commit/history-policy tests
2. run full suite + production build + diff check
3. inspect migration parity
4. dry-run must show only the expected new v12 migration before any DB push
5. after DB push, verify: edit time preference -> Undo/Redo local -> reload before Save loses edit -> edit again -> one Save -> reload persists it


### 8 Oct 2026 — Migration history parity repaired in repo — DB UNTOUCHED

Observed during v12 dry-run:
- remote DB contained four applied 7 Oct migration versions missing from the branch
- branch contained the same four migration names/content under later timestamps, so Supabase CLI refused dry-run

Remote applied versions/names:
- `20261007114637 management_workspace_bundle_limit_72`
- `20261007115654 management_workspace_fast_move_bundle`
- `20261007120302 management_workspace_fast_validator_provisional_resources`
- `20261007122918 management_solver_teacher_load_objective`

Incorrect branch timestamps that were not applied remotely:
- `20261007145500`
- `20261007150500`
- `20261007151000`
- `20261007153000`

Resolution:
- preserved migration SQL content
- renamed the four repo migrations to the exact remote-applied version numbers
- did **not** run `supabase migration repair`
- did **not** run `supabase db push`
- remote database remains unchanged

Repo alignment commits:
- `540d64ca2bd57cf4e7d6af51bc76dea886d57b55` / `93b3783ef56d1775173e151b1b4a5ddc6d9f8414`
- `e4f0b5f33f17439ad800d88787c91047daa08520` / `a4a39edf307ab1230ae303d14be93e4b3824d324`
- `c6711157e3678bc8ff24bae4542f065904542986` / `736a812a5e53d427f14bfaf2b6b3b0400c0397e3`
- `457098b7c66a11d422e5e9b7d7941521aa3cf71c` / `332ff8ef089d0afbade3c3aaa92143b1c273604e`

Next gate:
- `supabase migration list` must show 7 Oct parity
- `supabase db push --dry-run` must show only `20261008135000_management_workspace_time_preferences.sql`


### 8 Oct 2026 — Workspace v12 time preferences browser acceptance PASS

Browser acceptance:
- requirement day/start-period preference edit stays local before Save
- local Undo restores the previous preference
- local Redo reapplies it
- Save persists the preference through the workspace v12 atomic boundary
- reload after Save preserves the preference

Observed UI-only defect during acceptance:
- Save success notice did not include `changedTimePreferenceCount`
- time-preference-only saves therefore displayed an incorrect zero/empty change summary even though persistence succeeded

Fix:
- `884b17a6bb92ea497f2bf2fdc2c8b7161c6d763f` — ux: count time preferences in save notice
- Save notice now reports e.g. `1 zaman tercihi değişikliği kaydedildi.`

Status:
- **WORKSPACE V12 TIME PREFERENCES BROWSER ACCEPTANCE CLOSED / PASS**
- remaining action: normal test/build gate for the UI-only notice patch


### 8 Oct 2026 — Workspace v12 save progress count UI acceptance PASS

Browser acceptance confirmed:
- save progress overlay now counts all workspace delta categories, including time preferences
- time-preference-only save correctly shows `1 değişiklik kontrol edilip kaydediliyor.`
- success notice count and progress overlay are now consistent with workspace v12 persistence

Implementation:
- `4d77abaf3898bfdaff3e2f41eac07d8cd0104362` — ux: count all workspace deltas in save progress

Status:
- **WORKSPACE V12 TIME PREFERENCES + SAVE COUNT UI CLOSED / PASS**
- next active phase: objective model expansion continuation


### 8 Oct 2026 — Blocking overlay reserved for startup only

UX simplification:
- startup loading keeps the full blocking `ManagementBusyOverlay`
- ordinary in-app operations no longer render a second full-screen blocking overlay
- ongoing Save/Undo/Redo/calculation activity continues through the existing top activity band
- `commandBusy` still protects action buttons and write concurrency
- completion/error feedback continues through toast/notice

Implementation:
- `0d4375bb16e1ac7da72b46f0b18ba77046a043d8` — ux: reserve blocking overlay for startup only

Resulting feedback hierarchy:
- startup -> blocking overlay
- normal ongoing operation -> top activity band
- result -> toast/notice

Status: implementation complete; normal test/build gate remains.


### 8 Oct 2026 — Objective inputs projected into local solver workspace — GATE PENDING

Finding:
- solver scoring/search already supports `teacherLoadBalance` and `subjectTimePreference`
- however the local solver adapter projected only placements
- unsaved teacher load targets and subject time preferences therefore did not affect solver proposals until after the main Save

Implemented:
- local teacher planning targets project into `preview.teacherLoadTargets`
- local requirement day/start-period preferences project into `preview.subjectTimePreferences`
- local solver fingerprint/hash now includes placements + teacher load targets + time preferences
- solver proposals can therefore react to unsaved objective inputs in the current Management Workspace session
- server objective inputs are preserved until matching local inputs are hydrated
- explicit local empty values correctly clear server objective inputs

Implementation commits:
- `cc18544640fb25608065efa89c69ee5bafd9fdd6` — feat: project local objective inputs into solver snapshot
- `5a99ee1b6ac28855fb1ba0836f116a7d0e23d67a` — test: cover local objective input projection
- `6f93d2811e0303f77e4aa706308bd6e6603435fd` — fix: preserve server objective inputs until local hydration
- `3228e69f3e322019048796ea2460dba6317c1ba1` — test: cover objective input hydration fallback

Validation status:
- focused adapter tests: PENDING
- full suite: PENDING
- production build: PENDING

Next gate:
- `tests/managementSolverWorkspaceAdapter.test.ts`
- full test suite
- production build
