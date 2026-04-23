import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVisitorOverstayCutoff,
  runVisitorOverstayAlertJob,
  VISITOR_MAX_DURATION_HOURS
} from "./visitor-overstay-alert.js";

test("buildVisitorOverstayCutoff returns 4-hour threshold", () => {
  const cutoff = buildVisitorOverstayCutoff(new Date("2026-04-23T10:00:00.000Z"));
  assert.equal(VISITOR_MAX_DURATION_HOURS, 4);
  assert.equal(cutoff.toISOString(), "2026-04-23T06:00:00.000Z");
});

test("runVisitorOverstayAlertJob notifies security and marks vehicles", async () => {
  const alerts: Array<{ userId: string }> = [];
  const emails: Array<{ toEmail: string }> = [];
  const marked: string[][] = [];

  const result = await runVisitorOverstayAlertJob(
    {
      async listOverstayCandidates() {
        return [
          {
            visitorVehicleId: "veh_1",
            plate: "34ABC123",
            apartmentLabel: "A-1",
            enteredAt: new Date("2026-04-23T01:00:00.000Z"),
            parkingSpotNumber: "MIS-01"
          }
        ];
      },
      async listSecurityContacts() {
        return [
          { id: "usr_sec_1", email: "sec1@asys.local" },
          { id: "usr_sec_2", email: "sec2@asys.local" }
        ];
      },
      async enqueueAlerts(entries) {
        alerts.push(...entries);
      },
      async enqueueEmails(entries) {
        emails.push(...entries);
      },
      async markAlerted(vehicleIds) {
        marked.push(vehicleIds);
      }
    },
    new Date("2026-04-23T10:00:00.000Z")
  );

  assert.equal(result.overstayCount, 1);
  assert.equal(result.alertCount, 2);
  assert.equal(alerts.length, 2);
  assert.equal(emails.length, 2);
  assert.deepEqual(marked[0], ["veh_1"]);
});
