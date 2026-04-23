export const USER_RETENTION_MONTHS = 6;

export type RetentionCandidate = {
  userId: string;
  apartmentId: string | null;
};

export type UserRetentionStore = {
  listRetentionCandidates: (cutoff: Date) => Promise<RetentionCandidate[]>;
  markApartmentsVacant: (apartmentIds: string[]) => Promise<void>;
  deleteUsers: (userIds: string[]) => Promise<number>;
  appendRetentionAudit: (userIds: string[], now: Date) => Promise<void>;
};

export function buildUserRetentionCutoff(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - USER_RETENTION_MONTHS,
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds()
    )
  );
}

export async function runUserRetentionCleanupJob(
  store: UserRetentionStore,
  now: Date = new Date()
): Promise<{ deletedCount: number }> {
  const cutoff = buildUserRetentionCutoff(now);
  const candidates = await store.listRetentionCandidates(cutoff);
  if (candidates.length === 0) {
    return { deletedCount: 0 };
  }

  const userIds = candidates.map((candidate) => candidate.userId);
  const apartmentIds = [...new Set(candidates.map((candidate) => candidate.apartmentId).filter(Boolean) as string[])];
  if (apartmentIds.length > 0) {
    await store.markApartmentsVacant(apartmentIds);
  }

  const deletedCount = await store.deleteUsers(userIds);
  if (deletedCount > 0) {
    await store.appendRetentionAudit(userIds, now);
  }

  return {
    deletedCount
  };
}
