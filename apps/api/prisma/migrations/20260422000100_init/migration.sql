-- Create enums
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RESIDENT', 'SECURITY');
CREATE TYPE "DueStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'BANK_TRANSFER');
CREATE TYPE "MaintenanceStatus" AS ENUM ('BEKLEMEDE', 'ISLEMDE', 'TAMAMLANDI');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- Create tables
CREATE TABLE "apartments" (
  "apartment_id" TEXT NOT NULL,
  "block" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "monthly_due" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "is_occupied" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "apartments_pkey" PRIMARY KEY ("apartment_id")
);

CREATE TABLE "users" (
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "phone" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "apartment_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "dues" (
  "due_id" TEXT NOT NULL,
  "apartment_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "status" "DueStatus" NOT NULL DEFAULT 'PENDING',
  "late_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dues_pkey" PRIMARY KEY ("due_id")
);

CREATE TABLE "payments" (
  "payment_id" TEXT NOT NULL,
  "due_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

CREATE TABLE "maintenance_requests" (
  "request_id" TEXT NOT NULL,
  "resident_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "photo_url" TEXT,
  "status" "MaintenanceStatus" NOT NULL DEFAULT 'BEKLEMEDE',
  "rating" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("request_id")
);

CREATE TABLE "announcements" (
  "announcement_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "author_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("announcement_id")
);

CREATE TABLE "common_areas" (
  "common_area_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "common_areas_pkey" PRIMARY KEY ("common_area_id")
);

CREATE TABLE "reservations" (
  "reservation_id" TEXT NOT NULL,
  "common_area_id" TEXT NOT NULL,
  "resident_id" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservation_id")
);

CREATE TABLE "parking_spots" (
  "parking_spot_id" TEXT NOT NULL,
  "spot_number" TEXT NOT NULL,
  "apartment_id" TEXT,
  "is_accessible" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "parking_spots_pkey" PRIMARY KEY ("parking_spot_id")
);

CREATE TABLE "visitor_vehicles" (
  "visitor_vehicle_id" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "apartment_id" TEXT NOT NULL,
  "registered_by_id" TEXT,
  "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "exited_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "visitor_vehicles_pkey" PRIMARY KEY ("visitor_vehicle_id")
);

-- Indexes
CREATE UNIQUE INDEX "apartments_block_number_key" ON "apartments"("block", "number");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_apartment_id_key" ON "users"("apartment_id");
CREATE UNIQUE INDEX "common_areas_name_key" ON "common_areas"("name");
CREATE UNIQUE INDEX "parking_spots_spot_number_key" ON "parking_spots"("spot_number");

-- FKs
ALTER TABLE "users"
ADD CONSTRAINT "users_apartment_id_fkey"
FOREIGN KEY ("apartment_id") REFERENCES "apartments"("apartment_id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dues"
ADD CONSTRAINT "dues_apartment_id_fkey"
FOREIGN KEY ("apartment_id") REFERENCES "apartments"("apartment_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_due_id_fkey"
FOREIGN KEY ("due_id") REFERENCES "dues"("due_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("user_id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
ADD CONSTRAINT "maintenance_requests_resident_id_fkey"
FOREIGN KEY ("resident_id") REFERENCES "users"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcements"
ADD CONSTRAINT "announcements_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "users"("user_id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_common_area_id_fkey"
FOREIGN KEY ("common_area_id") REFERENCES "common_areas"("common_area_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_resident_id_fkey"
FOREIGN KEY ("resident_id") REFERENCES "users"("user_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parking_spots"
ADD CONSTRAINT "parking_spots_apartment_id_fkey"
FOREIGN KEY ("apartment_id") REFERENCES "apartments"("apartment_id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visitor_vehicles"
ADD CONSTRAINT "visitor_vehicles_apartment_id_fkey"
FOREIGN KEY ("apartment_id") REFERENCES "apartments"("apartment_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visitor_vehicles"
ADD CONSTRAINT "visitor_vehicles_registered_by_id_fkey"
FOREIGN KEY ("registered_by_id") REFERENCES "users"("user_id")
ON DELETE SET NULL ON UPDATE CASCADE;
