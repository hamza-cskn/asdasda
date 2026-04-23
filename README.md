# ASYS Monorepo

ASYS (Apartman Site Yonetim Sistemi) monorepo:
- `apps/api`: Express + Prisma + PostgreSQL
- `apps/web`: React + Vite
- `apps/worker`: periyodik domain joblari
- `packages/contracts`: Zod tabanli API kontratlari

## Teknoloji
- Frontend: React
- Backend: Node.js + Express
- DB: PostgreSQL + Prisma
- Auth: JWT + bcrypt
- Operasyon: Docker Compose

## Hizli Baslangic

Gereksinimler:
- Node.js 22+
- npm 10+
- Docker

Kurulum:

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run typecheck
npm test
npm run build
```

Lokal calistirma:

```bash
npm run dev -w @asys/api
npm run dev -w @asys/web
npm run dev -w @asys/worker
```

URL'ler:
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

## Docker ile Calistirma

```bash
docker compose up -d --build
docker compose ps
```

Durdurma:

```bash
docker compose down
```

## Demo Hesaplar

Seed sonrasi:
- `admin@asys.local` / `AsysDemo1234!`
- `resident@asys.local` / `AsysDemo1234!`
- `security@asys.local` / `AsysDemo1234!`

## API Gruplari

Sabit route gruplari:
- `/api/auth`
- `/api/users`
- `/api/announcements`
- `/api/maintenance-requests`
- `/api/dues`
- `/api/payments`
- `/api/notifications`
- `/api/common-areas`
- `/api/reservations`
- `/api/parking-spots`
- `/api/visitor-vehicles`
- `/api/dashboard`
- `/api/reports`

## Domain Notlari

- Auth:
  - 24 saat JWT
  - bcrypt hash
  - forgot/reset sifre
  - 5 basarisiz deneme -> 15 dk lock
  - HTTPS zorlugu (`ENFORCE_HTTPS`)
- Aidat/Odeme:
  - aylik aidat uretimi
  - vade 5. gun
  - %2 gecikme faizi
  - kredi karti/havale simulated odeme
  - makbuz PDF
- Bakim:
  - kategori/aciklama/foto talebi
  - durum takibi + rating
  - 3 acik talep limiti
  - acil taleplerde 2 saat hedefi
- Rezervasyon:
  - gym / meeting room / child park
  - cakisma engeli
  - 23:00-07:00 yasagi
  - borcluya rezervasyon engeli
  - 2 saat kala iptal kilidi
- Park:
  - daireye park atama (max 2)
  - engelli alan korumasi
  - ziyaretci giris/cikis
  - 4 saat sure asimi alarmi
- Dashboard/Rapor:
  - KPI ozetleri
  - borclu daire verisi
  - 12 aylik tahsilat trend verisi
  - aylik tahsilat PDF
- Worker:
  - aylik aidat uretimi
  - overdue reminder/escalation
  - 7 gun maintenance escalation
  - visitor overstay alarmi
  - backup rotation (30 gun)
  - 6 ay user retention cleanup

## Ortam Degiskenleri

Temel degiskenler:
- `DATABASE_URL`
- `JWT_SECRET`
- `WEB_ORIGIN`
- `ENFORCE_HTTPS`
- `MAINTENANCE_MODE`
- `WORKER_TICK_MS`

Bakim modu:
- `MAINTENANCE_MODE=true` oldugunda API, yalnizca 02:00-03:00 araliginda planli bakim cevabi doner.

## Dokumanlar

- Gereksinim karsiligi: `REQUIREMENT_COVERAGE.md`
- Devir notlari: `HANDOVER.md`
- Kisa baglam: `CONTEXT.md`
- Operasyonel kabul protokolu: `workflow-assets/operational-acceptance-protocol.md`

## Kabul ve Kanit Komutlari

Zorunlu dogrulama:

```bash
npm run db:migrate
npm run db:seed
npm run typecheck
npm test
npm run build
npm run test:e2e
```

NFR olcum kanitlari (API ve Web ayakta iken):

```bash
npm run nfr:check
npm run nfr:check:scale
```

NFR artefaktlari:
- `artifacts/nfr/latest.json`
- `artifacts/nfr/scale-500.json` (varsayilan)
