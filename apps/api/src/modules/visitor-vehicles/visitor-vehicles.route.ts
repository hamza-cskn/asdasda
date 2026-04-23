import {
  visitorVehicleCreateRequestSchema,
  visitorVehicleListResponseSchema,
  visitorVehicleMutationResponseSchema,
  type VisitorVehicle
} from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";
import { apartmentLabel } from "../dues/dues.service.js";

const VISITOR_LIMIT_MS = 4 * 60 * 60 * 1000;

type VisitorVehicleStore = {
  listVehicles: () => Promise<VisitorVehicle[]>;
  registerVehicle: (input: {
    actorUserId: string;
    plate: string;
    apartmentId: string;
    parkingSpotId: string;
    now?: Date;
  }) => Promise<VisitorVehicle>;
  exitVehicle: (input: { actorUserId: string; vehicleId: string; now?: Date }) => Promise<VisitorVehicle | null>;
};

type VisitorVehicleRouterOptions = {
  store?: VisitorVehicleStore;
  authMiddleware?: RequestHandler;
};

const visitorVehicleParamsSchema = z.object({
  vehicleId: z.string().trim().min(1)
});

function toVehicle(row: {
  id: string;
  plate: string;
  apartmentId: string;
  apartment: { block: string; number: string };
  parkingSpotId: string;
  parkingSpot: { spotNumber: string };
  registeredById: string | null;
  registeredBy: { name: string } | null;
  enteredAt: Date;
  exitedAt: Date | null;
}, now: Date = new Date()): VisitorVehicle {
  return {
    id: row.id,
    plate: row.plate,
    apartmentId: row.apartmentId,
    apartmentLabel: apartmentLabel(row.apartment),
    parkingSpotId: row.parkingSpotId,
    parkingSpotNumber: row.parkingSpot.spotNumber,
    registeredById: row.registeredById,
    registeredByName: row.registeredBy?.name ?? null,
    enteredAt: row.enteredAt.toISOString(),
    exitedAt: row.exitedAt?.toISOString() ?? null,
    isOverdue: row.exitedAt === null && now.getTime() - row.enteredAt.getTime() > VISITOR_LIMIT_MS
  };
}

function normalizePlate(plate: string): string {
  return plate.toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
}

