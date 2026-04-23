import {
  maintenanceCreateRequestSchema,
  maintenanceListResponseSchema,
  maintenanceMutationResponseSchema,
  maintenanceRatingUpdateRequestSchema,
  maintenanceStatusSchema,
  maintenanceStatusUpdateRequestSchema
} from "@asys/contracts";
import type { Role } from "@asys/contracts";
import type { Prisma } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { notifyRole, notifyUsers } from "../../lib/notifications.js";
import { persistMaintenancePhoto } from "../../lib/uploads.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";

type MaintenanceStatus = "BEKLEMEDE" | "ISLEMDE" | "TAMAMLANDI";

type MaintenanceRequestRecord = {
  id: string;
  residentId: string;
  residentName: string;
  residentEmail: string;
  category: string;
  description: string;
  photoUrl: string | null;
  status: MaintenanceStatus;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
  responseDueAt: Date | null;
  respondedAt: Date | null;
  escalatedAt: Date | null;
};

type ListMaintenanceRequestsInput = {
  actorRole: Role;
  actorUserId: string;
  category?: string;
  status?: MaintenanceStatus;
  createdFrom?: Date;
  createdTo?: Date;
};

type CreateMaintenanceRequestInput = {
  residentId: string;
  category: string;
  description: string;
  photoUrl: string | null;
};

type EmailOutboxEntry = {
  toEmail: string;
  subject: string;
  body: string;
  category: string;
};

type MaintenanceStore = {
  listMaintenanceRequests: (input: ListMaintenanceRequestsInput) => Promise<MaintenanceRequestRecord[]>;
  countOpenRequestsForResident: (residentId: string) => Promise<number>;
  createMaintenanceRequest: (input: CreateMaintenanceRequestInput) => Promise<MaintenanceRequestRecord>;
  getMaintenanceRequestById: (requestId: string) => Promise<MaintenanceRequestRecord | null>;
  updateMaintenanceStatus: (requestId: string, status: MaintenanceStatus) => Promise<MaintenanceRequestRecord | null>;
  updateMaintenanceRating: (requestId: string, rating: number) => Promise<MaintenanceRequestRecord | null>;
  listActiveAdminEmails: () => Promise<string[]>;
  enqueueEmails: (entries: EmailOutboxEntry[]) => Promise<void>;
  notifyAdmins?: (payload: { title: string; message: string }) => Promise<void>;
  notifyResident?: (residentId: string, payload: { title: string; message: string }) => Promise<void>;
  recordAudit?: (input: { userId: string | null; action: string; entityType: string; entityId?: string | null }) => Promise<void>;
};

type MaintenanceRouterOptions = {
  store?: MaintenanceStore;
  authMiddleware?: RequestHandler;
};

const OPEN_STATUSES: MaintenanceStatus[] = ["BEKLEMEDE", "ISLEMDE"];
const MAX_OPEN_REQUESTS = 3;
const EMERGENCY_RESPONSE_HOURS = 2;

const requestIdParamsSchema = z.object({
  requestId: z.string().trim().min(1)
});

const adminMaintenanceListQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(80).optional(),
    status: maintenanceStatusSchema.optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Baslangic tarihi YYYY-AA-GG formatinda olmalidir.")
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitis tarihi YYYY-AA-GG formatinda olmalidir.")
      .optional()
  })
  .strict();

type DefaultSelectRow = {
  id: string;
  residentId: string;
  resident: {
    name: string;
    email: string;
  };
  category: string;
  description: string;
  photoUrl: string | null;
  status: MaintenanceStatus;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
  responseDueAt: Date | null;
  respondedAt: Date | null;
  escalatedAt: Date | null;
};

function isEmergencyCategory(category: string): boolean {
  const normalized = category.toLocaleLowerCase("tr-TR");
  return ["gaz", "kacak", "sizinti", "su bask", "tasma", "yangin", "elektrik", "acil"].some((token) =>
    normalized.includes(token)
  );
}

function getEmergencyResponseDueAt(category: string, createdAt: Date): Date | null {
  if (!isEmergencyCategory(category)) {
    return null;
  }

  return new Date(createdAt.getTime() + EMERGENCY_RESPONSE_HOURS * 60 * 60 * 1000);
}

function toRecord(row: DefaultSelectRow): MaintenanceRequestRecord {
  return {
    id: row.id,
    residentId: row.residentId,
    residentName: row.resident.name,
    residentEmail: row.resident.email,
    category: row.category,
    description: row.description,
    photoUrl: row.photoUrl,
    status: row.status,
    rating: row.rating,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    responseDueAt: row.responseDueAt,
    respondedAt: row.respondedAt,
    escalatedAt: row.escalatedAt
  };
}

