import {
  announcementCreateRequestSchema,
  announcementListResponseSchema,
  announcementMutationResponseSchema,
  announcementUpdateRequestSchema,
  authMessageResponseSchema
} from "@asys/contracts";
import type { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";

type AnnouncementRecord = {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  authorId: string | null;
  authorName: string | null;
};

type AnnouncementCreateInput = {
  title: string;
  content: string;
  authorId: string;
};

type AnnouncementUpdateInput = {
  title: string;
  content: string;
};

type CreatedAnnouncementResult = {
  announcement: AnnouncementRecord;
  notifiedResidentCount: number;
};

type AnnouncementStore = {
  listAnnouncements: () => Promise<AnnouncementRecord[]>;
  createAnnouncement: (input: AnnouncementCreateInput) => Promise<CreatedAnnouncementResult>;
  updateAnnouncement: (announcementId: string, input: AnnouncementUpdateInput) => Promise<AnnouncementRecord | null>;
  deleteAnnouncement: (announcementId: string) => Promise<boolean>;
  recordAudit?: (input: { userId: string | null; action: string; entityType: string; entityId?: string | null }) => Promise<void>;
};

type AnnouncementRouterOptions = {
  store?: AnnouncementStore;
  authMiddleware?: RequestHandler;
};

const announcementParamsSchema = z.object({
  announcementId: z.string().trim().min(1)
});

type AnnouncementWithAuthorRow = {
  id: string;
  title: string;
  content: string;
  publishedAt: Date;
  authorId: string | null;
  author: {
    name: string;
  } | null;
};

const defaultStore: AnnouncementStore = {
  async listAnnouncements() {
    const { prisma } = await import("../../lib/prisma.js");
    const announcements = await prisma.announcement.findMany({
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        content: true,
        publishedAt: true,
        authorId: true,
        author: {
          select: {
            name: true
          }
        }
      }
    });

    return announcements.map((announcement: AnnouncementWithAuthorRow) => ({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      publishedAt: announcement.publishedAt.toISOString(),
      authorId: announcement.authorId,
      authorName: announcement.author?.name ?? null
    }));
  },

  async createAnnouncement(input) {
    const { prisma } = await import("../../lib/prisma.js");
    const { created, residents } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const residents = await tx.user.findMany({
        where: {
          role: "RESIDENT",
          isActive: true
        },
        select: {
          id: true,
          email: true
        }
      });

      const created = await tx.announcement.create({
        data: {
          title: input.title,
          content: input.content,
          authorId: input.authorId
        },
        select: {
          id: true,
          title: true,
          content: true,
          publishedAt: true,
          authorId: true,
          author: {
            select: {
              name: true
            }
          }
        }
      });

      if (residents.length > 0) {
        await tx.emailOutbox.createMany({
          data: residents.map((resident: { email: string }) => ({
            toEmail: resident.email,
            subject: `Yeni Duyuru: ${created.title}`,
            body: `${created.title}\n\n${created.content}`,
            category: "ANNOUNCEMENT_PUBLISHED"
          }))
        });
        await tx.notification.createMany({
          data: residents.map((resident: { id: string }) => ({
            userId: resident.id,
            title: `Yeni Duyuru: ${created.title}`,
            message: created.content,
            category: "ANNOUNCEMENT_PUBLISHED",
            link: "/panel/resident"
          }))
        });
      }

      return {
        created,
        residents
      };
    });

    return {
      announcement: {
        id: created.id,
        title: created.title,
        content: created.content,
        publishedAt: created.publishedAt.toISOString(),
        authorId: created.authorId,
        authorName: created.author?.name ?? null
      },
      notifiedResidentCount: residents.length
    };
  },

  async updateAnnouncement(announcementId, input) {
    const { prisma } = await import("../../lib/prisma.js");
    const existing = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true }
    });

    if (!existing) {
      return null;
    }

    const updated = await prisma.announcement.update({
      where: { id: announcementId },
      data: {
        title: input.title,
        content: input.content
      },
      select: {
        id: true,
        title: true,
        content: true,
        publishedAt: true,
        authorId: true,
        author: {
          select: {
            name: true
          }
        }
      }
    });

    return {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      publishedAt: updated.publishedAt.toISOString(),
      authorId: updated.authorId,
      authorName: updated.author?.name ?? null
    };
  },

  async deleteAnnouncement(announcementId) {
    const { prisma } = await import("../../lib/prisma.js");
    const deleted = await prisma.announcement.deleteMany({
      where: {
        id: announcementId
      }
    });

    return deleted.count > 0;
  },

  async recordAudit(input) {
    await recordAuditLog(input);
  }
};

export function createListAnnouncementsHandler(store: AnnouncementStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      const announcements = await store.listAnnouncements();
      res.status(200).json(
        announcementListResponseSchema.parse({
          announcements
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createAnnouncementPublishHandler(store: AnnouncementStore): RequestHandler {
  return async (req, res, next) => {
    const parsed = announcementCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Gecersiz duyuru verisi.",
        errors: parsed.error.flatten()
      });
      return;
    }

    const actorId = req.authUser?.id;
    if (!actorId) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    try {
      const created = await store.createAnnouncement({
        title: parsed.data.title,
        content: parsed.data.content,
        authorId: actorId
      });
      await store.recordAudit?.({
        userId: actorId,
        action: "ANNOUNCEMENT_PUBLISHED",
        entityType: "announcement",
        entityId: created.announcement.id
      });

      res.status(201).json(
        announcementMutationResponseSchema.parse({
          announcement: created.announcement
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createAnnouncementUpdateHandler(store: AnnouncementStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = announcementParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        message: "Gecersiz duyuru kimligi.",
        errors: parsedParams.error.flatten()
      });
      return;
    }

    const parsedBody = announcementUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        message: "Gecersiz duyuru verisi.",
        errors: parsedBody.error.flatten()
      });
      return;
    }

    try {
      const updated = await store.updateAnnouncement(parsedParams.data.announcementId, {
        title: parsedBody.data.title,
        content: parsedBody.data.content
      });

      if (!updated) {
        res.status(404).json({
          message: "Duyuru bulunamadi."
        });
        return;
      }

      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "ANNOUNCEMENT_UPDATED",
        entityType: "announcement",
        entityId: updated.id
      });

      res.status(200).json(
        announcementMutationResponseSchema.parse({
          announcement: updated
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createAnnouncementDeleteHandler(store: AnnouncementStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = announcementParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        message: "Gecersiz duyuru kimligi.",
        errors: parsedParams.error.flatten()
      });
      return;
    }

    try {
      const deleted = await store.deleteAnnouncement(parsedParams.data.announcementId);
      if (!deleted) {
        res.status(404).json({
          message: "Duyuru bulunamadi."
        });
        return;
      }

      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "ANNOUNCEMENT_DELETED",
        entityType: "announcement",
        entityId: parsedParams.data.announcementId
      });

      res.status(200).json(
        authMessageResponseSchema.parse({
          success: true,
          message: "Duyuru silindi."
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createAnnouncementRouter(options: AnnouncementRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", createListAnnouncementsHandler(store));
  router.post("/", requireRoles(["ADMIN"]), createAnnouncementPublishHandler(store));
  router.patch("/:announcementId", requireRoles(["ADMIN"]), createAnnouncementUpdateHandler(store));
  router.delete("/:announcementId", requireRoles(["ADMIN"]), createAnnouncementDeleteHandler(store));

  return router;
}
