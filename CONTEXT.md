# Context

Project: ASYS

## Stack
- API: Express + Prisma + PostgreSQL + JWT + bcrypt + Zod
- Web: React + Vite + React Router
- Worker: periodic domain jobs via Node runtime
- Contracts: shared Zod schemas in `packages/contracts`

## Runtime
- Compose services: `db`, `api`, `web`, `worker`
- Ports: `web=3000`, `api=3001`, `db=5432`
- Demo-safe integrations:
  - email -> `email_outbox`
  - payment -> simulated adapter
  - notifications -> in-app feed

## Durable Artifacts
- `workflow-assets/asys-srs-brief.md`
- `workflow-assets/asys-acceptance-matrix.json`
- `REQUIREMENT_COVERAGE.md`
- `README.md`
- `HANDOVER.md`