const defaultStore: MaintenanceStore = {
  async listMaintenanceRequests(input) {
    const { prisma } = await import("../../lib/prisma.js");
    const where: Prisma.MaintenanceRequestWhereInput = {};

    if (input.actorRole === "RESIDENT") {
      where.residentId = input.actorUserId;
    }

    if (input.category) {
      where.category = {
        contains: input.category,
        mode: "insensitive"
      };
    }

    if (input.status) {
      where.status = input.status;
    }

    if (input.createdFrom || input.createdTo) {
      where.createdAt = {};
      if (input.createdFrom) {
        where.createdAt.gte = input.createdFrom;
      }
      if (input.createdTo) {
        where.createdAt.lte = input.createdTo;
      }
    }

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      select: {
        id: true,
        residentId: true,
        resident: {
          select: {
            name: true,
            email: true
          }
        },
        category: true,
        description: true,
        photoUrl: true,
        status: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        responseDueAt: true,
        respondedAt: true,
        escalatedAt: true
      },
      orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }]
    });

    return requests.map((request: DefaultSelectRow) => toRecord(request));
  },

  async countOpenRequestsForResident(residentId) {
    const { prisma } = await import("../../lib/prisma.js");
    return prisma.maintenanceRequest.count({
      where: {
        residentId,
        status: {
          in: OPEN_STATUSES
        }
      }
    });
  },

  async createMaintenanceRequest(input) {
    const { prisma } = await import("../../lib/prisma.js");
    const created = await prisma.maintenanceRequest.create({
      data: {
        residentId: input.residentId,
        category: input.category,
        description: input.description,
        photoUrl: input.photoUrl,
        responseDueAt: getEmergencyResponseDueAt(input.category, new Date())
      },
      select: {
        id: true,
        residentId: true,
        resident: {
          select: {
            name: true,
            email: true
          }
        },
        category: true,
        description: true,
        photoUrl: true,
        status: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        responseDueAt: true,
        respondedAt: true,
        escalatedAt: true
      }
    });

    return toRecord(created as DefaultSelectRow);
  },

  async getMaintenanceRequestById(requestId) {
    const { prisma } = await import("../../lib/prisma.js");
    const request = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        residentId: true,
        resident: {
          select: {
            name: true,
            email: true
          }
        },
        category: true,
        description: true,
        photoUrl: true,
        status: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        responseDueAt: true,
        respondedAt: true,
        escalatedAt: true
      }
    });

    return request ? toRecord(request as DefaultSelectRow) : null;
  },

  async updateMaintenanceStatus(requestId, status) {
    const { prisma } = await import("../../lib/prisma.js");

    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, respondedAt: true }
    });

    if (!existing) {
      return null;
    }

    const data: { status: MaintenanceStatus; respondedAt?: Date } = {
      status
    };
    if (existing.respondedAt === null && existing.status === "BEKLEMEDE" && status !== "BEKLEMEDE") {
      data.respondedAt = new Date();
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data,
      select: {
        id: true,
        residentId: true,
        resident: {
          select: {
            name: true,
            email: true
          }
        },
        category: true,
        description: true,
        photoUrl: true,
        status: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        responseDueAt: true,
        respondedAt: true,
        escalatedAt: true
      }
    });

    return toRecord(updated as DefaultSelectRow);
  },

  async updateMaintenanceRating(requestId, rating) {
    const { prisma } = await import("../../lib/prisma.js");
    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      select: { id: true }
    });

    if (!existing) {
      return null;
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        rating
      },
      select: {
        id: true,
        residentId: true,
        resident: {
          select: {
            name: true,
            email: true
          }
        },
        category: true,
        description: true,
        photoUrl: true,
        status: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        responseDueAt: true,
        respondedAt: true,
        escalatedAt: true
      }
    });

    return toRecord(updated as DefaultSelectRow);
  },

  async listActiveAdminEmails() {
    const { prisma } = await import("../../lib/prisma.js");
    const admins = await prisma.user.findMany({
      where: {
        role: "ADMIN",
        isActive: true
      },
      select: {
        email: true
      }
    });

    return admins.map((admin: { email: string }) => admin.email);
  },

  async enqueueEmails(entries) {
    if (entries.length === 0) {
      return;
    }

    const { prisma } = await import("../../lib/prisma.js");
    await prisma.emailOutbox.createMany({
      data: entries.map((entry) => ({
        toEmail: entry.toEmail,
        subject: entry.subject,
        body: entry.body,
        category: entry.category
      }))
    });
  },

  async notifyAdmins(payload) {
    await notifyRole("ADMIN", {
      title: payload.title,
      message: payload.message,
      category: "MAINTENANCE_REQUEST_CREATED",
      link: "/panel/admin"
    });
  },

  async notifyResident(residentId, payload) {
    await notifyUsers([residentId], {
      title: payload.title,
      message: payload.message,
      category: "MAINTENANCE_STATUS_UPDATED",
      link: "/panel/resident"
    });
  },

  async recordAudit(input) {
    await recordAuditLog(input);
  }
};

