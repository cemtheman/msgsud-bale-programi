# MSGSÜ Ders Programı — Devam Handoff

> Not: Dosya adı tarihsel olarak `MAC_CONTINUATION.md` kaldı. Aktif çalışma ortamı GitHub Codespaces'tir.

Tarih: 30 Eylül 2026

## 1. Aktif çalışma ortamı

- Ortam: **GitHub Codespaces**
- Çalışma dizini: `/workspaces/msgsud-bale-programi`
- Shell: Linux/bash
- Branch: `main`
- Komut biçimi: `npm`, `npx`
- Kullanıcı yeni ortam bildirmedikçe Codespaces geçerli kabul edilir

Başlangıç:

```bash
cd /workspaces/msgsud-bale-programi
git fetch origin
git switch main
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
