import { commonAreaListResponseSchema, type CommonArea } from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware } from "../../middleware/auth.js";

type CommonAreaStore = {
  listCommonAreas: () => Promise<CommonArea[]>;
};

type CommonAreaRouterOptions = {
  store?: CommonAreaStore;
  authMiddleware?: RequestHandler;
};

const defaultStore: CommonAreaStore = {
  async listCommonAreas() {
    const areas = await prisma.commonArea.findMany({
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        maxDurationHours: true,
        dailyLimitHours: true,
        opensAt: true,
        closesAt: true
      },
      orderBy: { name: "asc" }
    });

    return areas;
  }
};

export function createListCommonAreasHandler(store: CommonAreaStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.status(200).json(commonAreaListResponseSchema.parse({ areas: await store.listCommonAreas() }));
    } catch (error) {
      next(error);
    }
  };
}

export function createCommonAreasRouter(options: CommonAreaRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", createListCommonAreasHandler(store));

  return router;
}
