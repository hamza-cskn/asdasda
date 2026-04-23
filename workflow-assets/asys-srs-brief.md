# ASYS SRS Brief

Normalized build brief distilled from `CodeForge_Proje1.pdf` so the workflow can run without parsing the PDF at runtime.

## Source And Scope

- Product: `Akilli Site Yonetim Sistemi (ASYS)`
- Source of truth: `CodeForge_Proje1.pdf`
- Build target: a fresh empty repo/workdir that will become the ASYS application repository
- Delivery target: a working local application, database, tests, Docker packaging, seeded demo data, and essential run/handover docs
- Explicitly out of scope: chat or messaging; the PDF marks it as a future enhancement

## Completion Standard

The workflow is done only when the target repo contains a working ASYS implementation that:

- boots locally with Docker Compose
- passes repo verification gates
- includes a usable API, web app, worker path, tests, and demo data
- includes `CONTEXT.md`, `REQUIREMENT_COVERAGE.md`, `README.md`, and `HANDOVER.md`
- satisfies the PDF requirements end to end

## Architecture Lock

These stack choices are fixed and should not be re-decided mid-run:

- Monorepo layout with `apps/api` and `apps/web`, both TypeScript
- API: Node.js + Express + Prisma + PostgreSQL + JWT + bcrypt + Zod
- Web: React + Vite + React Router + TanStack Query + charting for dashboard/report visuals
- Background processing path for monthly dues generation, reminders, escalations, visitor overstay alerts, and backup rotation
- Docker Compose for local startup
- Demo-safe adapters for payments, email, notifications, and password reset delivery
- Turkish user-facing copy by default

Recommended repo conventions the workflow should enforce:

- Root scripts: `lint`, `typecheck`, `build`, `test`, `test:e2e`, `test:acceptance`, `db:migrate`, `db:seed`, `perf:check`, `security:check`, `backup:verify`
- Compose services: `db`, `api`, `web`, `worker`
- Health endpoints and checks: API health on `http://localhost:3001/health`, web served on `http://localhost:3000`
- Shared types/utilities may live in a workspace package if needed, but the repo must still center on `apps/api` and `apps/web`

## Users And Roles

### Admin / Site Manager

- Full access across all modules
- Manages residents, apartments, dues, announcements, reports, and parking allocation
- Can activate or deactivate accounts
- Can export reports and review whole-system dashboards

### Resident / Apartment Owner-Tenant

- Accesses only their own account, apartment-facing dues, reservations, maintenance history, announcements, and profile
- Can pay dues, open maintenance requests, follow request status, rate completed work, and reserve common areas

### Security Guard

- Limited access
- Registers visitor vehicles and entry/exit activity
- Views parking occupancy and a limited resident lookup
- Does not access dues, reporting, or maintenance management

## Module List

- `M-01` Authentication: login, token handling, password reset, role enforcement
- `M-02` Dues Management: monthly dues, payments, reminders, late fees, debt views
- `M-03` Maintenance: request creation, status tracking, notifications, ratings
- `M-04` Announcement Management: admin announcements and resident feed
- `M-05` Common Area Reservations: gym, meeting room, child park reservation flows
- `M-06` Parking Management: apartment spot assignment, visitor vehicle tracking, occupancy
- `M-07` Reporting and Dashboard: KPI cards, charts, debtor list, exports
- `M-08` User Management: residents, security users, roles, profiles, apartment assignment

## Functional Requirements

### Authentication And Authorization

- `FR-01`: Allow login with email and password.
- `FR-02`: Issue a JWT token on successful login.
- `FR-03`: JWT expiry is 24 hours; expired tokens must be rejected.
- `FR-04`: Every user has exactly one role; pages outside that role must be blocked.
- `FR-05`: Passwords must be stored as bcrypt hashes.
- `FR-06`: "Sifremi Unuttum" flow resets password via email delivery.
- `FR-07`: Admin can mark a user account active or inactive.

### Dues Management

