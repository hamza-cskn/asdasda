import {
  authMessageResponseSchema,
  reservationCreateRequestSchema,
  reservationListResponseSchema,
  reservationMutationResponseSchema,
  type Reservation
} from "@asys/contracts";
import type { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { notifyUsers } from "../../lib/notifications.js";
import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";
import { hasUnpaidDuesForResident } from "../dues/dues.service.js";

type ReservationStore = {
  listReservations: (input: { actorUserId: string; actorRole: "ADMIN" | "RESIDENT" | "SECURITY" }) => Promise<Reservation[]>;
  createReservation: (input: { residentId: string; commonAreaId: string; startsAt: Date; endsAt: Date; now?: Date }) => Promise<Reservation>;
  cancelReservation: (input: {
    actorUserId: string;
    actorRole: "ADMIN" | "RESIDENT" | "SECURITY";
    reservationId: string;
    now?: Date;
  }) => Promise<Reservation | null>;
};

type ReservationRouterOptions = {
  store?: ReservationStore;
  authMiddleware?: RequestHandler;
};

const reservationParamsSchema = z.object({
  reservationId: z.string().trim().min(1)
});

function toReservation(row: {
  id: string;
  commonAreaId: string;
  commonArea: { name: string };
  residentId: string;
  resident: { name: string };
  startsAt: Date;
  endsAt: Date;
  status: "ACTIVE" | "CANCELLED";
  createdAt: Date;
  cancelledAt: Date | null;
}): Reservation {
  return {
    id: row.id,
    commonAreaId: row.commonAreaId,
    commonAreaName: row.commonArea.name,
    residentId: row.residentId,
    residentName: row.resident.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null
  };
}

function parseTimeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function sameUtcDayRange(date: Date): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)),
    lt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0))
  };
}

function durationHours(startsAt: Date, endsAt: Date): number {
  return (endsAt.getTime() - startsAt.getTime()) / (60 * 60 * 1000);
}

const defaultStore: ReservationStore = {
  async listReservations(input) {
    if (input.actorRole === "SECURITY") {
      return [];
    }

    const where: Prisma.ReservationWhereInput = {};
    if (input.actorRole === "RESIDENT") {
      where.residentId = input.actorUserId;
    }

    const reservations = await prisma.reservation.findMany({
      where,
      select: {
        id: true,
        commonAreaId: true,
        commonArea: {
          select: {
            name: true
          }
        },
        residentId: true,
        resident: {
          select: {
            name: true
          }
        },
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        cancelledAt: true
      },
      orderBy: { startsAt: "desc" }
    });

    return reservations.map((reservation) => toReservation(reservation));
  },

  async createReservation(input) {
    const now = input.now ?? new Date();
    if (await hasUnpaidDuesForResident(input.residentId)) {
      throw Object.assign(new Error("Borcu bulunan sakinler ortak alan rezervasyonu yapamaz."), { statusCode: 409 });
    }

    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw Object.assign(new Error("Bitis zamani baslangictan sonra olmalidir."), { statusCode: 400 });
    }

    if (input.startsAt.getTime() <= now.getTime()) {
      throw Object.assign(new Error("Gecmis saat icin rezervasyon yapilamaz."), { statusCode: 400 });
    }

    const area = await prisma.commonArea.findUnique({
      where: { id: input.commonAreaId },
      select: {
        id: true,
        type: true,
        name: true,
        maxDurationHours: true,
        dailyLimitHours: true,
        opensAt: true,
        closesAt: true
      }
    });

    if (!area) {
      throw Object.assign(new Error("Ortak alan bulunamadi."), { statusCode: 404 });
    }

    const startMinute = input.startsAt.getUTCHours() * 60 + input.startsAt.getUTCMinutes();
    const endMinute = input.endsAt.getUTCHours() * 60 + input.endsAt.getUTCMinutes();
    if (startMinute < parseTimeToMinutes(area.opensAt) || endMinute > parseTimeToMinutes(area.closesAt)) {
      throw Object.assign(new Error("Ortak alanlar 23:00-07:00 arasinda rezerve edilemez."), { statusCode: 409 });
    }

    const requestedHours = durationHours(input.startsAt, input.endsAt);
    if (requestedHours > area.maxDurationHours) {
      throw Object.assign(new Error(`${area.name} icin tek rezervasyon en fazla ${area.maxDurationHours} saat olabilir.`), {
        statusCode: 409
      });
    }

    const dayRange = sameUtcDayRange(input.startsAt);
    const [overlapCount, sameAreaDailyCount, existingDailyReservations] = await Promise.all([
      prisma.reservation.count({
        where: {
          commonAreaId: area.id,
          status: "ACTIVE",
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt }
        }
      }),
      prisma.reservation.count({
        where: {
          commonAreaId: area.id,
          residentId: input.residentId,
          status: "ACTIVE",
          startsAt: dayRange
        }
      }),
      prisma.reservation.findMany({
        where: {
          commonAreaId: area.id,
          residentId: input.residentId,
          status: "ACTIVE",
          startsAt: dayRange
        },
        select: {
          startsAt: true,
          endsAt: true
        }
      })
    ]);

    if (overlapCount > 0) {
      throw Object.assign(new Error("Secilen saat araliginda cakisan rezervasyon var."), { statusCode: 409 });
    }
    if (sameAreaDailyCount > 0) {
      throw Object.assign(new Error("Ayni ortak alan icin gunde en fazla bir rezervasyon yapabilirsiniz."), { statusCode: 409 });
    }

    const existingDailyHours = existingDailyReservations.reduce(
      (total, reservation) => total + durationHours(reservation.startsAt, reservation.endsAt),
      0
    );
    if (existingDailyHours + requestedHours > area.dailyLimitHours) {
      throw Object.assign(new Error(`${area.name} icin gunluk limit ${area.dailyLimitHours} saattir.`), { statusCode: 409 });
    }

    const created = await prisma.reservation.create({
      data: {
        commonAreaId: area.id,
        residentId: input.residentId,
        startsAt: input.startsAt,
        endsAt: input.endsAt
      },
      select: {
        id: true,
        commonAreaId: true,
        commonArea: { select: { name: true } },
        residentId: true,
        resident: { select: { name: true } },
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        cancelledAt: true
      }
    });

    await notifyUsers([input.residentId], {
      title: "Rezervasyon olusturuldu",
      message: `${area.name} rezervasyonunuz kaydedildi.`,
      category: "RESERVATION_CREATED",
      link: "/panel/resident"
    });
    await recordAuditLog({
      userId: input.residentId,
      action: "RESERVATION_CREATED",
      entityType: "reservation",
      entityId: created.id
    });

    return toReservation(created);
  },

  async cancelReservation(input) {
    if (input.actorRole === "SECURITY") {
      throw Object.assign(new Error("Guvenlik rolu rezervasyon iptal edemez."), { statusCode: 403 });
    }

    const existing = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        residentId: true,
        startsAt: true,
        status: true
      }
    });

    if (!existing) {
      return null;
    }

    if (existing.status === "CANCELLED") {
      throw Object.assign(new Error("Rezervasyon zaten iptal edilmis."), { statusCode: 409 });
    }

    if (input.actorRole === "RESIDENT" && existing.residentId !== input.actorUserId) {
      throw Object.assign(new Error("Sadece kendi rezervasyonlarinizi iptal edebilirsiniz."), { statusCode: 403 });
    }

    const now = input.now ?? new Date();
    if (input.actorRole === "RESIDENT" && existing.startsAt.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
      throw Object.assign(new Error("Rezervasyon baslangicina 2 saatten az kala iptal yapilamaz."), { statusCode: 409 });
    }

    const updated = await prisma.reservation.update({
      where: { id: input.reservationId },
      data: {
        status: "CANCELLED",
        cancelledAt: now
      },
      select: {
        id: true,
        commonAreaId: true,
        commonArea: { select: { name: true } },
        residentId: true,
        resident: { select: { name: true } },
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        cancelledAt: true
      }
    });

    await notifyUsers([updated.residentId], {
      title: "Rezervasyon iptal edildi",
      message: `${updated.commonArea.name} rezervasyonunuz iptal edildi.`,
      category: "RESERVATION_CANCELLED",
      link: "/panel/resident"
    });
    await recordAuditLog({
      userId: input.actorUserId,
      action: "RESERVATION_CANCELLED",
      entityType: "reservation",
      entityId: updated.id
    });

    return toReservation(updated);
  }
};

