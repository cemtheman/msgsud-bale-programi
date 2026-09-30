# MSGSÜ Ders Programı — Devam Handoff

> Not: Dosya adı tarihsel olarak `MAC_CONTINUATION.md` kaldı. Aktif çalışma ortamı artık Mac değil, GitHub Codespaces'tir.

Tarih: 30 Eylül 2026

Bu dosya güncel continuation özetidir. Ayrıntılı tarihçe için önce `AGENTS.md` okunur.

## 1. Aktif çalışma ortamı

- Ortam: **GitHub Codespaces**
- Çalışma dizini: `/workspaces/msgsud-bale-programi`
- Shell: Linux/bash
- Branch: `main`
- Komut biçimi: `npm`, `npx`; **`npm.cmd` / `npx.cmd` kullanılmaz**
- Kullanıcı yeni bir ortam değişikliği bildirmedikçe Codespaces geçerli kabul edilir.
- Kullanıcı ortam değişikliğini bildirdiğinde AGENTS.md ve bu handoff aynı oturumda güncellenir.

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

Working tree temiz değilse kaynağı anlaşılmadan reset/restore yapma.

## 2. Güncel checkpoint

Son workflow/journal checkpoint:

```
38ceab822e9c988464dff09fb9a2753ab58bc60c
docs: persist Codespaces workflow and M33.2.1 QA pass
```

M33.2.1 hotfix:

```
9cf4df58ca647785352fd5147e5ef165e8ad1b64
fix: avoid uuid aggregate in M33.2.1 migration
```

Program kontrolü açıklaması:

```
1383862c95c75a11ba4d8dbf5995c8545d1b74ce
polish: clarify priorities are not used by program check yet
```

## 3. M33.2.1 durumu — PASS

Migration uygulandı.

QA sonucu:

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

Doğrulananlar:
- 5A Cuma K. Bale peş peşe ders sınırı artık 2
- iki adet 1 saatlik kart korunmuş
- Cuma 7 ve 8. ders korunmuş
- E. Gemalmaz korunmuş
- placement / teacher / room state'i bozulmamış

## 4. M33.2 kapanış adımları

Production'da:

1. Yönetim > Öncelikler
2. `Programı kontrol et`
3. Cuma ek dersi uyarısı artık görünmemeli
4. ideal beklenen sonuç: mevcut program hard-rule açısından doğrudan geçerli
5. ideal smoke: `300/300` yerinde kalan ders
6. programda kalıcı yerleşim değişikliği olmamalı

Codespaces'te:

```bash
cd /workspaces/msgsud-bale-programi
git pull --ff-only
npm test
npm run build
```

Özellikle `lib/managementSolverPrototype.test.ts` PASS beklenir.

M33.2 browser + Vitest PASS sonrası **CLOSED**.

## 5. Öncelikler ekranı

Şu an `Programı kontrol et` yalnız zorunlu kuralları kontrol eder.

Öncelik seviyeleri:
- mevcut programı koruma
- aynı öğretmeni koruma
- öğretmen boşluklarını azaltma
- aynı dersi aynı salonda tutma

henüz M33.2 sonucunu değiştirmez.

UI bunu açıkça söylüyor.

## 6. Sonraki paket — M33.3

M33.2 CLOSED sonrası:

- objective metric vector
- ağırlıklı çözüm araması
- farklı öncelik ayarlarının gerçekten farklı çözüm üretmesi
- mevcut programa fark analizi
- açıklanabilir alternatif çözüm karşılaştırması
- otomatik apply yok
- human review / explicit commit ayrı aşama

## 7. Değişmez kurallar

- Applied migration geriye dönük düzenlenmez.
- DB değişikliğinde yeni additive migration kullanılır.
- Force push yok.
- Runtime/browser kanıtı varsayımdan üstündür.
- M32.4.2: planning pool != manual placement override.
- M22: UNKNOWN != ABSENT != UNAVAILABLE.
- Solver hesapları snapshot + in-memory yapılır.
- Kullanıcı yeni ortam bildirmedikçe Codespaces/Linux komutları kullanılır.
