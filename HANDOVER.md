# Handover

## Teslim Ozeti

ASYS monorepo, SRS ana modulleri icin API + Web + Worker katmaninda calisir hale getirildi:
- Auth, users/apartments, announcements, maintenance
- Dues, payments, notifications
- Common areas, reservations
- Parking spots, visitor vehicles
- Dashboard + monthly report PDF
- Worker otomasyonlari (dues/reminder/escalation/visitor/backup/retention)

Kontratlar `packages/contracts` icinde genisletildi ve API route gruplari sabitlendi.

## Bu Teslimde Ozel Tamamlananlar

- Prisma:
  - `notifications` + `audit_logs` aktif kullanima alindi
  - `deactivated_at` eklendi (6 ay retention akisi)
- Maintenance:
  - Foto lokal kayit (`/uploads/maintenance`)
- PDF:
  - odeme makbuzu
  - aylik aidat tahsilat raporu
- Sertlestirme:
  - HTTPS zorlamasi
  - lockout
  - malicious payload engelleme
  - maintenance mode penceresi (`02:00-03:00`)

## Kabul Komutlari (Son Durum)

- `npm run db:migrate` -> gecti
- `npm run db:seed` -> gecti
- `npm run typecheck` -> gecti
- `npm test` -> gecti
- `npm run build` -> gecti
- `npm run test:e2e` -> gecti
- `npm run nfr:check` -> gecti
- `npm run nfr:check:scale` -> gecti

## Bilinen Acik Noktalar

- Kritik kabul acigi yok.
- NFR-08 ve NFR-10 icin operasyonel kabul protokolu: `workflow-assets/operational-acceptance-protocol.md`.
- NFR artefakt ciktilari: `artifacts/nfr/latest.json`, `artifacts/nfr/scale-500.json`.

Detayli satir bazli karsiliklar icin: `REQUIREMENT_COVERAGE.md`.
