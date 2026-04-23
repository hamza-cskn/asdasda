import {
  notificationListResponseSchema,
  notificationMutationResponseSchema,
  type Notification
} from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware } from "../../middleware/auth.js";

type NotificationStore = {
  listNotifications: (userId: string) => Promise<{ notifications: Notification[]; unreadCount: number }>;
  markRead: (userId: string, notificationId: string) => Promise<Notification | null>;
};

type NotificationRouterOptions = {
  store?: NotificationStore;
  authMiddleware?: RequestHandler;
};

const notificationParamsSchema = z.object({
  notificationId: z.string().trim().min(1)
});

function toNotification(row: {
  id: string;
  title: string;
  message: string;
  category: Notification["category"];
  isRead: boolean;
  createdAt: Date;
  link: string | null;
}): Notification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    category: row.category,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
    link: row.link
  };
}

const defaultStore: NotificationStore = {
  async listNotifications(userId) {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          message: true,
          category: true,
          isRead: true,
          createdAt: true,
          link: true
        }
      }),
      prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      })
    ]);

    return {
      notifications: notifications.map(toNotification),
      unreadCount
    };
  },

  async markRead(userId, notificationId) {
    const existing = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId
      },
      select: { id: true }
    });

    if (!existing) {
      return null;
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
      select: {
        id: true,
        title: true,
        message: true,
        category: true,
        isRead: true,
        createdAt: true,
        link: true
      }
    });

    return toNotification(updated);
  }
};

export function createListNotificationsHandler(store: NotificationStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    try {
      const payload = await store.listNotifications(req.authUser.id);
      res.status(200).json(notificationListResponseSchema.parse(payload));
    } catch (error) {
      next(error);
    }
  };
}

export function createMarkNotificationReadHandler(store: NotificationStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedParams = notificationParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz bildirim kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    try {
      const notification = await store.markRead(req.authUser.id, parsedParams.data.notificationId);
      if (!notification) {
        res.status(404).json({ message: "Bildirim bulunamadi." });
        return;
      }

      res.status(200).json(notificationMutationResponseSchema.parse({ notification }));
    } catch (error) {
      next(error);
    }
  };
}

export function createNotificationRouter(options: NotificationRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", createListNotificationsHandler(store));
  router.patch("/:notificationId/read", createMarkNotificationReadHandler(store));

  return router;
}