function toResponseRecord(record: MaintenanceRequestRecord) {
  return {
    id: record.id,
    residentId: record.residentId,
    residentName: record.residentName,
    category: record.category,
    description: record.description,
    photoUrl: record.photoUrl,
    status: record.status,
    rating: record.rating,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    responseDueAt: record.responseDueAt?.toISOString() ?? null,
    respondedAt: record.respondedAt?.toISOString() ?? null,
    escalatedAt: record.escalatedAt?.toISOString() ?? null
  };
}

function parseOptionalQueryValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0].trim();
  }

  return undefined;
}

function parseDateOnly(value: string, mode: "start" | "end"): Date {
  const suffix = mode === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  return new Date(`${value}${suffix}`);
}

function parseAdminFilters(req: Request) {
  const rawFilters: Record<string, string> = {};
  const category = parseOptionalQueryValue(req.query.category);
  const status = parseOptionalQueryValue(req.query.status);
  const dateFromQuery = parseOptionalQueryValue(req.query.dateFrom);
  const dateToQuery = parseOptionalQueryValue(req.query.dateTo);

  if (category) {
    rawFilters.category = category;
  }
  if (status) {
    rawFilters.status = status;
  }
  if (dateFromQuery) {
    rawFilters.dateFrom = dateFromQuery;
  }
  if (dateToQuery) {
    rawFilters.dateTo = dateToQuery;
  }

  const parsed = adminMaintenanceListQuerySchema.safeParse(rawFilters);

  if (!parsed.success) {
    return {
      ok: false as const,
      statusCode: 400,
      body: {
        message: "Gecersiz bakim filtre parametreleri.",
        errors: parsed.error.flatten()
      }
    };
  }

  const dateFrom = parsed.data.dateFrom ? parseDateOnly(parsed.data.dateFrom, "start") : undefined;
  const dateTo = parsed.data.dateTo ? parseDateOnly(parsed.data.dateTo, "end") : undefined;

  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    return {
      ok: false as const,
      statusCode: 400,
      body: {
        message: "Baslangic tarihi bitis tarihinden buyuk olamaz."
      }
    };
  }

  const filters: {
    category?: string;
    status?: MaintenanceStatus;
    createdFrom?: Date;
    createdTo?: Date;
  } = {};

  if (parsed.data.category) {
    filters.category = parsed.data.category;
  }
  if (parsed.data.status) {
    filters.status = parsed.data.status;
  }
  if (dateFrom) {
    filters.createdFrom = dateFrom;
  }
  if (dateTo) {
    filters.createdTo = dateTo;
  }

  return {
    ok: true as const,
    filters
  };
}