- `FR-08`: Auto-create monthly dues records per apartment.
- `FR-09`: Resident can pay online by bank transfer or credit card.
- `FR-10`: Store payment date, amount, and method for every payment.
- `FR-11`: Send email and in-app notification for overdue dues.
- `FR-12`: Auto-calculate a 2% monthly late fee on overdue dues.
- `FR-13`: Admin can list payment status for all apartments.
- `FR-14`: Resident can filter their own payment history.

### Maintenance

- `FR-15`: Resident can create a maintenance request with category, description, and photo.
- `FR-16`: New maintenance requests notify admin immediately.
- `FR-17`: Admin can change request status among `Beklemede`, `Islemde`, and `Tamamlandi`.
- `FR-18`: Resident receives notification when maintenance status changes.
- `FR-19`: Resident can rate a completed request from 1 to 5 stars.
- `FR-20`: Admin can filter maintenance history by date range and category.

### Announcements

- `FR-21`: Admin can publish announcements with title and content.
- `FR-22`: Published announcements notify all residents who log in.
- `FR-23`: Residents can view historical announcements in date order.
- `FR-24`: Admin can edit or delete published announcements.

### Common Area Reservations

- `FR-25`: The system supports reservations for the gym, meeting room, and child park.
- `FR-26`: Residents make reservations from a calendar/time-slot view.
- `FR-27`: The same area cannot have overlapping reservations for the same time range.
- `FR-28`: Residents can cancel a reservation only if the event is at least 2 hours away.
- `FR-29`: Admin can view reservation lists and cancel reservations.
- `FR-30`: A resident can make at most one reservation per day for the same common area.

### Parking Management

- `FR-31`: Admin can assign one or more parking spot numbers to an apartment.
- `FR-32`: Security can register visitor vehicle plate number and visited apartment.
- `FR-33`: Visitor vehicles have a maximum 4-hour parking duration.
- `FR-34`: When a visitor exceeds the allowed duration, the system sends an automatic warning to security.
- `FR-35`: Admin can view the live parking occupancy map.

### Reporting And Dashboard

- `FR-36`: Admin dashboard shows total dues collection, open request count, and occupancy rate.
- `FR-37`: Export monthly dues collection report as PDF.
- `FR-38`: Show maintenance requests by category as a pie chart.
- `FR-39`: Show 12-month dues payment trend as a line chart.
- `FR-40`: Admin can filter and view the debtor apartment list.

## Nonfunctional Requirements

### Performance

- `NFR-01`: Page load time should not exceed 3 seconds.
- `NFR-02`: Support 100 concurrent users.
- `NFR-03`: Database queries should respond within 500 ms.

### Security

- `NFR-04`: All HTTP traffic must run over HTTPS.
- `NFR-05`: Lock an account for 15 minutes after 5 failed login attempts.
- `NFR-06`: Apply input validation against XSS and SQL injection.
- `NFR-07`: Store passwords with bcrypt and minimum length 12.

### Usability

- `NFR-08`: Target 99.5% uptime excluding planned maintenance.
- `NFR-09`: UI must be responsive for mobile and desktop.
- `NFR-10`: New users should be able to use the system within 30 minutes without extra training.

### Scalability And Maintenance

- `NFR-11`: Support sites up to 500 apartments without extra infrastructure.
- `NFR-12`: Application must be distributable in Docker container form.
- `NFR-13`: Database backups run daily with 30-day retention.

## Business Rules And Constraints

The PDF contains 17 business rules. Earlier shorthand mentioned `IK-01..IK-14`, but the source document also includes `IK-15..IK-17` under general system constraints; treat all 17 as in scope.

### Dues Rules

- `IK-01`: Monthly dues are due on the 5th day of each month.
- `IK-02`: Payments more than 5 days late receive a 2% monthly late fee.
- `IK-03`: Alert admin automatically when a resident has not paid for 3 consecutive months.
- `IK-04`: Only admin can change the monthly due amount; the change applies starting next month.

### Maintenance Rules

- `IK-05`: A resident can have at most 3 open maintenance requests at the same time.
- `IK-06`: Emergency categories such as gas leak or water overflow must be answered within 2 hours.
- `IK-07`: Requests unanswered for 7 days must trigger an escalation notification to admin.

### Reservation Rules

