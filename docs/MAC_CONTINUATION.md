# MSGSÜ Ders Programı — Mac Devam Handoff

Tarih: 30 Eylül 2026

Bu dosya güncel continuation özetidir. Ayrıntılı tarihçe için önce AGENTS.md okunur.

## 1. Güvenilir çalışma noktası

Repository: cemtheman/msgsud-bale-programi
Production branch: main

Son implementation checkpoint:

```
831c3e4bd582d9d5509e6b69f0927f9511fa7489
feat: show feasibility baseline diagnostics
```

Son journal checkpoint:

```
841e1fd525014236ccbc0b3cf5c99f67830ae851
docs: record M33.1 browser pass and M33.2 deviation
```

Yeni oturumda SHA'ya reset atma; remote HEAD'i çek.

## 2. Başlangıç

```bash
cd ~/msgsud-bale-programi
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD
git status --short
cat AGENTS.md
cat docs/MAC_CONTINUATION.md
```

Working tree temiz değilse kaynağı anlaşılmadan reset/restore yapma.

## 3. Tamamlanan foundation

M32.5 CLOSED/PASS:
- candidate-domain persisted REQUIRED teacher policy
- forward-impact preview
- M32.5.1 summary ownership race düzeltmesi
- rollback QA PASS

M33 CLOSED/PASS:
- deterministic immutable solver snapshot
- current placements baseline/change-cost input
- candidate assessments global solver truth olarak snapshot dışında
- M22 UNKNOWN room semantics PROVISIONAL_UNKNOWN
- hardInputReady=true
- snapshot rollback QA PASS

M33.1 DB/UX contract:
- human-readable objective profiles
- supported: changeCost, preferredTeacherContinuity, teacherIdleGaps, roomStability
- unsupported/disabled: teacherLoadBalance, subjectTimePreference
- DRAFT / explicit ACTIVE
- rollback-only objective profile QA PASS
- browser smoke PASS
- M33.1 CLOSED

## 4. M33.2 — in-memory feasibility

Yeni motor: lib/managementSolverPrototype.ts

Temel ilke:
- snapshot bir kez okunur
- tüm deneme/hesap geçici bellekte yapılır
- Supabase placement/candidate/history üzerinde solver deneme yazması yok
- feasibility sonucu otomatik apply edilmez
- objective profile henüz solver seçimi için kullanılmaz

Hard rules:
- time/day bounds
- lunch crossing yok
- teacher overlap yok
- canonical room overlap yok
- participant group CONTAINS/OVERLAPS
- locked baseline pin
- REQUIREMENT+REQUIRED teacher continuity
- minDistinctDays
- maxBlocksPerDay
- maxConsecutivePeriods

M22 UNKNOWN room:
- hard blocker değil
- null room provisional kabul edilebilir
- baseline room evidence kart bazında tutulabilir
- planning room policy inference yapılmaz

Production build:
- ca8c2129 core build PASS
- 7b24a138 UI build PASS

Production browser feasibility çalıştı: FEASIBLE, 294/300 baseline reuse, 395 search node, 54 provisional room card. Beklenen 300/300 olmadığı için baseline deviation diagnostic eklendi. M33.2 CLOSED değildir.

## 5. M33.2 baseline diagnostic — sıradaki iş

1. Production sayfasını yenile.
2. Yönetim > Optimizasyon.
3. Uygunluğu kontrol et.
4. Sonuç altındaki amber diagnostic panelini incele.
5. Değişen 6 kartın sınıf/ders/blok, önceki yerleşim, bellekteki çözüm ve reason code bilgilerini kaydet.
6. Özellikle BASELINE_TEACHER_OUTSIDE_PLANNING_POOL / BASELINE_ROOM_OUTSIDE_PLANNING_POOL varsa M29/M32.4.2 semantiğiyle karşılaştır.
7. Gerçek conflict reason code varsa mevcut baseline rule violation olarak ele al.
8. Kanıt olmadan solver policy değiştirme.

## 6. Test

Node ortamı varsa:

```bash
npm test
npm run build
```

Özellikle lib/managementSolverPrototype.test.ts PASS beklenir.

## 7. Sonraki paket

M33.1 browser smoke + M33.2 Vitest/browser PASS sonrası:

M33.3 explainable objective optimization:
- objective metric vector
- baseline delta
- weighted optimization search
- açıklanabilir alternatif çözüm karşılaştırması
- otomatik apply yok
- human review ve explicit commit daha sonraki ayrı aşama

## 8. Değişmez çalışma yöntemi

- Applied migration geriye dönük düzenlenmez.
- DB değişikliğinde migration list + dry-run + yalnız beklenen migration apply.
- Remote mutation öncesi HEAD doğrulanır.
- Force push yok.
- Küçük, tek amaçlı commitler.
- Runtime/browser kanıtı varsayımdan üstündür.
- M32.4.2: planning pool != manual placement override.
- M22: UNKNOWN != ABSENT != UNAVAILABLE.
- Solver hesapları mümkün olduğunca snapshot + in-memory yapılır.
