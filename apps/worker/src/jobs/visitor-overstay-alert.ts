export const VISITOR_MAX_DURATION_HOURS = 4;

export type VisitorOverstayCandidate = {
  visitorVehicleId: string;
  plate: string;
  apartmentLabel: string;
  enteredAt: Date;
  parkingSpotNumber: string;
};

export type VisitorOverstayAlert = {
  userId: string;
  title: string;
  message: string;
  category: "VISITOR_OVERSTAY";
  link: string;
};

export type VisitorOverstayEmail = {
  toEmail: string;
  subject: string;
  body: string;
  category: "VISITOR_OVERSTAY";
};

export type VisitorOverstayStore = {
  listOverstayCandidates: (cutoff: Date) => Promise<VisitorOverstayCandidate[]>;
  listSecurityContacts: () => Promise<Array<{ id: string; email: string }>>;
  enqueueAlerts: (alerts: VisitorOverstayAlert[]) => Promise<void>;
  enqueueEmails: (emails: VisitorOverstayEmail[]) => Promise<void>;
  markAlerted: (vehicleIds: string[], alertedAt: Date) => Promise<void>;
};

export function buildVisitorOverstayCutoff(now: Date): Date {
  return new Date(now.getTime() - VISITOR_MAX_DURATION_HOURS * 60 * 60 * 1000);
}

export async function runVisitorOverstayAlertJob(
  store: VisitorOverstayStore,
  now: Date = new Date()
): Promise<{ overstayCount: number; alertCount: number }> {
  const cutoff = buildVisitorOverstayCutoff(now);
  const candidates = await store.listOverstayCandidates(cutoff);
  if (candidates.length === 0) {
    return {
      overstayCount: 0,
      alertCount: 0
    };
  }

  const securityContacts = await store.listSecurityContacts();
  if (securityContacts.length === 0) {
    return {
      overstayCount: candidates.length,
      alertCount: 0
    };
  }

  const alerts: VisitorOverstayAlert[] = [];
  const emails: VisitorOverstayEmail[] = [];

  for (const candidate of candidates) {
    for (const securityContact of securityContacts) {
      alerts.push({
        userId: securityContact.id,
        title: "Ziyaretci sure asimi uyarisi",
        message: `${candidate.plate} plakali arac (${candidate.apartmentLabel}) ${candidate.parkingSpotNumber} alaninda 4 saati asti.`,
        category: "VISITOR_OVERSTAY",
        link: "/panel/security"
      });
      emails.push({
        toEmail: securityContact.email,
        subject: `Ziyaretci Sure Asimi: ${candidate.plate}`,
        body: `${candidate.plate} plakasi 4 saat sinirini asti. Park: ${candidate.parkingSpotNumber}, Daire: ${candidate.apartmentLabel}`,
        category: "VISITOR_OVERSTAY"
      });
    }
  }

  await store.enqueueAlerts(alerts);
  await store.enqueueEmails(emails);
  await store.markAlerted(
    candidates.map((candidate) => candidate.visitorVehicleId),
    now
  );

  return {
    overstayCount: candidates.length,
    alertCount: alerts.length
  };
}
