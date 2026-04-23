import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma.js";

type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
};

export async function recordAuditLog(input: AuditInput): Promise<void> {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null
  };

  if (input.details !== undefined) {
    data.details = input.details;
  }

  await prisma.auditLog.create({
    data
  });
}
