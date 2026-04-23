-- Add deactivation timestamp for 6-month retention workflow.
ALTER TABLE "users"
ADD COLUMN "deactivated_at" TIMESTAMP(3);

UPDATE "users"
SET "deactivated_at" = NOW()
WHERE "is_active" = false AND "deactivated_at" IS NULL;

CREATE INDEX "users_is_active_deactivated_at_idx"
ON "users"("is_active", "deactivated_at");
