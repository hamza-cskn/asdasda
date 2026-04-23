import {
  authMessageResponseSchema,
  dueListResponseSchema,
  dueStatusSchema,
  monthlyDueGenerationRequestSchema,
  type Due,
  type DueStatus
} from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";

import { recordAuditLog } from "../../lib/audit.js";
import { defaultCurrentMonth } from "../../lib/due-rules.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";
import { generateMonthlyDues, listDuesForActor } from "./dues.service.js";

type DuesStore = {
  listDues: (input: {
    actorRole: "ADMIN" | "RESIDENT" | "SECURITY";
    actorUserId: string;
    status?: DueStatus;
    month?: string;
  }) => Promise<Due[]>;
  generateMonthlyDues: (month: string) => Promise<{ createdCount: number; dueDate: Date }>;
  recordAudit?: (input: { userId: string | null; action: string; entityType: string; entityId?: string | null }) => Promise<void>;
};

type DuesRouterOptions = {
  store?: DuesStore;
  authMiddleware?: RequestHandler;
};

const defaultStore: DuesStore = {
  listDues: listDuesForActor,
  generateMonthlyDues,
  async recordAudit(input) {
    await recordAuditLog(input);
  }
};

function queryString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

export function createListDuesHandler(store: DuesStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    if (req.authUser.role === "SECURITY") {
      res.status(403).json({ message: "Guvenlik rolu aidat verisine erisemez." });
      return;
    }

    const statusQuery = queryString(req.query.status);
    const month = queryString(req.query.month);
    const statusResult = statusQuery ? dueStatusSchema.safeParse(statusQuery) : null;
    if (statusResult && !statusResult.success) {
      res.status(400).json({ message: "Gecersiz aidat durumu." });
      return;
    }

    const filters: { status?: DueStatus; month?: string } = {};
    if (statusResult?.success) {
      filters.status = statusResult.data;
    }
    if (month) {
      filters.month = month;
    }

    try {
      const dues = await store.listDues({
        actorRole: req.authUser.role,
        actorUserId: req.authUser.id,
        ...filters
      });
      res.status(200).json(dueListResponseSchema.parse({ dues }));
    } catch (error) {
      next(error);
    }
  };
}

export function createGenerateMonthlyDuesHandler(store: DuesStore): RequestHandler {
  return async (req, res, next) => {
    const parsedBody = monthlyDueGenerationRequestSchema.safeParse({
      month: req.body?.month ?? defaultCurrentMonth()
    });
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz aidat donemi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const result = await store.generateMonthlyDues(parsedBody.data.month);
      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "MONTHLY_DUES_GENERATED",
        entityType: "due",
        entityId: parsedBody.data.month
      });
      res.status(201).json(
        authMessageResponseSchema.parse({
          success: true,
          message: `${parsedBody.data.month} donemi icin ${result.createdCount} aidat kaydi olusturuldu.`
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createDuesRouter(options: DuesRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", createListDuesHandler(store));
  router.post("/generate-monthly", requireRoles(["ADMIN"]), createGenerateMonthlyDuesHandler(store));

  return router;
}
