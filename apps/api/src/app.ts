import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { Request, RequestHandler } from "express";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createAuthRouter } from "./modules/auth/auth.route.js";
import { createAnnouncementRouter } from "./modules/announcements/announcements.route.js";
import { createCommonAreasRouter } from "./modules/common-areas/common-areas.route.js";
import { createDashboardRouter } from "./modules/dashboard/dashboard.route.js";
import { createDuesRouter } from "./modules/dues/dues.route.js";
import { healthRouter } from "./modules/health/health.route.js";
import { createMaintenanceRouter } from "./modules/maintenance/maintenance.route.js";
import { createNotificationRouter } from "./modules/notifications/notifications.route.js";
import { createParkingSpotsRouter } from "./modules/parking-spots/parking-spots.route.js";
import { createPaymentsRouter } from "./modules/payments/payments.route.js";
import { createReportsRouter } from "./modules/reports/reports.route.js";
import { createReservationsRouter } from "./modules/reservations/reservations.route.js";
import { createUserManagementRouter } from "./modules/users/users.route.js";
import { createVisitorVehiclesRouter } from "./modules/visitor-vehicles/visitor-vehicles.route.js";

type AppOptions = {
  enforceHttps?: boolean;
  trustProxy?: boolean | number | string;
  maintenanceModeEnabled?: boolean;
  now?: () => Date;
  authModuleRouter?: RequestHandler;
};

function isSecureRequest(req: Request): boolean {
  const forwardedProto = req.header("x-forwarded-proto");
  if (forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https") {
    return true;
  }

  return req.secure;
}

function createHttpsMiddleware(enforceHttps: boolean): RequestHandler {
  return (req, res, next) => {
    if (!enforceHttps || isSecureRequest(req)) {
      next();
      return;
    }

    res.status(426).json({
      message: "HTTPS zorunludur.",
      code: "HTTPS_REQUIRED"
    });
  };
}

function isMaintenanceWindow(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 2 && hour < 3;
}

function createMaintenanceModeMiddleware(enabled: boolean, now: () => Date): RequestHandler {
  return (req, res, next) => {
    if (!enabled) {
      next();
      return;
    }

    if (!req.path.startsWith("/api/")) {
      next();
      return;
    }

    if (!isMaintenanceWindow(now())) {
      next();
      return;
    }

    res.status(503).json({
      message: "Planli bakim penceresi aktif (02:00-03:00). Lutfen daha sonra tekrar deneyin.",
      code: "MAINTENANCE_MODE"
    });
  };
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const enforceHttps = options.enforceHttps ?? env.ENFORCE_HTTPS;
  const maintenanceModeEnabled = options.maintenanceModeEnabled ?? env.MAINTENANCE_MODE;
  const now = options.now ?? (() => new Date());

  app.set("trust proxy", options.trustProxy ?? env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(createHttpsMiddleware(enforceHttps));
  app.use(createMaintenanceModeMiddleware(maintenanceModeEnabled, now));
  app.use("/uploads", express.static("uploads"));

  app.use("/health", healthRouter);
  app.use("/api/auth", options.authModuleRouter ?? createAuthRouter());
  app.use("/api/announcements", createAnnouncementRouter());
  app.use("/api/common-areas", createCommonAreasRouter());
  app.use("/api/dashboard", createDashboardRouter());
  app.use("/api/dues", createDuesRouter());
  app.use("/api/maintenance-requests", createMaintenanceRouter());
  app.use("/api/notifications", createNotificationRouter());
  app.use("/api/parking-spots", createParkingSpotsRouter());
  app.use("/api/payments", createPaymentsRouter());
  app.use("/api/reports", createReportsRouter());
  app.use("/api/reservations", createReservationsRouter());
  app.use("/api/users", createUserManagementRouter());
  app.use("/api/visitor-vehicles", createVisitorVehiclesRouter());

  app.use((_req, res) => {
    res.status(404).json({ message: "Kaynak bulunamadi" });
  });

  app.use(errorHandler);

  return app;
}

export const app = createApp();
