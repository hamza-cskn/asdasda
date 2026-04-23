export const MAINTENANCE_ESCALATION_WINDOW_DAYS = 7;

export type MaintenanceEscalationCandidate = {
  requestId: string;
  residentName: string;
  category: string;
  createdAt: Date;
};

export type MaintenanceEscalationNotification = {
  toEmail: string;
  subject: string;
  body: string;
  category: "MAINTENANCE_ESCALATED_7D";
};

export type MaintenanceEscalationStore = {
  listEscalationCandidates: (cutoff: Date) => Promise<MaintenanceEscalationCandidate[]>;
  markEscalated: (requestIds: string[], escalatedAt: Date) => Promise<void>;
  listAdminEmails: () => Promise<string[]>;
  enqueueNotifications: (entries: MaintenanceEscalationNotification[]) => Promise<void>;
};

export function buildEscalationCutoff(now: Date): Date {
  return new Date(now.getTime() - MAINTENANCE_ESCALATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export async function runMaintenanceEscalationJob(
  store: MaintenanceEscalationStore,
  now: Date = new Date()
): Promise<{ escalatedCount: number; notifiedAdminCount: number }> {
  const cutoff = buildEscalationCutoff(now);
  const candidates = await store.listEscalationCandidates(cutoff);

  if (candidates.length === 0) {
    return {
      escalatedCount: 0,
      notifiedAdminCount: 0
    };
  }

  const adminEmails = await store.listAdminEmails();
  const notifications: MaintenanceEscalationNotification[] = [];

  for (const candidate of candidates) {
    for (const toEmail of adminEmails) {
      notifications.push({
        toEmail,
        subject: `7 Gunu Asan Bakim Talebi: ${candidate.category}`,
        body: `Talep ID: ${candidate.requestId}\nSakin: ${candidate.residentName}\nOlusturma: ${candidate.createdAt.toISOString()}`,
        category: "MAINTENANCE_ESCALATED_7D"
      });
    }
  }

  if (notifications.length > 0) {
    await store.enqueueNotifications(notifications);
  }

  await store.markEscalated(
    candidates.map((candidate) => candidate.requestId),
    now
  );

  return {
    escalatedCount: candidates.length,
    notifiedAdminCount: notifications.length
  };
}
