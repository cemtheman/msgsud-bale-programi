# MSGSÜ Ders Programı — Devam Handoff

> Not: Dosya adı tarihsel olarak `MAC_CONTINUATION.md` kaldı. Aktif çalışma ortamı GitHub Codespaces'tir.

Tarih: 30 Eylül 2026

## 1. Aktif çalışma ortamı

- Ortam: **GitHub Codespaces**
- Çalışma dizini: `/workspaces/msgsud-bale-programi`
- Shell: Linux/bash
- Branch: `main`
- Komut biçimi: `npm`, `npx`; `npm.cmd` / `npx.cmd` kullanılmaz
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

Production browser smoke:
- Kurallara uygun bir yerleşim bulundu
- mevcut program bütün zorunlu kuralları karşılıyor
- yerinde kalan ders: **300/300**
- salonu henüz belirlenmeyen ders: 54
- Cuma ek dersi uyarısı yok
- changed-card diagnostic yok
- program mutation yok

Codespaces test:

```
Test Files 14 passed (14)
Tests 72 passed (72)
```

Production build:

```
Next.js 16.3.4
Compiled successfully
TypeScript PASS
/yonetim PASS
```

Journal checkpoint:

```
d6f384bddce2267700905694171701f986d95ccb
docs: close M33.2 and open M33.3
```

## 3. M33.3 — aktif paket

Amaç: Öncelikler'deki değerler artık çözüm seçimini gerçekten etkileyecek.

Supported objective metrics:
- changeCost
- preferredTeacherContinuityBreaks
- teacherIdleGapPeriods
- roomStabilityBreaks

M33.3-v0 sözleşmesi:
- current program baseline/referans
- yalnız hard-feasible çözümler karşılaştırılır
- active preference weights weighted score'a girer
- weight=0 objective çözüm seçimini etkilemez
- deterministic in-memory local improvement
- locked cards değişmez
- browser freeze guard
- baseline/proposed metric delta açıklanır
- program otomatik apply edilmez
- Supabase placement mutation yok

300 kart üzerinde full combinatorial exhaustive search yapılmayacak.

İlk implementation:
1. metric vector evaluator
2. weighted score
3. feasible baseline üzerinde one-card neighborhood
4. best-improvement loop
5. explanation/result contract
6. unit tests
7. Öncelikler UI'da `Tercihlere göre seçenek oluştur`

## 4. Değişmez kurallar

- Applied migration geriye dönük düzenlenmez
- DB değişikliğinde yeni additive migration
- Force push yok
- Runtime/browser kanıtı varsayımdan üstündür
- M32.4.2: planning pool != manual placement override
- M22: UNKNOWN != ABSENT != UNAVAILABLE
- Solver hesapları snapshot + in-memory
- kullanıcı yeni ortam bildirmedikçe Codespaces/Linux komutları
