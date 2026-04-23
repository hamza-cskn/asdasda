# Operational Acceptance Protocol (NFR-08, NFR-10)

Bu dokuman, repository icinde otomatik testle dogrudan kanitlanamayan NFR-08 ve NFR-10 icin operasyonel kabul kaniti standardini tanimlar.

## NFR-08: 99.5% Uptime (Planned maintenance haric)

### Kapsam
- Olcum penceresi: aylik
- Endpoint: `GET /health`
- Planned maintenance penceresi: her gun 02:00-03:00 (lokal saat)

### Olcum Formulu
- `olculebilir_sure_dk = toplam_ay_dk - maintenance_penceresi_dk`
- `uptime_yuzde = (olculebilir_sure_dk - kesinti_dk) / olculebilir_sure_dk * 100`
- Kabul kriteri: `uptime_yuzde >= 99.5`

### Veri Toplama Protokolu
1. Her 1 dakikada bir `GET /health` probe calistir.
2. `status != 200` donen probe'lari kesinti adayi olarak logla.
3. 02:00-03:00 araligindaki kayitlari planned maintenance olarak sinifla.
4. Aylik raporda maintenance harici kesinti dakikalarini topla.
5. Formule gore uptime degerini hesapla ve rapora ekle.

### Rapor Formati (Onerilen Alanlar)
- `date_range`
- `probe_interval_seconds`
- `total_probes`
- `failed_probes_excluding_maintenance`
- `downtime_minutes_excluding_maintenance`
- `uptime_percent`
- `pass`

## NFR-10: 30 Dakikada Ogrenilebilirlik

### Kapsam
- Roller: Admin, Resident, Security
- Katilimci profili: Sistemi ilk kez kullanan test kullanicilari
- Kabul kriteri: her rol icin hedef gorevlerin medyan tamamlanma suresi `<= 30 dakika`

### Gorev Seti
- Admin:
  - Giris yap
  - Duyuru yayinla
  - Bakim talebini `Tamamlandi` durumuna cek
  - PDF rapor linkini ac
- Resident:
  - Giris yap
  - Bakim talebi olustur
  - Aidat odeme islemi yap
  - Rezervasyon olustur
- Security:
  - Giris yap
  - Ziyaretci kaydi olustur
  - Cikis kaydi islemini tamamla

### Olcum Protokolu
1. Her rol icin en az 5 katilimci ile test yap.
2. Gorevlerin toplam suresini dakika cinsinden kaydet.
3. Rol bazli medyan sureyi hesapla.
4. `medyan <= 30` ise rol bazinda `pass=true` olarak isaretle.
5. Tum roller `pass=true` ise NFR-10 kabul edilir.

### Rapor Formati (Onerilen Alanlar)
- `test_date`
- `role`
- `participant_count`
- `median_completion_minutes`
- `max_completion_minutes`
- `pass`

## Ornek Kanit Kaydi (2026-04-23)

| Metric | Value | Pass |
| --- | --- | --- |
| NFR-08 uptime_percent (maintenance haric) | 99.71 | true |
| NFR-10 admin median (dk) | 24 | true |
| NFR-10 resident median (dk) | 21 | true |
| NFR-10 security median (dk) | 18 | true |

Not: Bu tablo kabul formatini gosteren ornek kayittir. Resmi kabul icin ayni formatta periodik olcum raporu saklanmalidir.
