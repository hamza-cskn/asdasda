import { dashboardResponseSchema, type DashboardSummary } from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";

import { sumMoney, toMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";
import { getDuesTrend, listDebtorApartments } from "../dues/dues.service.js";

type DashboardStore = {
  getDashboard: () => Promise<DashboardSummary>;
};

type DashboardRouterOptions = {
  store?: DashboardStore;
  authMiddleware?: RequestHandler;
};

const defaultStore: DashboardStore = {
  async getDashboard() {
    const [payments, openMaintenanceCount, totalSpots, assignedSpots, activeVisitorSpots, maintenanceRows, recentAnnouncements] =
      await Promise.all([
        prisma.payment.findMany({
          select: { amount: true }
        }),
        prisma.maintenanceRequest.count({
          where: {
            status: {
              in: ["BEKLEMEDE", "ISLEMDE"]
            }
          }
        }),
        prisma.parkingSpot.count(),
        prisma.parkingSpot.count({
          where: {
            apartmentId: {
              not: null
            }
          }
        }),
        prisma.visitorVehicle.count({
          where: {
            exitedAt: null
          }
        }),
        prisma.maintenanceRequest.groupBy({
          by: ["category"],
          _count: {
            category: true
          }
        }),
        prisma.announcement.findMany({
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
          },
          orderBy: { publishedAt: "desc" },
          take: 5
        })
      ]);

    const totalOccupiedSpots = assignedSpots + activeVisitorSpots;
    const occupancyRate = totalSpots === 0 ? 0 : toMoney((totalOccupiedSpots / totalSpots) * 100);

    return {
      totalCollection: sumMoney(payments.map((payment) => toMoney(payment.amount))),
      openMaintenanceCount,
      occupancyRate,
      maintenanceByCategory: maintenanceRows.map((row) => ({
        category: row.category,
        count: row._count.category
      })),
      duesTrend: await getDuesTrend(),
      debtorApartments: await listDebtorApartments(),
      recentAnnouncements: recentAnnouncements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        publishedAt: announcement.publishedAt.toISOString(),
        authorId: announcement.authorId,
        authorName: announcement.author?.name ?? null
      }))
    };
  }
};

export function createDashboardHandler(store: DashboardStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.status(200).json(dashboardResponseSchema.parse({ dashboard: await store.getDashboard() }));
    } catch (error) {
      next(error);
    }
  };
}

export function createDashboardRouter(options: DashboardRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", requireRoles(["ADMIN"]), createDashboardHandler(store));

  return router;
}
