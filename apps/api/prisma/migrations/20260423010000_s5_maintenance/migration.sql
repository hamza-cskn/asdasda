ALTER TABLE "maintenance_requests"
ADD COLUMN "response_due_at" TIMESTAMP(3),
ADD COLUMN "responded_at" TIMESTAMP(3),
ADD COLUMN "escalated_at" TIMESTAMP(3);

CREATE INDEX "maintenance_requests_status_created_at_idx"
ON "maintenance_requests"("status", "created_at");
