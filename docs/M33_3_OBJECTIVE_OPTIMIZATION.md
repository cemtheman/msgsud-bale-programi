# M33.3 — Önceliklere Göre Program Seçeneği

Tarih: 30 Eylül 2026

## Amaç

M33.3, M33.2'nin hard-rule feasibility katmanının üzerine kurulan ilk soft-objective optimizasyon katmanıdır.

Kullanıcı Öncelikler ekranında verdiği ağırlıklarla, mevcut programa yakın hard-geçerli alternatifler arasından daha uygun bir seçenek arayabilir.

Bu paket programı otomatik uygulamaz.

## Desteklenen tercihler

- Mevcut programı mümkün olduğunca koru
- Aynı öğretmeni mümkün olduğunca koru
- Öğretmen boşluklarını azalt
- Aynı dersi mümkün olduğunca aynı salonda tut

Henüz desteklenmeyen:
- öğretmen yük dengesi
- ders-saat tercihleri

## Ölçü vektörü

Her çözüm için dört sayı hesaplanır:

- `changeCost`
  - baseline'a göre değişen gün, başlangıç saati, öğretmen ve salon kararlarının sayısı
- `preferredTeacherContinuityBreaks`
  - BLOCK + PREFERRED öğretmen devamlılığı tanımlı derslerde kullanılan ek öğretmen sayısı
- `teacherIdleGapPeriods`
  - öğretmenin aynı gündeki ilk ve son dersi arasında boş kalan ders saatleri
- `roomStabilityBreaks`
  - aynı requirement için kullanılan ek salon sayısı

Baseline için changeCost daima 0'dır.

## Ağırlıklı puan

Her metric card count ile normalize edilir:

`normalized = rawValue / cardCount`

Katkı:

`contribution = normalized * weight`

Toplam puan, desteklenen dört tercihin katkılarının toplamıdır.

Daha düşük puan daha tercih edilir.

Ağırlık 0 ise o metric çözüm seçimini etkilemez.

Bu v0 sözleşmesinde bir değişen karar ile bir boş ders saati aynı normalize birim üzerinden karşılaştırılır. Bu sayede eşit ağırlıklarda tek bir değişiklik, tek bir boşluk iyileştirmesiyle yaklaşık denk maliyettedir.

## Arama yöntemi

300 kart üzerinde exhaustive combinatorial search yapılmaz.

M33.3-v0:
1. M33.2 ile doğrulanmış feasible baseline'dan başlar.
2. Locked kartları değiştirmez.
3. Her unlocked kart için structural domain'den yakın adaylar oluşturur.
4. Candidate'lar mevcut placement'a gün/saat/kaynak mesafesine göre sıralanır.
5. Her move hard constraints ile yeniden doğrulanır.
6. En yüksek objective iyileştirmeyi sağlayan move kabul edilir.
7. Deterministic best-improvement loop tekrarlanır.
8. İyileştirme kalmadığında durur.

Default guard:
- en fazla 8 accepted iteration
- kart başına en fazla 24 neighborhood candidate
- structural domain generation kart başına en fazla 400 candidate

Bu bir **local improvement** motorudur; global optimum garantisi vermez.

## M22 UNKNOWN salon koruması

Requirement resourceMode=UNKNOWN iken mevcut baseline'da gerçek bir salon kanıtı varsa optimizasyon bu kanıtı sırf soft score iyileştirmek için `null` salona düşürmez.

UNKNOWN salon provisional olabilir; mevcut kanıt silinmez.

## Manual override

M32.4.2 semantiği korunur.

Mevcut active manual teacher/room override baseline candidate olarak kalır.

Alternatif otomatik kaynaklar planning pool'dan gelir.

Optimizer manuel override'ı yalnız hard-feasible ve objective score gerçekten iyileşiyorsa öneri olarak değiştirebilir; kendiliğinden apply etmez.

## UI

Normal kullanıcı akışı iki ayrı işlemdir:

### Programı kontrol et
Yalnız zorunlu kuralları sınar.
Öncelikleri kullanmaz.

### Bu tercihlerle seçenek oluştur
Ekrandaki aktif/yerel öncelik ağırlıklarını doğrudan kullanır.
Ayarları önce kaydetmek zorunlu değildir.

Sonuç:
- daha uygun seçenek bulundu / mevcut program korunuyor / blocked
- değişen karar sayısı
- öğretmen devamlılığı farkı
- öğretmen boşlukları farkı
- salon istikrarı farkı
- değişen derslerin mevcut ve önerilen yerleşimleri

En fazla ilk 12 değişen ders doğrudan listelenir.

## Kalıcı güvenlik

- `writesPerformed=false`
- placement update yok
- Supabase trial-and-error write yok
- snapshot + in-memory
- öneri otomatik apply edilmez

## Test contract

`lib/managementObjectiveOptimizer.test.ts`

Kapsam:
1. yalnız teacherIdleGaps açıkken boşluk azaltan move seçilir
2. changeCost ve teacherIdleGaps eşit ağırlıktaysa eşit tradeoff için baseline korunur
3. yalnız roomStability açıkken aynı requirement salon değişimi azaltılır
4. supported preference yoksa optimization BLOCKED

## Kabul kriteri

M33.3-v0 PASS için:
1. Codespaces `npm test`
2. Codespaces `npm run build`
3. production Öncelikler ekranında yeni buton görünür
4. farklı preference kombinasyonları en az bir kontrollü senaryoda farklı öneri/UNCHANGED sonucu üretir
5. hiçbir run placement state'ini değiştirmez
6. browser responsive kalır