const defaultStore: VisitorVehicleStore = {
  async listVehicles() {
    const vehicles = await prisma.visitorVehicle.findMany({
      select: {
        id: true,
        plate: true,
        apartmentId: true,
        apartment: { select: { block: true, number: true } },
        parkingSpotId: true,
        parkingSpot: { select: { spotNumber: true } },
        registeredById: true,
        registeredBy: { select: { name: true } },
        enteredAt: true,
        exitedAt: true
      },
      orderBy: [{ exitedAt: "asc" }, { enteredAt: "desc" }]
    });

    return vehicles.map((vehicle) => toVehicle(vehicle));
  },

  async registerVehicle(input) {
    const plate = normalizePlate(input.plate);
    const activePlateCount = await prisma.visitorVehicle.count({
      where: {
        plate,
        exitedAt: null
      }
    });

    if (activePlateCount > 0) {
      throw Object.assign(new Error("Bu plaka icin aktif ziyaretci kaydi var."), { statusCode: 409 });
    }

    const spot = await prisma.parkingSpot.findUnique({
      where: { id: input.parkingSpotId },
      select: {
        id: true,
        type: true,
        visitorVehicles: {
          where: { exitedAt: null },
          select: { id: true },
          take: 1
        }
      }
    });

    if (!spot) {
      throw Object.assign(new Error("Park yeri bulunamadi."), { statusCode: 404 });
    }
    if (spot.type !== "VISITOR") {
      throw Object.assign(new Error("Ziyaretci araci yalnizca ziyaretci park yerine alinabilir."), { statusCode: 409 });
    }
    if (spot.visitorVehicles.length > 0) {
      throw Object.assign(new Error("Secilen ziyaretci park yeri dolu."), { statusCode: 409 });
    }

    const created = await prisma.visitorVehicle.create({
      data: {
        plate,
        apartmentId: input.apartmentId,
        parkingSpotId: input.parkingSpotId,
        registeredById: input.actorUserId,
        enteredAt: input.now ?? new Date()
      },
      select: {
        id: true,
        plate: true,
        apartmentId: true,
        apartment: { select: { block: true, number: true } },
        parkingSpotId: true,
        parkingSpot: { select: { spotNumber: true } },
        registeredById: true,
        registeredBy: { select: { name: true } },
        enteredAt: true,
        exitedAt: true
      }
    });

    await recordAuditLog({
      userId: input.actorUserId,
      action: "VISITOR_VEHICLE_ENTERED",
      entityType: "visitor_vehicle",
      entityId: created.id,
      details: { plate: created.plate, apartmentId: created.apartmentId }
    });

    return toVehicle(created, input.now);
  },

  async exitVehicle(input) {
    const existing = await prisma.visitorVehicle.findUnique({
      where: { id: input.vehicleId },
      select: {
        id: true,
        exitedAt: true
      }
    });

    if (!existing) {
      return null;
    }
    if (existing.exitedAt) {
      throw Object.assign(new Error("Ziyaretci araci zaten cikis yapmis."), { statusCode: 409 });
    }

    const updated = await prisma.visitorVehicle.update({
      where: { id: input.vehicleId },
      data: { exitedAt: input.now ?? new Date() },
      select: {
        id: true,
        plate: true,
        apartmentId: true,
        apartment: { select: { block: true, number: true } },
        parkingSpotId: true,
        parkingSpot: { select: { spotNumber: true } },
        registeredById: true,
        registeredBy: { select: { name: true } },
        enteredAt: true,
        exitedAt: true
      }
    });

    await recordAuditLog({
      userId: input.actorUserId,
      action: "VISITOR_VEHICLE_EXITED",
      entityType: "visitor_vehicle",
      entityId: updated.id,
      details: { plate: updated.plate }
    });

    return toVehicle(updated, input.now);
  }
};

export function createVisitorVehicleListHandler(store: VisitorVehicleStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.status(200).json(visitorVehicleListResponseSchema.parse({ vehicles: await store.listVehicles() }));
    } catch (error) {
      next(error);
    }
  };
}

export function createVisitorVehicleCreateHandler(store: VisitorVehicleStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedBody = visitorVehicleCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz ziyaretci araci verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const vehicle = await store.registerVehicle({
        actorUserId: req.authUser.id,
        plate: parsedBody.data.plate,
        apartmentId: parsedBody.data.apartmentId,
        parkingSpotId: parsedBody.data.parkingSpotId
      });
      res.status(201).json(visitorVehicleMutationResponseSchema.parse({ vehicle }));
    } catch (error) {
      next(error);
    }
  };
}

export function createVisitorVehicleExitHandler(store: VisitorVehicleStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedParams = visitorVehicleParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz ziyaretci araci kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    try {
      const vehicle = await store.exitVehicle({
        actorUserId: req.authUser.id,
        vehicleId: parsedParams.data.vehicleId
      });
      if (!vehicle) {
        res.status(404).json({ message: "Ziyaretci araci bulunamadi." });
        return;
      }

      res.status(200).json(visitorVehicleMutationResponseSchema.parse({ vehicle }));
    } catch (error) {
      next(error);
    }
  };
}

export function createVisitorVehiclesRouter(options: VisitorVehicleRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", requireRoles(["ADMIN", "SECURITY"]), createVisitorVehicleListHandler(store));
  router.post("/", requireRoles(["SECURITY"]), createVisitorVehicleCreateHandler(store));
  router.patch("/:vehicleId/exit", requireRoles(["SECURITY"]), createVisitorVehicleExitHandler(store));

  return router;
}
