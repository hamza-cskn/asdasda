import assert from "node:assert/strict";
import test from "node:test";

import { buildUserRetentionCutoff, runUserRetentionCleanupJob } from "./user-retention-cleanup.js";

test("buildUserRetentionCutoff returns 6-month threshold", () => {
  const now = new Date("2026-04-23T10:15:00.000Z");
  const cutoff = buildUserRetentionCutoff(now);
  assert.equal(cutoff.toISOString(), "2025-10-23T10:15:00.000Z");
});

test("runUserRetentionCleanupJob vacates apartments, deletes users, and writes audit", async () => {
  const vacated: string[][] = [];
  const deleted: string[][] = [];
  const auditUserIds: string[][] = [];

  const result = await runUserRetentionCleanupJob(
    {
      async listRetentionCandidates() {
        return [
          { userId: "usr_1", apartmentId: "apt_1" },
          { userId: "usr_2", apartmentId: null },
          { userId: "usr_3", apartmentId: "apt_1" }
        ];
      },
      async markApartmentsVacant(apartmentIds) {
        vacated.push([...apartmentIds]);
      },
      async deleteUsers(userIds) {
        deleted.push([...userIds]);
        return userIds.length;
      },
      async appendRetentionAudit(userIds) {
        auditUserIds.push([...userIds]);
      }
    },
    new Date("2026-04-23T10:15:00.000Z")
  );

  assert.equal(result.deletedCount, 3);
  assert.deepEqual(vacated, [["apt_1"]]);
  assert.deepEqual(deleted, [["usr_1", "usr_2", "usr_3"]]);
  assert.deepEqual(auditUserIds, [["usr_1", "usr_2", "usr_3"]]);
});
