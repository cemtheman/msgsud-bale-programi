# MSGSÜ Ders Programı — Mac Devam Handoff

Tarih: 30 Eylül 2026

Bu dosya güncel continuation özetidir. Ayrıntılı tarihçe için AGENTS.md okunur.

## 1. Güvenilir çalışma noktası

Repository: cemtheman/msgsud-bale-programi
Production branch: main

Son implementation checkpoint:

```
a581a0eeef306125916a64a0b5b155483a91dc60
polish: simplify priorities navigation messages
```

Son yardım/UI checkpoint:

```
a6d991a98f4097a143eb6e19c1372b5f65635c35
polish: rewrite priorities help in plain Turkish
```

Son journal checkpoint:

```
76acb5d7de4a34b339cc2e93d2a398984ba3babb
docs: record M33.2 rule mismatch and plain-language UI
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

## 3. Tamamlananlar

- M32.5 CLOSED/PASS.
- M33 snapshot foundation CLOSED/PASS.
- M33.1 objective/preference setup CLOSED/PASS.
- M33.2 in-memory feasibility production'da çalışıyor.
- Manual teacher/room override planning-pool false positive düzeltildi.
- Solver hesapları snapshot + in-memory; programı otomatik mutate etmiyor.

## 4. M33.2 kalan tek gerçek konu

Production diagnostic artık şu uyuşmazlığı kesin gösteriyor:

- STANDARD · 5A BALLET · Cuma ek dersi · K. Bale
- 1. bölüm: Cuma 7. ders · E. Gemalmaz
- 2. bölüm: Cuma 8. ders · E. Gemalmaz
- requirement maxConsecutivePeriods = 1
- iki bölüm peş peşe olduğundan her iki kart BASELINE_MAX_CONSECUTIVE_PERIODS uyarısı alıyor

Bu nedenle current schedule ile structural requirement kuralı çelişiyor.
Solver bu noktada beklenen şekilde davranıyor.

Kanıt olmadan maxConsecutivePeriods değerini değiştirme.
Önce bu 1 değerinin nereden geldiğini ve iş kuralının gerçekten ne olması gerektiğini belirle.

## 5. Plain-language UI

Production'a gönderilen sade dil:
- nav Optimizasyon -> Öncelikler
- Hedef profilleri -> Kayıtlı ayarlar
- Profil adı -> Ayar adı
- hedef -> tercih
- Program uygunluk denetimi -> Program kontrolü
- button -> Programı kontrol et
- search-node metriği normal UI'dan kaldırıldı
- Blok -> bölüm
- STANDARD prefix diagnostic display'de gizlenir
- BALLET/MUSIC/SECTION display-only Türkçeleştirilir
- teknik snapshot/baseline/provisional/solver anlatımı kullanıcı yüzünden çıkarıldı

Commits:
```
ec12dbbbb3d9dfca26b1253168e5f581ebf8980b
a581a0eeef306125916a64a0b5b155483a91dc60
a6d991a98f4097a143eb6e19c1372b5f65635c35
```

Üçü de Vercel build PASS.

## 6. Sıradaki işler

1. Production refresh ile yeni Öncelikler ekranı browser smoke.
2. Cuma ek dersi maxConsecutivePeriods=1 kaynağını belirle.
3. Intended rule 2 ise additive migration veya yönetim UI edit yolu ile düzelt.
4. Intended rule 1 ise programdaki Cuma 7+8 yerleşimi gerçek kural ihlalidir; programı düzelt.
5. M33.2 Vitest çalıştır.
6. M33.2 CLOSED sonrası M33.3 explainable objective optimization.

## 7. Değişmez çalışma yöntemi

- Applied migration geriye dönük düzenlenmez.
- DB değişikliğinde migration list + dry-run + yalnız beklenen migration apply.
- Force push yok.
- Runtime/browser kanıtı varsayımdan üstündür.
- M32.4.2: planning pool != manual placement override.
- M22: UNKNOWN != ABSENT != UNAVAILABLE.
- Solver hesapları snapshot + in-memory yapılır.
