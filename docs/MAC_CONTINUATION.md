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

