import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyDueDate,
  monthKeyFromDate,
  runMonthlyDuesGenerationJob
} from "./monthly-dues-generation.js";

test("buildMonthlyDueDate builds fifth day deadline in UTC", () => {
  const dueDate = buildMonthlyDueDate("2026-04");
  assert.equal(dueDate.toISOString(), "2026-04-05T12:00:00.000Z");
});

test("monthKeyFromDate formats YYYY-MM", () => {
  const key = monthKeyFromDate(new Date("2026-09-12T00:00:00.000Z"));
  assert.equal(key, "2026-09");
});

test("runMonthlyDuesGenerationJob creates records for all apartments", async () => {
  const created: Array<{ apartmentId: string; amount: number; dueDate: Date }> = [];
  const result = await runMonthlyDuesGenerationJob(
    {
      async listApartmentsForDues() {
        return [
          { apartmentId: "apt_1", amount: 1500 },
          { apartmentId: "apt_2", amount: 1750 }
        ];
      },
      async createMonthlyDues(records) {
        created.push(...records);
        return records.length;
      }
    },
    { monthKey: "2026-04" }
  );

  assert.equal(result.monthKey, "2026-04");
  assert.equal(result.generatedCount, 2);
  assert.equal(created.length, 2);
  assert.equal(created[0]?.dueDate.toISOString(), "2026-04-05T12:00:00.000Z");
});