export function createReservationListHandler(store: ReservationStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    try {
      const reservations = await store.listReservations({
        actorUserId: req.authUser.id,
        actorRole: req.authUser.role
      });
      res.status(200).json(reservationListResponseSchema.parse({ reservations }));
    } catch (error) {
      next(error);
    }
  };
}

export function createReservationCreateHandler(store: ReservationStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedBody = reservationCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz rezervasyon verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const reservation = await store.createReservation({
        residentId: req.authUser.id,
        commonAreaId: parsedBody.data.commonAreaId,
        startsAt: new Date(parsedBody.data.startsAt),
        endsAt: new Date(parsedBody.data.endsAt)
      });
      res.status(201).json(reservationMutationResponseSchema.parse({ reservation }));
    } catch (error) {
      next(error);
    }
  };
}

export function createReservationCancelHandler(store: ReservationStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedParams = reservationParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz rezervasyon kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    try {
      const reservation = await store.cancelReservation({
        actorUserId: req.authUser.id,
        actorRole: req.authUser.role,
        reservationId: parsedParams.data.reservationId
      });
      if (!reservation) {
        res.status(404).json({ message: "Rezervasyon bulunamadi." });
        return;
      }

      res.status(200).json(reservationMutationResponseSchema.parse({ reservation }));
    } catch (error) {
      next(error);
    }
  };
}

export function createReservationsRouter(options: ReservationRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", createReservationListHandler(store));
  router.post("/", requireRoles(["RESIDENT"]), createReservationCreateHandler(store));
  router.patch("/:reservationId/cancel", createReservationCancelHandler(store));
  router.delete("/:reservationId", (req, res, next) => createReservationCancelHandler(store)(req, res, next));
  router.get("/rules", (_req, res) => {
    res.status(200).json(
      authMessageResponseSchema.parse({
        success: true,
        message: "Kurallar: 07:00-23:00, cakisma yok, borcluya rezervasyon yok, 2 saat kala iptal yok."
      })
    );
  });

  return router;
}
