# MSGSÜ Ders Programı — Mac Devam Handoff

Tarih: 26 Eylül 2026

Bu dosya yeni sohbet oturumunda projeyi yeniden keşfetmeden kaldığımız yerden devam etmek içindir.

## 1. Güvenilir durum

Repository:

```
https://github.com/cemtheman/msgsud-bale-programi.git
```

Production branch:

```
main
```

M29 implementation production checkpoint:

```
ff2654c3dfbe354f2535a88d6b187a5bdf1ec8be
fix: stabilize placement resource overrides
```

Bu checkpoint hem `main` hem `feat/management-m20-placement-recovery` üzerine promote edildi.

26 Eylül kapanışında ayrıca dokümantasyon günlüğü güncellendi; bu nedenle yeni oturumda **hard-code edilmiş SHA'ya reset atma**. Önce remote HEAD'i çek.

## 2. Yeni oturum başlangıcı

Mac Terminal:

```bash
cd ~/msgsud-bale-programi
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD
git status --short
```

Beklenti:

- branch: `main`
- working tree: CLEAN
- HEAD: remote `main` güncel HEAD'i

Ardından mutlaka:

```bash
cat AGENTS.md
cat docs/MAC_CONTINUATION.md
```

## 3. Son tamamlanan iş — M29.1–M29.5

M29 resource edit akışı tamamlandı ve production/browser acceptance geçti.

Kalıcı mimari karar:

- Yerleşimde öğretmen/salon değişikliği, ders planı kaynak havuzunu değiştirmez.
- `course_requirement_teachers` ve `course_requirement_rooms` otomatik genişletilmez.
- `teacher_mode` / `resource_mode` placement override yüzünden değiştirilmez.
- Gün/saat aynı kalırken yalnız placement teacher/room kaynağı değiştirilebilir.
- Preview aktiflik, slot conflict ve gerekli güvenlik kontrollerini yapar.
- MOVE history korunur.
- Geri Al / Yinele çalışır.
- Override redo candidate havuz üyeliğine bağlı değildir.
- Ayrıntılar panelinde plan öğretmeni/salonu ile gerçek placement aynı anda gösterilmez.
- Kullanıcıya gösterilen öğretmen/salon için tek güncel kaynak gerçek `Yerleşim` kartıdır.
- `Ders Planı Kaynakları` kutusu ayrıntılar ekranından kaldırıldı.

Migrations:

```
20260926113000_management_m29_1_resource_preview_card_id_fix.sql
20260926121500_management_m29_2_remove_redundant_pre_move_refresh.sql
20260926123000_management_m29_3_direct_resource_bundle_apply.sql
20260926124500_management_m29_4_placement_resource_override.sql
20260926130000_management_m29_5_override_redo.sql
```

M29.1–M29.5 uygulanmış migration'lardır. **Geriye dönük düzenleme yapma.** Yeni DB davranışı gerekiyorsa yeni timestamp'li migration yaz.

## 4. Acceptance sonucu

Production'da doğrulananlar:

- Öğretmen değişikliği çalışıyor.
- Salon değişikliği çalışıyor.
- Öğretmen havuzunda bulunmayan öğretmene placement override yapılabiliyor.
- Önceki statement timeout problemi kritik apply akışından kaldırıldı.
- Geri Al çalışıyor.
- Yinele çalışıyor.
- Ayrıntılar panelindeki eski plan/placement öğretmen tutarsızlığı kaldırıldı.
- Kullanıcı M29 akışını "çözdük" diyerek kabul etti.

M29'u yeni oturumda yeniden açma; yalnız yeni bir regression kanıtı varsa geri dön.

## 5. Bilinen takip konusu

M29.1–M29.3 testleri sırasında eski davranış bazı derslerin `course_requirement_teachers` havuzuna deneysel/yanlış öğretmenler eklemiş olabilir.

Özellikle Ders Planı / Öğretmen havuzu konusu yeniden ele alınırsa:

1. Önce mevcut veriyi teşhis et.
2. Hangi kayıtların gerçekten ders planı kuralı, hangilerinin M29 test yan ürünü olduğunu ayır.
3. Körlemesine DELETE yapma.
4. Temizlik gerekiyorsa yeni, denetlenebilir migration / yönetim işlemi tasarla.

Öğretmen havuzu ekranının ürün anlamı ayrıca yeniden değerlendirilebilir; placement override ile aynı kavram değildir.

## 6. Çalışma yöntemi

Kalıcı çalışma sözleşmesi:

- Önce mevcut remote HEAD ve çalışma ağacını doğrula.
- Proje tarihçesini baştan keşfetme; önce `AGENTS.md` oku.
- Focused diagnostic → minimum düzeltme.
- Applied migration geriye dönük değiştirilmez.
- DB değişikliğinde:
  - `npm run build`
  - `npx supabase migration list`
  - `npx supabase db push --dry-run`
  - yalnız beklenen migration varsa `npx supabase db push`
- Force push yapma.
- Production promotion öncesi remote branch HEAD'i yeniden doğrula.
- Oturum sonunda `AGENTS.md` ve bu handoff dosyasını güncelle.
- Terminal komutlarında sade fenced code kullan; code fence içine metadata/id ekleme.

## 7. Node / build

Temiz kurulum gerekiyorsa:

```bash
npm ci
npm run build
```

26 Eylül son doğrulamasında:

- Next.js 16.3.4 build PASS
- TypeScript PASS
- static generation PASS

## 8. Sonraki oturum — karar verilmiş yol haritası

Yeni oturumun görevi M29'u tekrar düzeltmek değil. M29 ancak yeni bir regression kanıtı varsa yeniden açılır.

Kullanıcıyla sıradaki çalışma sırası kararlaştırıldı:

1. **Öğretmen havuzu read-only veri teşhisi**
   - M29.1–M29.3 test yan ürünü olabilecek `course_requirement_teachers` kayıtlarını tespit et.
   - Gerçek Ders Planı kuralı ile deneysel kaydı ayır.
   - Körlemesine silme yapma; önce kanıt üret.
2. **Otomatik / yarı otomatik yerleştirme**
   - Mevcut candidate/conflict altyapısını kullan.
   - En kısıtlı kartları önce ele alan “solitaire” yaklaşımını geliştir.
3. **Müfredat / zorunlu ders saat denetimi**
   - M23 curriculum compliance altyapısını yönetim uyarılarına dönüştür.
4. **Dönem yaşam döngüsü**
   - 1. dönem arşivleme, 2. dönem oluşturma, şablon/kopya ve DRAFT/PUBLISHED/ARCHIVED akışı.
5. **Yönetim Programı son UX turu**
   - Kompaktlık, bilgi yoğunluğu ve sağ panel sadeleştirmesi.
6. **Yayın akışı**
   - Yönetim çizelgesinden gerçek öğrenci/öğretmen programına kontrollü publish.

### Şimdi başlanacak iş

İlk implementation paketi **öğretmen havuzu read-only veri teşhisidir**.

Bu teşhis tamamlanmadan otomatik yerleştirme için yeni veri-mutating davranış ekleme.