- `IK-08`: Gym reservations can last at most 2 hours.
- `IK-09`: Meeting room reservations can total at most 4 hours per resident per day.
- `IK-10`: Residents with unpaid dues cannot reserve common areas.
- `IK-11`: Common areas cannot be reserved between 23:00 and 07:00.

### Parking Rules

- `IK-12`: An apartment can receive at most 2 parking spots.
- `IK-13`: Visitor vehicles can remain on site at most 4 hours.
- `IK-14`: Accessible / disabled-only parking spots cannot be reassigned to another apartment.

### General System Constraints

- `IK-15`: The system may enter maintenance mode daily between 02:00 and 03:00; this is allowed for access restriction planning.
- `IK-16`: Deleted user data is retained for 6 months, then fully deleted, for KVKK-style compliance.
- `IK-17`: All audit logs for login, payment, and request actions must be retained for at least 1 year.

## Data Model

### Required Tables

- `users`
- `apartments`
- `dues`
- `payments`
- `maintenance_requests`
- `announcements`
- `common_areas`
- `reservations`
- `parking_spots`
- `visitor_vehicles`

### Schema Guidance

- `users`: `user_id`, `name`, `email`, `password_hash`, `role`, `phone`, `is_active`, `created_at`
- `apartments`: `apartment_id`, `block`, `floor`, `number`, `user_id`, `monthly_due`, `is_occupied`
- `dues`: monthly amount, due date, status, late-fee state, apartment relation
- `payments`: amount, method, paid-at timestamp, receipt/export metadata, due relation
- `maintenance_requests`: resident relation, category, description, photo attachment path, status, rating, timestamps
- `announcements`: title, content, published-at, author, active/deleted markers
- `common_areas`: area definition with type, name, availability rules, duration rules
- `reservations`: area, resident, start/end time, status, cancellation timestamp
- `parking_spots`: spot number, apartment relation, `type` of `standard`, `handicapped`, or `visitor`, occupancy state
- `visitor_vehicles`: plate number, spot, visited apartment, entry/exit times, security user relation

## Wireframe Guidance

Do not spend workflow time regenerating formal wireframe deliverables, but the app should follow these screen expectations:

### Login

- Centered logo/site name
- Email and password inputs
- Show/hide password
- `Giris Yap` primary button
- `Sifremi Unuttum` link
- Visible error alert area

### Admin Dashboard

- Sidebar nav for all modules
- KPI cards for total collection, open maintenance count, occupancy rate
- Line chart for 12-month payment trend
- Pie chart for maintenance category distribution
- Debtor table
- Recent announcements widget

### Resident Dues Screen

- Current debt summary card
- Payment method selector
- Payment form or bank transfer instructions
- Payment history table with filters
- `Makbuz Indir` action for PDF receipt

### Security Vehicle Screen

- Plate input with uppercase normalization
- Search/select apartment
- Select available visitor spot
- Save entry with automatic timestamp
- Active visitor list
- Exit action

## Fixed Vertical Slices

- `S1`: foundation scaffold, env/config, Docker, DB migrations, seed data, shared types, auth shell
- `S2`: authentication, JWT 24h expiry, bcrypt policy, lockout, forgot-password, RBAC
- `S3`: resident/admin/security account flows and apartment/user management
- `S4`: dues, payments, payment history, late fees, overdue alerts, debtor views, receipts
- `S5`: maintenance requests with categories, photo upload, status flow, notifications, rating, escalation rules
- `S6`: announcements and resident notification feed
- `S7`: common-area reservations with overlap prevention and all reservation business rules
- `S8`: parking assignment, visitor vehicles, occupancy, time-limit alerts, accessible-spot rule
- `S9`: admin dashboard, KPI cards, charts, monthly PDF report export, filtered debtor reporting
- `S10`: NFR hardening, responsive UX, backup scripts, performance/security verification, README and handover polish

## Verification Expectations

- Keep `REQUIREMENT_COVERAGE.md` current throughout the run.
- Every finished slice must add concrete code evidence and test evidence, not only prose claims.
- Final repo must include unit/integration coverage, Playwright end-to-end journeys for admin/resident/security, Docker startup, seeded demo accounts, PDF report output, and PDF receipt output.
