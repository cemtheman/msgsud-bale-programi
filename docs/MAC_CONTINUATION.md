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

## 2. M33.2 — CLOSED / PASS

Production:
- mevcut program hard-rule valid
- 300/300 yerinde kalan ders
- Cuma ek dersi warning yok
- 54 UNKNOWN/provisional salon kartı blocker değil

Codespaces:
- 14/14 test files PASS
- 72/72 tests PASS
- production build PASS

## 3. M33.3-v0 — implementation hazır, acceptance pending

Core:
```
b14ca08089a47e0a4bc268107c0afe98b9884b33
feat: add weighted in-memory objective optimizer
```

Tests:
```
f5f20f06881cd8b5ca86bb157a12e106caf6aef9
test: cover weighted objective optimization
```

UI:
```
00525899ec3e519ee7f356d949f327cfbd89958a
feat: expose preference-driven program option preview
```

Sidebar language:
```
507ca5a5c493b6b3f6ad0b86207f02b201b69c32
polish: finish priorities sidebar terminology
```

Contract:
```
51024660122838a3f45e6c0b3c93c0cfabf59688
docs: define M33.3 preference optimization contract
```

Journal:
```
4151c3d1c1db263fd0abed4cef7adb5f7960b312
docs: checkpoint M33.3 objective optimization
```

## 4. M33.3 davranışı

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

## 5. Sıradaki acceptance

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
