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
