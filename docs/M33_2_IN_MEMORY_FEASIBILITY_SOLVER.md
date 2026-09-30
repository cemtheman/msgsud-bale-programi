# M33.2 — In-Memory Feasibility Solver Prototype

Tarih: 30 Eylül 2026

## Amaç

M33.2, M33/M33.1 deterministic solver snapshot'ını tüketen ilk solver katmanıdır.
Tek sorusu: snapshot'taki hard kurallar altında bütün kartlar için geçerli bir yerleşim var mı?

M33.2 optimizasyon yapmaz, “en iyi” çözüm seçmez ve programı değiştirmez.

## Mimari sınır

Solver çalışma sırasında Supabase tabloları üzerinde deneme-yanılma yapmaz:

1. management_preview_solver_snapshot ile structural snapshot alınır.
2. Snapshot bir kez istemci belleğine alınır.
3. Öğretmen/salon/grup/time domain'leri bellekte türetilir.
4. Feasibility araması yalnız geçici veri yapıları üzerinde yapılır.
5. Sonuç yalnız kullanıcıya gösterilir.
6. Placement / requirement / candidate / history tablolarına yazma yapılmaz.

Bu, yönetim hesaplarının sürekli DB read/write döngüsü yerine geçici matris/bellek üzerinde yapılması yönündeki kalıcı mimari tercihtir.

## Kaynak dosyalar

- lib/managementSolver.ts — snapshot structural input contract.
- lib/managementSolverPrototype.ts — pure in-memory feasibility motoru.
- lib/managementSolverPrototype.test.ts — hard-constraint testleri.
- components/management/ManagementSolverWorkspacePanel.tsx — read-only Uygunluğu kontrol et UI'sı.

## M33.2-v0 hard constraint kapsamı

- gün/periyot sınırları
- öğle arasını geçen blok yok
- öğretmen overlap yok
- fiziksel/kanonik salon overlap yok
- participant-group overlap yok
- locked card baseline pin
- REQUIREMENT + REQUIRED teacher continuity
- minDistinctDays
- maxBlocksPerDay
- maxConsecutivePeriods

Instructional group conflict semantiği M4 ile aynıdır: aynı set, transitif CONTAINS, descendant kesişimi veya explicit OVERLAPS conflict'tir; yalnız sibling olmak conflict değildir.

## Planning pool / manual override

M32.4.2 sözleşmesi korunur. course_requirement_teachers otomatik planning/solver pool'dur. Unlocked kartlarda solver bu havuzu kullanır; manual override planning pool'a sessizce eklenmez. Locked kart active baseline kaynağını pin olarak koruyabilir.

## UNKNOWN salon semantiği

M22/M33.0.1 invariantı korunur: UNKNOWN != ABSENT != UNAVAILABLE.
resourceMode=UNKNOWN hard blocker değildir. Salon bilinmiyorsa roomId=null provisional çözüm mümkündür; mevcut baseline room evidence aday olarak korunabilir ama bundan FIXED/ELIGIBLE_POOL kuralı türetilmez.

## Baseline fast path

Tüm kartlar yerleşmişse motor önce baseline'ı doğrudan hard-rule validator'dan geçirir. Baseline feasible ise domain expansion/backtracking yapmaz; visitedNodeCount=0 ve baselineWasFeasible=true döner.

Güncel 300-card production snapshot için ilk smoke test özellikle bu yolu doğrulamalıdır.

## Search

Baseline feasible değilse structural domain'ler bellekte üretilir; locked kartlar ve ardından en küçük domain'li kartlar önce çözülür. Baseline candidate önce denenir. Deterministic depth-first backtracking yapılır.

Guard'lar: default search node limiti 100000, card candidate limiti 5000. Limit aşımı SEARCH_LIMIT'tir; INFEASIBLE anlamına gelmez.

## Kalıcı sonuç invariantları

- writesPerformed=false
- objectiveProfileUsed=false
- UI açıkça “Program değişmedi · yazma işlemi yok” gösterir.

## Test kapsamı

1. tamamen yerleşmiş feasible baseline → zero-search fast path
2. CONTAINS participant conflict → alternatif in-memory placement
3. UNKNOWN room → provisional/null room feasibility
4. REQUIREMENT+REQUIRED teacher continuity
5. locked card + missing baseline → INFEASIBLE

## M33.2 kabul kriteri

1. Next/TypeScript production build PASS
2. Vitest M33.2 tests PASS
3. production Optimizasyon ekranında read-only feasibility butonu görünür
4. güncel 300-card snapshot üzerinde sonuç alınır
5. beklenen ilk sonuç: FEASIBLE, baselineWasFeasible=true, visitedNodeCount=0, baselineReuseCount=300
6. program placement state'i değişmez

M33.2 kapandıktan sonra M33.3: objective metric vector + baseline delta + açıklanabilir optimizasyon. M33.3 de doğrudan apply yapmayacaktır; human review / explicit commit ayrı sözleşmedir.
