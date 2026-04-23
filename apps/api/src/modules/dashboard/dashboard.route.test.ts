import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardSummary } from "@asys/contracts";
import { dashboardResponseSchema } from "@asys/contracts";
import express, { type RequestHandler } from "express";
import request from "supertest";

import { createDashboardRouter } from "./dashboard.route.js";

const sampleDashboard: DashboardSummary = {
  totalCollection: 3000,
  openMaintenanceCount: 2,
  occupancyRate: 42.5,
  maintenanceByCategory: [
    { category: "Elektrik", count: 2 },
    { category: "Su", count: 1 }
  ],
  duesTrend: [
    { month: "2026-03", collectedAmount: 1500 },
    { month: "2026-04", collectedAmount: 1500 }
  ],
  debtorApartments: [
    {
      apartmentId: "apt_a1",
      apartmentLabel: "A-1",
      outstandingAmount: 1530,
      overdueCount: 1
    }
  ],
  recentAnnouncements: [
    {
      id: "ann_1",
      title: "Bakim Duyurusu",
      content: "Asansor bakimi 14:00'te baslayacak.",
      publishedAt: "2026-04-23T09:00:00.000Z",
      authorId: "usr_admin",
      authorName: "Site Yoneticisi"
    }
  ]
};

function createAuthMiddleware(role: "ADMIN" | "RESIDENT" | "SECURITY"): RequestHandler {
  return (req, _res, next) => {
    req.authUser = {
      id: `usr_${role.toLowerCase()}`,
      name: `${role} User`,
      email: `${role.toLowerCase()}@asys.local`,
      role,
      isActive: true
    };
    next();
  };
}

test("dashboard route returns shaped metrics payload for admin users", async () => {
  const app = express();
  app.use(
    "/api/dashboard",
    createDashboardRouter({
      authMiddleware: createAuthMiddleware("ADMIN"),
      store: {
        async getDashboard() {
          return sampleDashboard;
        }
      }
    })
  );

  const response = await request(app).get("/api/dashboard");
  assert.equal(response.status, 200);

  const parsed = dashboardResponseSchema.parse(response.body);
  assert.equal(parsed.dashboard.maintenanceByCategory.length, 2);
  assert.equal(parsed.dashboard.duesTrend.length, 2);
  assert.equal(parsed.dashboard.debtorApartments[0]?.apartmentLabel, "A-1");
});

test("dashboard route denies non-admin roles", async () => {
  const app = express();
  app.use(
    "/api/dashboard",
    createDashboardRouter({
      authMiddleware: createAuthMiddleware("RESIDENT"),
      store: {
        async getDashboard() {
          return sampleDashboard;
        }
      }
    })
  );

  const response = await request(app).get("/api/dashboard");
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    message: "Bu islem icin yetkiniz bulunmuyor."
  });
});
