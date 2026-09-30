# MSGSÜ Ders Programı — Mac Devam Handoff

Tarih: 30 Eylül 2026

Bu dosya güncel continuation özetidir. Ayrıntılı tarihçe için AGENTS.md okunur.

## 1. Güvenilir çalışma noktası

Repository: cemtheman/msgsud-bale-programi
Production branch: main

Son implementation checkpoint:

```
1383862c95c75a11ba4d8dbf5995c8545d1b74ce
polish: clarify priorities are not used by program check yet
```

Yeni M33.2.1 migration:

```
8c0fd2723c4842f04c3035f08c01626cf2793bfe
fix: align Friday K Bale consecutive lesson rule
```

QA:

```
5a310106a4848446100259a8dd01b6dace1f8c11
test: add Friday K Bale rule verification
```

Journal:

```
0f74328f502ed432dd356eb8d48b1f5cf5d5fa3a
docs: record M33.2.1 Friday rule fix
```

## 2. Kalan M33.2 işi

Cuma ek dersi rule source çözüldü.

Kanıt:
- M2.2 bootstrap max_consecutive_periods=NULL.
- M25 clean bootstrap 5A Cuma K. Bale'yi Friday period 7 + 8, E. Gemalmaz olarak authoritative runtime adjustment şeklinde kuruyor.
- Kalıcı ürün kuralı: 5A Cuma K. Bale 13:50'den itibaren 2 ders · E. Gemalmaz.
- Current max_consecutive_periods=1 bu programla çelişen stale structural constraint.

Migration yalnız exact target requirement için max_consecutive_periods 1 -> 2 yapar.
Yerleşim/öğretmen/salon değişmez.

Dosya:
```
supabase/migrations/20260930110000_management_m33_2_1_friday_k_bale_consecutive_rule.sql
```

## 3. Uygulama sonrası QA

Çalıştır:
```
docs/sql/m33_2_1_friday_k_bale_rule_qa.sql
```

Beklenen:
- max_consecutive_periods=2
- card_count=2
- Friday periods 7 and 8
- teacher_names={E. Gemalmaz}
- qa_status=PASS

Ardından production Öncelikler > Programı kontrol et:
- Cuma ek dersi kural uyarısı yok
- changed-card diagnostic kaybolmalı
- baseline feasible ise 300/300 reuse beklenir

## 4. Öncelikler ekranı

Programı kontrol et M33.2 feasibility'dir ve öncelik ağırlıklarını henüz kullanmaz.
UI artık bunu açıkça söylüyor.
M33.3'te öncelikler gerçek çözüm seçimini etkileyecek.

## 5. Sonraki paket

M33.2 migration + QA + browser rerun + Vitest PASS sonrası M33.3:
- objective metric vector
- weighted solution search
- mevcut programa fark analizi
- açıklanabilir alternatif çözüm karşılaştırması
- otomatik apply yok

## 6. Değişmez çalışma yöntemi

- Applied migration geriye dönük düzenlenmez.
- DB değişikliğinde yeni additive migration.
- Force push yok.
- Runtime/browser kanıtı varsayımdan üstündür.
- M32.4.2: planning pool != manual placement override.
- M22: UNKNOWN != ABSENT != UNAVAILABLE.
- Solver hesapları snapshot + in-memory yapılır.
