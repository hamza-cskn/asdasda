export const OVERDUE_ADMIN_ESCALATION_MONTHS = 3;

export type OverdueDue = {
  dueId: string;
  apartmentLabel: string;
  residentId: string | null;
  residentEmail: string | null;
  overdueMonths: number;
  outstandingAmount: number;
};

export type ReminderEmail = {
  toEmail: string;
  subject: string;
  body: string;
  category: "DUE_OVERDUE" | "DUE_DEBTOR_3_MONTHS";
};

export type ReminderNotification = {
  userId: string;
  title: string;
  message: string;
  category: "DUE_OVERDUE" | "DUE_DEBTOR_3_MONTHS";
  link: string;
};

export type OverdueReminderStore = {
  listOverdueDues: (now: Date) => Promise<OverdueDue[]>;
  listAdminContacts: () => Promise<Array<{ id: string; email: string }>>;
  enqueueEmails: (entries: ReminderEmail[]) => Promise<void>;
  enqueueNotifications: (entries: ReminderNotification[]) => Promise<void>;
};

export async function runOverdueReminderDispatchJob(
  store: OverdueReminderStore,
  now: Date = new Date()
): Promise<{ remindedResidentCount: number; escalatedAdminCount: number }> {
  const overdueDues = await store.listOverdueDues(now);
  if (overdueDues.length === 0) {
    return {
      remindedResidentCount: 0,
      escalatedAdminCount: 0
    };
  }

  const emails: ReminderEmail[] = [];
  const notifications: ReminderNotification[] = [];
  const residentIds = new Set<string>();
  const adminEscalationDues = overdueDues.filter((due) => due.overdueMonths >= OVERDUE_ADMIN_ESCALATION_MONTHS);

  for (const due of overdueDues) {
    if (due.residentEmail) {
      emails.push({
        toEmail: due.residentEmail,
        subject: `Aidat Gecikme Hatirlatmasi: ${due.apartmentLabel}`,
        body: `${due.apartmentLabel} dairesi icin ${due.outstandingAmount.toFixed(2)} TL borc bulunuyor.`,
        category: "DUE_OVERDUE"
      });
    }

    if (due.residentId) {
      residentIds.add(due.residentId);
      notifications.push({
        userId: due.residentId,
        title: "Aidat odemesi gecikti",
        message: `${due.apartmentLabel} dairenizde gecikmis aidat borcu bulunuyor.`,
        category: "DUE_OVERDUE",
        link: "/panel/resident"
      });
    }
  }

  if (adminEscalationDues.length > 0) {
    const admins = await store.listAdminContacts();
    for (const admin of admins) {
      for (const due of adminEscalationDues) {
        emails.push({
          toEmail: admin.email,
          subject: `3 Aylik Borc Uyarisi: ${due.apartmentLabel}`,
          body: `${due.apartmentLabel} dairesinde en az ${due.overdueMonths} aylik gecikme tespit edildi.`,
          category: "DUE_DEBTOR_3_MONTHS"
        });
      }

      notifications.push({
        userId: admin.id,
        title: "3 aylik aidat borcu",
        message: `${adminEscalationDues.length} dairede 3 ay ve uzeri gecikme var.`,
        category: "DUE_DEBTOR_3_MONTHS",
        link: "/panel/admin"
      });
    }
  }

  if (emails.length > 0) {
    await store.enqueueEmails(emails);
  }
  if (notifications.length > 0) {
    await store.enqueueNotifications(notifications);
  }

  return {
    remindedResidentCount: residentIds.size,
    escalatedAdminCount: adminEscalationDues.length
  };
}
