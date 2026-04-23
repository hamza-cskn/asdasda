import {
  parkingSpotAssignmentRequestSchema,
  parkingSpotListResponseSchema,
  parkingSpotMutationResponseSchema,
  type ParkingSpot
} from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";
import { apartmentLabel } from "../dues/dues.service.js";

type ParkingSpotStore = {
  listSpots: () => Promise<ParkingSpot[]>;
  assignSpot: (input: { actorUserId: string; parkingSpotId: string; apartmentId: string | null }) => Promise<ParkingSpot | null>;
};

type ParkingSpotRouterOptions = {
  store?: ParkingSpotStore;
  authMiddleware?: RequestHandler;
};

const parkingSpotParamsSchema = z.object({
  parkingSpotId: z.string().trim().min(1)
});

function toSpot(row: {
  id: string;
  spotNumber: string;
  type: ParkingSpot["type"];
  apartmentId: string | null;
  apartment: { block: string; number: string } | null;
  visitorVehicles: Array<{ plate: string; exitedAt: Date | null }>;
}): ParkingSpot {
  const activeVisitor = row.visitorVehicles.find((vehicle) => vehicle.exitedAt === null);
  return {
    id: row.id,
    spotNumber: row.spotNumber,
    type: row.type,
    apartmentId: row.apartmentId,
    apartmentLabel: row.apartment ? apartmentLabel(row.apartment) : null,
    isOccupied: Boolean(row.apartmentId || activeVisitor),
    occupiedByPlate: activeVisitor?.plate ?? null
  };
}

const defaultStore: ParkingSpotStore = {
  async listSpots() {
    const spots = await prisma.parkingSpot.findMany({
      select: {
        id: true,
        spotNumber: true,
        type: true,
        apartmentId: true,
        apartment: {
          select: {
            block: true,
            number: true
          }
        },
        visitorVehicles: {
          where: {
            exitedAt: null
          },
          select: {
            plate: true,
            exitedAt: true
          },
          take: 1
        }
      },
      orderBy: { spotNumber: "asc" }
    });

    return spots.map(toSpot);
  },

  async assignSpot(input) {
    const existing = await prisma.parkingSpot.findUnique({
      where: { id: input.parkingSpotId },
      select: {
        id: true,
        type: true,
        apartmentId: true
      }
    });

    if (!existing) {
      return null;
    }

    if (existing.type === "VISITOR") {
      throw Object.assign(new Error("Ziyaretci park alanlari daireye atanamaz."), { statusCode: 409 });
    }

    if (existing.type === "ACCESSIBLE" && existing.apartmentId && existing.apartmentId !== input.apartmentId) {
      throw Object.assign(new Error("Engelli park alanlari baska daireye yeniden atanamaz."), { statusCode: 409 });
    }

    if (input.apartmentId) {
      const assignedCount = await prisma.parkingSpot.count({
        where: {
          apartmentId: input.apartmentId,
          type: {
            not: "VISITOR"
          },
          id: {
            not: input.parkingSpotId
          }
        }
      });

      if (assignedCount >= 2) {
        throw Object.assign(new Error("Bir daireye en fazla 2 park yeri atanabilir."), { statusCode: 409 });
      }
    }

    const updated = await prisma.parkingSpot.update({
      where: { id: input.parkingSpotId },
      data: {
        apartmentId: input.apartmentId
      },
      select: {
        id: true,
        spotNumber: true,
        type: true,
        apartmentId: true,
        apartment: {
          select: {
            block: true,
            number: true
          }
        },
        visitorVehicles: {
          where: {
            exitedAt: null
          },
          select: {
            plate: true,
            exitedAt: true
          },
          take: 1
        }
      }
    });

    await recordAuditLog({
      userId: input.actorUserId,
      action: "PARKING_SPOT_ASSIGNED",
      entityType: "parking_spot",
      entityId: updated.id,
      details: { apartmentId: updated.apartmentId }
    });

    return toSpot(updated);
  }
};

export function createParkingSpotListHandler(store: ParkingSpotStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.status(200).json(parkingSpotListResponseSchema.parse({ spots: await store.listSpots() }));
    } catch (error) {
      next(error);
    }
  };
}

export function createParkingSpotAssignmentHandler(store: ParkingSpotStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedParams = parkingSpotParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz park yeri kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    const parsedBody = parkingSpotAssignmentRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz park atama verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const spot = await store.assignSpot({
        actorUserId: req.authUser.id,
        parkingSpotId: parsedParams.data.parkingSpotId,
        apartmentId: parsedBody.data.apartmentId
      });

      if (!spot) {
        res.status(404).json({ message: "Park yeri bulunamadi." });
        return;
      }

      res.status(200).json(parkingSpotMutationResponseSchema.parse({ spot }));
    } catch (error) {
      next(error);
    }
  };
}

export function createParkingSpotsRouter(options: ParkingSpotRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", requireRoles(["ADMIN", "SECURITY"]), createParkingSpotListHandler(store));
  router.patch("/:parkingSpotId/assignment", requireRoles(["ADMIN"]), createParkingSpotAssignmentHandler(store));

  return router;
}
