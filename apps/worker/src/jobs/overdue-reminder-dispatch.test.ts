import assert from "node:assert/strict";
import test from "node:test";

import {
  OVERDUE_ADMIN_ESCALATION_MONTHS,
  runOverdueReminderDispatchJob
} from "./overdue-reminder-dispatch.js";

test("runOverdueReminderDispatchJob sends resident reminders and admin escalation", async () => {
  const emails: Array<{ toEmail: string; category: string }> = [];
  const notifications: Array<{ userId: string; category: string }> = [];

  const result = await runOverdueReminderDispatchJob(
    {
      async listOverdueDues() {
        return [
          {
            dueId: "due_1",
            apartmentLabel: "A-1",
            residentId: "usr_resident_1",
            residentEmail: "resident1@asys.local",
            overdueMonths: 1,
            outstandingAmount: 2000
          },
          {
            dueId: "due_2",
            apartmentLabel: "A-2",
            residentId: "usr_resident_2",
            residentEmail: "resident2@asys.local",
            overdueMonths: OVERDUE_ADMIN_ESCALATION_MONTHS,
            outstandingAmount: 3500
          }
        ];
      },
      async listAdminContacts() {
        return [{ id: "usr_admin", email: "admin@asys.local" }];
      },
      async enqueueEmails(entries) {
        emails.push(...entries);
      },
      async enqueueNotifications(entries) {
        notifications.push(...entries);
      }
    },
    new Date("2026-04-23T10:00:00.000Z")
  );

  assert.equal(result.remindedResidentCount, 2);
  assert.equal(result.escalatedAdminCount, 1);
  assert.equal(emails.length, 3);
  assert.ok(emails.some((entry) => entry.category === "DUE_DEBTOR_3_MONTHS"));
  assert.ok(notifications.some((entry) => entry.userId === "usr_admin"));
});

test("runOverdueReminderDispatchJob no-ops when overdue list is empty", async () => {
  let emailCount = 0;
  let notificationCount = 0;

  const result = await runOverdueReminderDispatchJob({
    async listOverdueDues() {
      return [];
    },
    async listAdminContacts() {
      return [];
    },
    async enqueueEmails(entries) {
      emailCount += entries.length;
    },
    async enqueueNotifications(entries) {
      notificationCount += entries.length;
    }
  });

  assert.deepEqual(result, { remindedResidentCount: 0, escalatedAdminCount: 0 });
  assert.equal(emailCount, 0);
  assert.equal(notificationCount, 0);
});