export function createListMaintenanceRequestsHandler(store: MaintenanceStore): RequestHandler {
  return async (req, res, next) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    let filters: {
      category?: string;
      status?: MaintenanceStatus;
      createdFrom?: Date;
      createdTo?: Date;
    } = {};

    if (authUser.role === "ADMIN") {
      const parsedFilters = parseAdminFilters(req);
      if (!parsedFilters.ok) {
        res.status(parsedFilters.statusCode).json(parsedFilters.body);
        return;
      }

      filters = parsedFilters.filters;
    }

    try {
      const requests = await store.listMaintenanceRequests({
        actorRole: authUser.role,
        actorUserId: authUser.id,
        ...filters
      });

      res.status(200).json(
        maintenanceListResponseSchema.parse({
          requests: requests.map((request) => toResponseRecord(request))
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createMaintenanceRequestCreateHandler(store: MaintenanceStore): RequestHandler {
  return async (req, res, next) => {
    const parsedBody = maintenanceCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        message: "Gecersiz bakim talebi verisi.",
        errors: parsedBody.error.flatten()
      });
      return;
    }

    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    try {
      const openRequestCount = await store.countOpenRequestsForResident(authUser.id);
      if (openRequestCount >= MAX_OPEN_REQUESTS) {
        res.status(409).json({
          message: "Ayni anda en fazla 3 acik bakim talebi olusturabilirsiniz."
        });
        return;
      }

      const persistedPhotoUrl = await persistMaintenancePhoto(parsedBody.data.photoUrl);
      const created = await store.createMaintenanceRequest({
        residentId: authUser.id,
        category: parsedBody.data.category.trim(),
        description: parsedBody.data.description.trim(),
        photoUrl: persistedPhotoUrl
      });

      const adminEmails = await store.listActiveAdminEmails();
      await store.enqueueEmails(
        adminEmails.map((email) => ({
          toEmail: email,
          subject: `Yeni Bakim Talebi: ${created.category}`,
          body: `Talep Sahibi: ${created.residentName}\nKategori: ${created.category}\nDurum: ${created.status}`,
          category: "MAINTENANCE_REQUEST_CREATED"
        }))
      );
      await store.notifyAdmins?.({
        title: `Yeni Bakim Talebi: ${created.category}`,
        message: `${created.residentName} yeni bir bakim talebi olusturdu.`
      });
      await store.recordAudit?.({
        userId: authUser.id,
        action: "MAINTENANCE_REQUEST_CREATED",
        entityType: "maintenance_request",
        entityId: created.id
      });

      res.status(201).json(
        maintenanceMutationResponseSchema.parse({
          request: toResponseRecord(created)
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createMaintenanceStatusUpdateHandler(store: MaintenanceStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = requestIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        message: "Gecersiz bakim talebi kimligi.",
        errors: parsedParams.error.flatten()
      });
      return;
    }

    const parsedBody = maintenanceStatusUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        message: "Gecersiz bakim durumu verisi.",
        errors: parsedBody.error.flatten()
      });
      return;
    }

    try {
      const existing = await store.getMaintenanceRequestById(parsedParams.data.requestId);
      if (!existing) {
        res.status(404).json({
          message: "Bakim talebi bulunamadi."
        });
        return;
      }

      const updated = await store.updateMaintenanceStatus(parsedParams.data.requestId, parsedBody.data.status);
      if (!updated) {
        res.status(404).json({
          message: "Bakim talebi bulunamadi."
        });
        return;
      }

      if (existing.status !== updated.status) {
        await store.enqueueEmails([
          {
            toEmail: updated.residentEmail,
            subject: `Bakim Talebi Durum Guncellemesi: ${updated.status}`,
            body: `${updated.category} kategorisindeki talebinizin yeni durumu: ${updated.status}`,
            category: "MAINTENANCE_STATUS_UPDATED"
          }
        ]);
        await store.notifyResident?.(updated.residentId, {
          title: `Bakim Talebi: ${updated.status}`,
          message: `${updated.category} talebinizin durumu guncellendi.`
        });
      }

      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "MAINTENANCE_STATUS_UPDATED",
        entityType: "maintenance_request",
        entityId: updated.id
      });

      res.status(200).json(
        maintenanceMutationResponseSchema.parse({
          request: toResponseRecord(updated)
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createMaintenanceRatingUpdateHandler(store: MaintenanceStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = requestIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        message: "Gecersiz bakim talebi kimligi.",
        errors: parsedParams.error.flatten()
      });
      return;
    }

    const parsedBody = maintenanceRatingUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        message: "Gecersiz bakim degerlendirme verisi.",
        errors: parsedBody.error.flatten()
      });
      return;
    }

    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    try {
      const existing = await store.getMaintenanceRequestById(parsedParams.data.requestId);
      if (!existing) {
        res.status(404).json({
          message: "Bakim talebi bulunamadi."
        });
        return;
      }

      if (existing.residentId !== authUser.id) {
        res.status(403).json({
          message: "Sadece kendi bakim taleplerinizi degerlendirebilirsiniz."
        });
        return;
      }

      if (existing.status !== "TAMAMLANDI") {
        res.status(409).json({
          message: "Sadece tamamlanan bakim talepleri degerlendirilebilir."
        });
        return;
      }

      const updated = await store.updateMaintenanceRating(parsedParams.data.requestId, parsedBody.data.rating);
      if (!updated) {
        res.status(404).json({
          message: "Bakim talebi bulunamadi."
        });
        return;
      }

      await store.recordAudit?.({
        userId: authUser.id,
        action: "MAINTENANCE_RATED",
        entityType: "maintenance_request",
        entityId: updated.id
      });

      res.status(200).json(
        maintenanceMutationResponseSchema.parse({
          request: toResponseRecord(updated)
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createMaintenanceRouter(options: MaintenanceRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);

  router.get("/", createListMaintenanceRequestsHandler(store));
  router.post("/", requireRoles(["RESIDENT"]), createMaintenanceRequestCreateHandler(store));
  router.patch("/:requestId/status", requireRoles(["ADMIN"]), createMaintenanceStatusUpdateHandler(store));
  router.patch("/:requestId/rating", requireRoles(["RESIDENT"]), createMaintenanceRatingUpdateHandler(store));

  return router;
}
