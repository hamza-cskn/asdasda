import assert from "node:assert/strict";
import test from "node:test";

import { buildBackupCutoff, runBackupRotationJob } from "./backup-rotation.js";

test("buildBackupCutoff returns 30-day threshold", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");
  const cutoff = buildBackupCutoff(now);
  assert.equal(cutoff.toISOString(), "2026-03-24T10:00:00.000Z");
});

test("runBackupRotationJob creates backup and removes old ones", async () => {
  const removed: string[] = [];
  let announced = false;

  const result = await runBackupRotationJob(
    {
      async createBackup(now) {
        return {
          fileName: "backup-2026-04-23.json",
          createdAt: now
        };
      },
      async listBackups() {
        return [
          { fileName: "backup-2026-03-01.json", createdAt: new Date("2026-03-01T00:00:00.000Z") },
          { fileName: "backup-2026-04-23.json", createdAt: new Date("2026-04-23T00:00:00.000Z") }
        ];
      },
      async removeBackups(fileNames) {
        removed.push(...fileNames);
      },
      async announceBackup() {
        announced = true;
      }
    },
    new Date("2026-04-23T10:00:00.000Z")
  );

  assert.equal(result.createdFileName, "backup-2026-04-23.json");
  assert.equal(result.removedCount, 1);
  assert.deepEqual(removed, ["backup-2026-03-01.json"]);
  assert.equal(announced, true);
});
