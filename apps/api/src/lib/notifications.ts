import type { NotificationCategory, Role } from "@asys/contracts";

import { prisma } from "./prisma.js";

type NotificationPayload = {
  title: string;
  message: string;
  category: NotificationCategory;
  link?: string | null;
};

export async function notifyUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueUserIds.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      title: payload.title,
      message: payload.message,
      category: payload.category,
      link: payload.link ?? null
    }))
  });
}

export async function notifyRole(role: Role, payload: NotificationPayload): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      role,
      isActive: true
    },
    select: {
      id: true
    }
  });

  await notifyUsers(
    users.map((user) => user.id),
    payload
  );

  return users.length;
}
