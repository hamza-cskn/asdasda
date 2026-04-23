import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { createSimplePdf } from "../../lib/pdf.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";
import { defaultCurrentMonth } from "../../lib/due-rules.js";
import { listDuesForActor } from "../dues/dues.service.js";

type ReportsStore = {
  buildMonthlyDuesReport: (input: { actorUserId: string; month: string }) => Promise<Buffer>;
};

type ReportsRouterOptions = {
  store?: ReportsStore;
  authMiddleware?: RequestHandler;
};

const reportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

const defaultStore: ReportsStore = {
  async buildMonthlyDuesReport(input) {
    const dues = await listDuesForActor({
      actorRole: "ADMIN",
      actorUserId: input.actorUserId,
      month: input.month
    });

    const collected = dues.reduce((total, due) => total + due.paidAmount, 0);
    const outstanding = dues.reduce((total, due) => total + due.outstandingAmount, 0);
    const lines = [
      `Donem: ${input.month}`,
      `Kayit Sayisi: ${dues.length}`,
      `Tahsil Edilen: ${collected.toFixed(2)} TL`,
      `Kalan Borc: ${outstanding.toFixed(2)} TL`,
      "",
      "Daire | Durum | Tutar | Faiz | Odenen | Kalan"
    ];

    for (const due of dues.slice(0, 32)) {
      lines.push(
        `${due.apartmentLabel} | ${due.status} | ${due.amount.toFixed(2)} | ${due.lateFeeAmount.toFixed(2)} | ${due.paidAmount.toFixed(2)} | ${due.outstandingAmount.toFixed(2)}`
      );
    }

    return createSimplePdf(lines, "ASYS Aylik Aidat Tahsilat Raporu");
  }
};

export function createMonthlyDuesReportHandler(store: ReportsStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedQuery = reportQuerySchema.safeParse({
      month: typeof req.query.month === "string" ? req.query.month : defaultCurrentMonth()
    });
    if (!parsedQuery.success) {
      res.status(400).json({ message: "Gecersiz rapor donemi.", errors: parsedQuery.error.flatten() });
      return;
    }

    try {
      const pdf = await store.buildMonthlyDuesReport({
        actorUserId: req.authUser.id,
        month: parsedQuery.data.month
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="asys-aidat-raporu-${parsedQuery.data.month}.pdf"`);
      res.status(200).send(pdf);
    } catch (error) {
      next(error);
    }
  };
}

export function createReportsRouter(options: ReportsRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/monthly-dues.pdf", requireRoles(["ADMIN"]), createMonthlyDuesReportHandler(store));

  return router;
}
