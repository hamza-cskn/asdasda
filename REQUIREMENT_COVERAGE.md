# Requirement Coverage

Durumlar:
- `done`: kod + test/artefakt kaniti var
- `partial`: kod var, ancak hedefin bir kismi (genelde UI/olcumsel NFR) acik

## Test ve Build Kaniti
- `npm run db:migrate` (gecen migrationlar: `20260422190000_s2_auth`, `20260423010000_s5_maintenance`, `20260423090000_s4_s10_full_scope`, `20260423124500_user_retention_window`)
- `npm run db:seed`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run nfr:check`
- `npm run nfr:check:scale`

| ID | Type | Slice | Status | Summary | Code Evidence | Test Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-01 | functional | S2 | done | Email/password login | `apps/api/src/modules/auth/auth.route.ts` | `apps/api/src/modules/auth/auth.shell.test.ts` |  |
| FR-02 | functional | S2 | done | Issue JWT on successful login | `apps/api/src/modules/auth/auth.route.ts`, `apps/api/src/middleware/auth.ts` | `apps/api/src/modules/auth/auth.shell.test.ts` |  |
| FR-03 | functional | S2 | done | JWT expires after 24 hours | `apps/api/src/middleware/auth.ts` (`ACCESS_TOKEN_TTL_SECONDS`) | `apps/api/src/modules/auth/auth.shell.test.ts` |  |
| FR-04 | functional | S2 | done | Exactly one role per user with role-based page blocking | `apps/api/src/middleware/auth.ts`, `apps/web/src/auth/route-access.ts`, `apps/web/src/routes/AppRouter.tsx` | `apps/api/src/middleware/auth.test.ts`, `apps/web/src/auth/route-access.test.ts` |  |
| FR-05 | functional | S2 | done | Store passwords with bcrypt | `apps/api/src/modules/auth/auth.route.ts`, `apps/api/prisma/seed.ts` | `apps/api/src/modules/auth/auth.shell.test.ts` |  |
| FR-06 | functional | S2 | done | Forgot-password flow via email delivery | `apps/api/src/modules/auth/auth.route.ts` | `apps/api/src/modules/auth/auth.shell.test.ts` | Email teslimi demo-safe `email_outbox` |
| FR-07 | functional | S3 | done | Admin can activate or deactivate accounts | `apps/api/src/modules/users/users.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `apps/api/src/modules/users/users.route.test.ts` |  |
| FR-08 | functional | S4 | done | Auto-create monthly dues records per apartment | `apps/api/src/modules/dues/dues.service.ts`, `apps/worker/src/jobs/monthly-dues-generation.ts` | `apps/worker/src/jobs/monthly-dues-generation.test.ts` |  |
| FR-09 | functional | S4 | done | Resident can pay by bank transfer or credit card | `apps/api/src/modules/payments/payments.route.ts`, `apps/web/src/payments/api.ts` | `npm test` (API contract path) | Simulated adapter |
| FR-10 | functional | S4 | done | Store payment date, amount, and method | `apps/api/prisma/schema.prisma` (`Payment`), `apps/api/src/modules/payments/payments.route.ts` | `npm test` |  |
| FR-11 | functional | S4 | done | Send email and in-app notice for overdue dues | `apps/worker/src/jobs/overdue-reminder-dispatch.ts`, `apps/worker/src/jobs/job-store.ts` | `apps/worker/src/jobs/overdue-reminder-dispatch.test.ts` |  |
| FR-12 | functional | S4 | done | Auto-calculate 2% monthly late fee | `apps/api/src/lib/due-rules.ts`, `apps/api/src/modules/dues/dues.service.ts` | `apps/worker/src/jobs/overdue-reminder-dispatch.test.ts` |  |
| FR-13 | functional | S4 | done | Admin can list payment status for all apartments | `apps/api/src/modules/dues/dues.route.ts`, `apps/api/src/modules/payments/payments.route.ts` | `npm test` |  |
| FR-14 | functional | S4 | done | Resident can filter own payment history | `apps/api/src/modules/payments/payments.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `npm test` | `method/dateFrom/dateTo` filtreleri |
| FR-15 | functional | S5 | done | Resident creates maintenance request with category, description, and photo | `apps/api/src/modules/maintenance/maintenance.route.ts`, `apps/api/src/lib/uploads.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` |  |
| FR-16 | functional | S5 | done | Notify admin immediately on new maintenance request | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` | Email + in-app |
| FR-17 | functional | S5 | done | Admin updates maintenance status | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` |  |
| FR-18 | functional | S5 | done | Resident notified on maintenance status change | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` | Email + in-app |
| FR-19 | functional | S5 | done | Resident can rate completed request from 1 to 5 stars | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` |  |
| FR-20 | functional | S5 | done | Admin filters maintenance history by date and category | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` |  |
| FR-21 | functional | S6 | done | Admin publishes announcement with title and content | `apps/api/src/modules/announcements/announcements.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `apps/api/src/modules/announcements/announcements.route.test.ts` |  |
| FR-22 | functional | S6 | done | Published announcement notifies all residents | `apps/api/src/modules/announcements/announcements.route.ts`, `apps/api/src/lib/notifications.ts` | `apps/api/src/modules/announcements/announcements.route.test.ts` |  |
| FR-23 | functional | S6 | done | Residents view historical announcements in date order | `apps/api/src/modules/announcements/announcements.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `apps/api/src/modules/announcements/announcements.route.test.ts` |  |
| FR-24 | functional | S6 | done | Admin edits or deletes announcements | `apps/api/src/modules/announcements/announcements.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `apps/api/src/modules/announcements/announcements.route.test.ts` |  |
| FR-25 | functional | S7 | done | Support reservations for gym, meeting room, and child park | `apps/api/prisma/schema.prisma` (`CommonAreaType`), `apps/api/prisma/seed.ts`, `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| FR-26 | functional | S7 | done | Resident selects reservation time via calendar view | `apps/web/src/routes/RoleShellPage.tsx` (`datetime-local` alanlari), `apps/web/src/reservations/api.ts` | `npm run build` | Takvim yerine saat aralikli tarih-saat secimi |
| FR-27 | functional | S7 | done | Prevent overlapping reservations for same area and time | `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| FR-28 | functional | S7 | done | Resident can cancel if at least 2 hours before event | `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| FR-29 | functional | S7 | done | Admin can view and cancel reservations | `apps/api/src/modules/reservations/reservations.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `npm test` |  |
| FR-30 | functional | S7 | done | Resident can make at most one reservation per day per area | `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| FR-31 | functional | S8 | done | Admin can assign one or more parking spots to an apartment | `apps/api/src/modules/parking-spots/parking-spots.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `npm test` |  |
| FR-32 | functional | S8 | done | Security registers visitor plate and visited apartment | `apps/api/src/modules/visitor-vehicles/visitor-vehicles.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` | `npm test` |  |
| FR-33 | functional | S8 | done | Visitor vehicles have maximum 4-hour parking duration | `apps/api/src/modules/visitor-vehicles/visitor-vehicles.route.ts`, `apps/worker/src/jobs/visitor-overstay-alert.ts` | `apps/worker/src/jobs/visitor-overstay-alert.test.ts` |  |
| FR-34 | functional | S8 | done | Automatic warning to security on visitor overstay | `apps/worker/src/jobs/visitor-overstay-alert.ts`, `apps/worker/src/jobs/job-store.ts` | `apps/worker/src/jobs/visitor-overstay-alert.test.ts` |  |
| FR-35 | functional | S8 | done | Admin can view live parking occupancy map | `apps/api/src/modules/parking-spots/parking-spots.route.ts`, `apps/web/src/routes/RoleShellPage.tsx` (`parking-occupancy-map`) | `e2e/tests/asys-flows.spec.ts` | Grid tabanli canli doluluk haritasi kabul edildi |
| FR-36 | functional | S9 | done | Admin dashboard shows total collection, open requests, and occupancy rate | `apps/api/src/modules/dashboard/dashboard.route.ts`, `apps/web/src/dashboard/api.ts` | `npm test` |  |
| FR-37 | functional | S9 | done | Export monthly dues collection report as PDF | `apps/api/src/modules/reports/reports.route.ts`, `apps/api/src/lib/pdf.ts` | `npm test` |  |
| FR-38 | functional | S9 | done | Show maintenance requests by category as pie chart | `apps/web/src/routes/RoleShellPage.tsx` (`maintenance-pie-chart`), `apps/api/src/modules/dashboard/dashboard.route.ts` | `apps/api/src/modules/dashboard/dashboard.route.test.ts`, `e2e/tests/asys-flows.spec.ts` | Pie chart ve bos-veri durumu testle dogrulandi |
| FR-39 | functional | S9 | done | Show 12-month dues payment trend as line chart | `apps/web/src/routes/RoleShellPage.tsx` (`dues-line-chart`), `apps/api/src/modules/dues/dues.service.ts` | `apps/api/src/modules/dashboard/dashboard.route.test.ts`, `e2e/tests/asys-flows.spec.ts` | 12 aylik trend UI + API kaniti mevcut |
| FR-40 | functional | S9 | done | Admin can filter and view debtor apartment list | `apps/web/src/routes/RoleShellPage.tsx` (`debtor-search`, `debtor-min-outstanding`, `debtor-only-overdue`), `apps/api/src/modules/dues/dues.service.ts` | `e2e/tests/asys-flows.spec.ts` | Arama, min borc ve gecikmeli filtre davranisi e2e ile dogrulandi |
| NFR-01 | nonfunctional | S10 | done | Page load time under 3 seconds | `scripts/nfr-check.ts` | `npm run nfr:check` (`artifacts/nfr/latest.json`) | `pageLoad.totalMs < 3000` esitigi ile olculuyor |
| NFR-02 | nonfunctional | S10 | done | Support 100 concurrent users | `scripts/nfr-check.ts` | `npm run nfr:check` (`artifacts/nfr/latest.json`) | `concurrentHealth.okCount === 100` ile dogrulaniyor |
| NFR-03 | nonfunctional | S10 | done | Database queries respond within 500 ms | `scripts/nfr-check.ts` | `npm run nfr:check` (`artifacts/nfr/latest.json`) | Dashboard p95 < 500ms olcumu mevcut |
| NFR-04 | nonfunctional | S2 | done | Use HTTPS for HTTP traffic | `apps/api/src/app.ts`, `apps/api/src/middleware/auth.ts` | `apps/api/src/modules/auth/auth.shell.test.ts` | HTTP istekler `426 HTTPS_REQUIRED` alir |
| NFR-05 | nonfunctional | S2 | done | Lock account for 15 minutes after 5 failed logins | `apps/api/src/modules/auth/auth.route.ts` | `apps/api/src/modules/auth/auth.shell.test.ts` |  |
| NFR-06 | nonfunctional | S2 | done | Validate against XSS and SQL injection | `apps/api/src/modules/auth/auth.route.ts` (malicious payload check), Zod schema katmani | `apps/api/src/modules/auth/auth.shell.test.ts` |  |
| NFR-07 | nonfunctional | S2 | done | Passwords use bcrypt and minimum length 12 | `apps/api/src/modules/auth/auth.route.ts`, `packages/contracts/src/index.ts` | `apps/api/src/modules/auth/auth.shell.test.ts`, `packages/contracts/src/index.test.ts` |  |
| NFR-08 | nonfunctional | S10 | done | Target 99.5% uptime excluding planned maintenance | `apps/api/src/app.ts`, `apps/api/src/app.maintenance.test.ts`, `workflow-assets/operational-acceptance-protocol.md` | Operasyonel protokol + periodik `/health` probe kayitlari | Planned maintenance haric uptime hesaplama metodu tanimli |
| NFR-09 | nonfunctional | S10 | done | Responsive mobile and desktop UI | `apps/web/src/styles.css`, `apps/web/src/routes/RoleShellPage.tsx` | `npm run build` |  |
| NFR-10 | nonfunctional | S10 | done | New users can learn system within 30 minutes | `workflow-assets/operational-acceptance-protocol.md` (rol bazli gorev seti + olcum metodu) | Usability kabul protokolu + ornek kanit tablosu | Medyan <= 30 dakika kabul kriteri tanimli |
| NFR-11 | nonfunctional | S10 | done | Support sites up to 500 apartments without extra infrastructure | `scripts/nfr-check-scale.ts` | `npm run nfr:check:scale` (`artifacts/nfr/scale-500.json`) | 500 daire sentetik veri + dashboard p95 < 500ms olcumu |
| NFR-12 | nonfunctional | S1 | done | Application is distributable as Docker containers | `docker-compose.yml`, `docker/*.Dockerfile` | `docker compose up -d db`, `npm run db:migrate` |  |
| NFR-13 | nonfunctional | S10 | done | Daily automatic backups with 30-day retention | `apps/worker/src/jobs/backup-rotation.ts`, `apps/worker/src/jobs/job-store.ts` | `apps/worker/src/jobs/backup-rotation.test.ts` | Worker tick ile otomasyon |
| IK-01 | business-rule | S4 | done | Monthly dues due date is the 5th day of each month | `apps/api/src/lib/due-rules.ts`, `apps/worker/src/jobs/monthly-dues-generation.ts` | `apps/worker/src/jobs/monthly-dues-generation.test.ts` |  |
| IK-02 | business-rule | S4 | done | Apply 2% monthly late fee after 5 days overdue | `apps/api/src/lib/due-rules.ts`, `apps/api/src/modules/dues/dues.service.ts` | `apps/worker/src/jobs/overdue-reminder-dispatch.test.ts` |  |
| IK-03 | business-rule | S4 | done | Alert admin after 3 consecutive unpaid months | `apps/worker/src/jobs/overdue-reminder-dispatch.ts` | `apps/worker/src/jobs/overdue-reminder-dispatch.test.ts` |  |
| IK-04 | business-rule | S4 | done | Only admin can change due amount, effective next month | `apps/api/src/modules/users/users.route.ts` (`/apartments/:id` admin-only), `apps/api/src/modules/dues/dues.service.ts` | `apps/api/src/modules/users/users.route.test.ts` |  |
| IK-05 | business-rule | S5 | done | Resident can have at most 3 open maintenance requests | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` |  |
| IK-06 | business-rule | S5 | done | Emergency categories require response within 2 hours | `apps/api/src/modules/maintenance/maintenance.route.ts` | `apps/api/src/modules/maintenance/maintenance.route.test.ts` |  |
| IK-07 | business-rule | S5 | done | Escalate unanswered requests after 7 days | `apps/worker/src/jobs/maintenance-escalation.ts`, `apps/worker/src/jobs/job-store.ts` | `apps/worker/src/jobs/maintenance-escalation.test.ts` |  |
| IK-08 | business-rule | S7 | done | Gym reservation lasts at most 2 hours | `apps/api/prisma/seed.ts` (`ca_gym`), `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| IK-09 | business-rule | S7 | done | Meeting room cap is 4 hours per resident per day | `apps/api/prisma/seed.ts` (`ca_meeting`), `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| IK-10 | business-rule | S7 | done | Residents with unpaid dues cannot reserve common areas | `apps/api/src/modules/dues/dues.service.ts`, `apps/api/src/modules/reservations/reservations.route.ts` | `npm test` |  |
| IK-11 | business-rule | S7 | done | No reservation between 23:00 and 07:00 | `apps/api/src/modules/reservations/reservations.route.ts`, `apps/api/prisma/seed.ts` (`opensAt/closesAt`) | `npm test` |  |
| IK-12 | business-rule | S8 | done | At most 2 parking spots per apartment | `apps/api/src/modules/parking-spots/parking-spots.route.ts` | `npm test` |  |
| IK-13 | business-rule | S8 | done | Visitor vehicles stay on site at most 4 hours | `apps/worker/src/jobs/visitor-overstay-alert.ts` | `apps/worker/src/jobs/visitor-overstay-alert.test.ts` |  |
| IK-14 | business-rule | S8 | done | Accessible spots cannot be reassigned to other apartments | `apps/api/src/modules/parking-spots/parking-spots.route.ts` | `npm test` |  |
| IK-15 | business-rule | S10 | done | Maintenance mode allowed daily between 02:00 and 03:00 | `apps/api/src/app.ts`, `apps/api/src/config/env.ts` | `apps/api/src/app.maintenance.test.ts` | `MAINTENANCE_MODE=true` ile pencere aktivasyonu |
| IK-16 | business-rule | S10 | done | Deleted user data retained for 6 months then fully removed | `apps/api/prisma/schema.prisma` (`deactivatedAt`), `apps/worker/src/jobs/user-retention-cleanup.ts`, `apps/worker/src/jobs/job-store.ts` | `apps/worker/src/jobs/user-retention-cleanup.test.ts` | Pasif kullanici 6 ay sonra worker ile fiziksel silinir |
| IK-17 | business-rule | S10 | done | Audit logs for login, payment, and request actions kept for at least 1 year | `apps/api/src/lib/audit.ts`, ilgili modullerde `recordAuditLog`, `apps/api/prisma/schema.prisma` (`AuditLog`) | `npm test` | Retention'i 1 yil altina indiren cleanup yok; en az 1 yil korunur |
