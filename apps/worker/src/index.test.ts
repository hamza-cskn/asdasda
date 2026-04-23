import assert from "node:assert/strict";
import test from "node:test";

import { describeJobs } from "./index.js";

test("worker includes planned slice job shells", () => {
  const jobs = describeJobs();

  assert.ok(jobs.includes("monthly-dues-generation"));
  assert.ok(jobs.includes("backup-rotation"));
  assert.ok(jobs.includes("user-retention-cleanup"));
  assert.equal(jobs.length, 6);
});
