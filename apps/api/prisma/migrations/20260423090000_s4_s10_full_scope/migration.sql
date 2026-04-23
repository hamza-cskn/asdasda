CREATE TYPE "CommonAreaType" AS ENUM ('GYM', 'MEETING_ROOM', 'CHILD_PARK');
CREATE TYPE "ParkingSpotType" AS ENUM ('STANDARD', 'ACCESSIBLE', 'VISITOR');
CREATE TYPE "NotificationCategory" AS ENUM (
  'PASSWORD_RESET',
  'ANNOUNCEMENT_PUBLISHED',
  'MAINTENANCE_REQUEST_CREATED',
  'MAINTENANCE_STATUS_UPDATED',
  'MAINTENANCE_ESCALATED_7D',
  'DUE_OVERDUE',
  'DUE_DEBTOR_3_MONTHS',
  'PAYMENT_RECEIVED',
  'RESERVATION_CREATED',
  'RESERVATION_CANCELLED',
  'VISITOR_OVERSTAY',
  'SYSTEM_BACKUP'
);

CREATE TABLE "notifications" (
  "notification_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "link" TEXT,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

CREATE TABLE "audit_logs" (
  "audit_log_id" TEXT NOT NULL,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("audit_log_id")
);

ALTER TABLE "common_areas"
ADD COLUMN "type" "CommonAreaType" NOT NULL DEFAULT 'GYM',
ADD COLUMN "max_duration_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "daily_limit_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "opens_at" TEXT NOT NULL DEFAULT '07:00',
ADD COLUMN "closes_at" TEXT NOT NULL DEFAULT '23:00';

UPDATE "common_areas"
SET "type" = 'MEETING_ROOM',
    "max_duration_hours" = 4,
    "daily_limit_hours" = 4
WHERE lower("name") LIKE '%toplanti%';

UPDATE "common_areas"
SET "type" = 'CHILD_PARK',
    "max_duration_hours" = 2,
    "daily_limit_hours" = 2
WHERE lower("name") LIKE '%cocuk%';

ALTER TABLE "common_areas"
ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "reservations"
ADD COLUMN "cancelled_at" TIMESTAMP(3);

ALTER TABLE "parking_spots"
ADD COLUMN "type" "ParkingSpotType" NOT NULL DEFAULT 'STANDARD';

UPDATE "parking_spots"
SET "type" = 'ACCESSIBLE'
WHERE "is_accessible" = true;

ALTER TABLE "parking_spots"
DROP COLUMN "is_accessible",
ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "visitor_vehicles"
ADD COLUMN "parking_spot_id" TEXT;

INSERT INTO "parking_spots" ("parking_spot_id", "spot_number", "type", "created_at")
VALUES ('spot_visitor_legacy', 'VISITOR-LEGACY', 'VISITOR', CURRENT_TIMESTAMP)
ON CONFLICT ("spot_number") DO NOTHING;

UPDATE "visitor_vehicles"
SET "parking_spot_id" = 'spot_visitor_legacy'
WHERE "parking_spot_id" IS NULL;

ALTER TABLE "visitor_vehicles"
ALTER COLUMN "parking_spot_id" SET NOT NULL;

CREATE UNIQUE INDEX "dues_apartment_id_due_date_key" ON "dues"("apartment_id", "due_date");
CREATE INDEX "dues_status_due_date_idx" ON "dues"("status", "due_date");
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");
CREATE INDEX "notifications_user_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "reservations_area_time_idx" ON "reservations"("common_area_id", "starts_at", "ends_at");
CREATE INDEX "reservations_resident_time_idx" ON "reservations"("resident_id", "starts_at");
CREATE INDEX "parking_spots_type_apartment_id_idx" ON "parking_spots"("type", "apartment_id");
CREATE INDEX "visitor_vehicles_entered_at_exited_at_idx" ON "visitor_vehicles"("entered_at", "exited_at");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visitor_vehicles"
ADD CONSTRAINT "visitor_vehicles_parking_spot_id_fkey"
FOREIGN KEY ("parking_spot_id") REFERENCES "parking_spots"("parking_spot_id")
ON DELETE CASCADE ON UPDATE CASCADE;
