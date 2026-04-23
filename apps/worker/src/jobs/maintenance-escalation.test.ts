import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEscalationCutoff,
  MAINTENANCE_ESCALATION_WINDOW_DAYS,
  runMaintenanceEscalationJob,
  type MaintenanceEscalationCandidate,
  type MaintenanceEscalationNotification
} from "./maintenance-escalation.js";

type InMemoryStore = {
  candidates: MaintenanceEscalationCandidate[];
  admins: string[];
  marked: Array<{ requestIds: string[]; escalatedAt: Date }>;
  notifications: MaintenanceEscalationNotification[];
};

function createStore(seed: { candidates: MaintenanceEscalationCandidate[]; admins: string[] }) {
  const state: InMemoryStore = {
    candidates: [...seed.candidates],
    admins: [...seed.admins],
    marked: [],
    notifications: []
  };

  return {
    state,
    store: {
      async listEscalationCandidates(cutoff: Date) {
        return state.candidates.filter((candidate) => candidate.createdAt.getTime() <= cutoff.getTime());
      },
      async markEscalated(requestIds: string[], escalatedAt: Date) {
        state.marked.push({ requestIds: [...requestIds], escalatedAt });
      },
      async listAdminEmails() {
        return [...state.admins];
      },
      async enqueueNotifications(entries: MaintenanceEscalationNotification[]) {
        state.notifications.push(...entries);
      }
    }
  };
}

test("buildEscalationCutoff returns 7-day threshold", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");
  const cutoff = buildEscalationCutoff(now);

  assert.equal(MAINTENANCE_ESCALATION_WINDOW_DAYS, 7);
  assert.equal(cutoff.toISOString(), "2026-04-16T10:00:00.000Z");
});

test("runMaintenanceEscalationJob escalates unanswered requests and notifies admins", async () => {
  const now = new Date("2026-04-23T10:00:00.000Z");
  const fixture = createStore({
    candidates: [
      {
        requestId: "req_1",
        residentName: "Ornek Sakin",
        category: "Su Tesisati",
        createdAt: new Date("2026-04-10T08:00:00.000Z")
      },
      {
        requestId: "req_2",
        residentName: "Diger Sakin",
        category: "Asansor",
        createdAt: new Date("2026-04-11T09:00:00.000Z")
      }
    ],
    admins: ["admin1@asys.local", "admin2@asys.local"]
  });

  const result = await runMaintenanceEscalationJob(fixture.store, now);

  assert.deepEqual(result, {
    escalatedCount: 2,
    notifiedAdminCount: 4
  });
  assert.equal(fixture.state.notifications.length, 4);
  assert.equal(fixture.state.notifications[0]?.category, "MAINTENANCE_ESCALATED_7D");
  assert.equal(fixture.state.marked.length, 1);
  assert.deepEqual(fixture.state.marked[0]?.requestIds, ["req_1", "req_2"]);
  assert.equal(fixture.state.marked[0]?.escalatedAt.toISOString(), now.toISOString());
});

test("runMaintenanceEscalationJob skips notification when there is no overdue request", async () => {
  const now = new Date("2026-04-23T10:00:00.000Z");
  const fixture = createStore({
    candidates: [
      {
        requestId: "req_1",
        residentName: "Ornek Sakin",
        category: "Su Tesisati",
        createdAt: new Date("2026-04-22T08:00:00.000Z")
      }
    ],
    admins: ["admin1@asys.local"]
  });

  const result = await runMaintenanceEscalationJob(fixture.store, now);

  assert.deepEqual(result, {
    escalatedCount: 0,
    notifiedAdminCount: 0
  });
  assert.equal(fixture.state.notifications.length, 0);
  assert.equal(fixture.state.marked.length, 0);
});
