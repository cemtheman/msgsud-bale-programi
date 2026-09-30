# M33.4 — Program Önerisini İnceleme ve Açık Onayla Uygulama

Tarih: 30 Eylül 2026

## Amaç

M33.3 read-only optimizer tarafından üretilen bir önerinin kullanıcı tarafından açıkça incelenip onaylandıktan sonra taslak programa uygulanabilmesi.

Otomatik uygulama yoktur.

## Mevcut altyapı yeniden kullanılır

Yeni placement transaction motoru yazılmaz.

M33.4-v0 şu mevcut parçaları kullanır:
- M33 snapshotHash / baselineHash
- M33.3 in-memory proposal
- M26.8 management_move_card_bundle
- M26 bundle root tagging
- mevcut ManagementCommandState
- management_undo_bundle / management_redo_bundle

M33.3-v0 en fazla 8 accepted move üretir.
M26.8 bundle contract 1..24 karttır.
Bu nedenle mevcut sınır M33.4-v0 için yeterlidir.

## Apply hazırlığı

Yeni client helper:
`lib/managementSolverProposal.ts`

Bir proposal uygulanabilir sayılmak için:
1. status = IMPROVED
2. fresh solver workspace alınabilmeli
3. fresh snapshotHash = proposal snapshotHash
4. fresh baselineHash = proposal baselineHash
5. final proposal içinde baseline=false olan en az 1 placement olmalı
6. changed placement sayısı <= 24

Hash uyuşmazsa proposal stale kabul edilir ve uygulanmaz.

Kullanıcı mesajı:
`Program, öneri oluşturulduktan sonra değişti. Seçeneği yeniden hesaplayın.`

## Atomic apply

Freshness PASS sonrası changed final placements:
- cardId
- dayOfWeek
- startPeriod
- teacherId
- roomId

olarak mevcut `moveManagementCardBundle` fonksiyonuna verilir.

M26.8 server davranışı:
- cards same revision
- candidate-domain bundle refresh
- exact candidate VALID + complete validation
- NULL-safe M22 provisional teacher/room identity
- all changed members one DB transaction
- bundle root/history tagging
- candidate-domain refresh
- propagation finalization

Bir member geçersizse transaction tamamı rollback olur.

## Undo/redo

Yeni history sistemi yazılmaz.

Successful solver proposal apply normal M26 bundle MOVE history’sine girer.

UI refresh sonrasında mevcut root command state:
- Geri Al
- Yinele
ile çalışır.

Success mesajı:
`N ders için önerilen yerleşim uygulandı. İşlem Geri Al ile tek adımda geri alınabilir.`

## UI freeze uyumu

Öncelikler page layout değiştirilmez.

M33.4 yalnız mevcut Program seçeneği sonucunun altına minimal action ekler:
- Öneriyi uygula
- explicit confirmation
- Vazgeç
- Onayla ve uygula

Confirmation:
- kaç dersin yerleşiminin değişeceği
- apply öncesi current-state check yapılacağı
- single operation olarak kaydedileceği

## Test

`lib/managementSolverProposal.test.ts`

Kapsam:
1. changed final placement'lar bundle input'a dönüşür
2. baselineHash stale ise blocked
3. snapshotHash stale ise blocked
4. UNCHANGED / no changed placement apply edilemez

## M33.4-v0 acceptance

1. Codespaces npm test PASS
2. Codespaces npm run build PASS
3. production proposal üret
4. Öneriyi uygula -> confirmation görünür
5. Vazgeç -> schedule unchanged
6. tekrar Onayla ve uygula
7. fresh hash guard PASS
8. bundle apply success
9. Program ekranında önerilen yerleşimler görünür
10. Geri Al tek adımda proposal'ın tamamını geri alır
11. Yinele tek adımda tekrar uygular
12. stale test: proposal üret -> başka bir program değişikliği yap -> eski proposal apply reddedilir
13. apply sonrası Programı kontrol et -> 300/300 / hard-rule valid beklenir

M33.4-v0 bu browser + undo/redo + stale + post-apply hard-check kanıtları olmadan CLOSED sayılmaz.
