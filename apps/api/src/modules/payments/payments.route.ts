import {
  paymentCreateRequestSchema,
  paymentListResponseSchema,
  paymentMethodSchema,
  paymentMutationResponseSchema,
  type Payment,
  type PaymentMethod
} from "@asys/contracts";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { createSimplePdf } from "../../lib/pdf.js";
import { toMoney } from "../../lib/money.js";
import { notifyUsers } from "../../lib/notifications.js";
import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware } from "../../middleware/auth.js";
import { apartmentLabel, syncDueStatuses, toDueResponse } from "../dues/dues.service.js";

type PaymentStore = {
  createPayment: (input: { actorUserId: string; actorRole: "ADMIN" | "RESIDENT" | "SECURITY"; dueId: string; method: PaymentMethod }) => Promise<Payment>;
  listPayments: (input: {
    actorUserId: string;
    actorRole: "ADMIN" | "RESIDENT" | "SECURITY";
    method?: PaymentMethod;
    dateFrom?: Date;
    dateTo?: Date;
  }) => Promise<Payment[]>;
  getReceipt: (input: { actorUserId: string; actorRole: "ADMIN" | "RESIDENT" | "SECURITY"; paymentId: string }) => Promise<Buffer | null>;
};

type PaymentsRouterOptions = {
  store?: PaymentStore;
  authMiddleware?: RequestHandler;
};

const paymentParamsSchema = z.object({
  paymentId: z.string().trim().min(1)
});

function toPayment(row: {
  id: string;
  dueId: string;
  due: {
    apartment: {
      block: string;
      number: string;
    };
  };
  amount: unknown;
  method: PaymentMethod;
  paidAt: Date;
  createdById: string | null;
}): Payment {
  return {
    id: row.id,
    dueId: row.dueId,
    apartmentLabel: apartmentLabel(row.due.apartment),
    amount: toMoney(row.amount),
    method: row.method,
    paidAt: row.paidAt.toISOString(),
    createdById: row.createdById,
    receiptUrl: `/api/payments/${row.id}/receipt.pdf`
  };
}

function parseDateOnly(value: string, mode: "start" | "end"): Date {
  const suffix = mode === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  return new Date(`${value}${suffix}`);
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const defaultStore: PaymentStore = {
  async createPayment(input) {
    if (input.actorRole === "SECURITY") {
      throw Object.assign(new Error("Guvenlik rolu odeme yapamaz."), { statusCode: 403 });
    }

    await syncDueStatuses();
    const due = await prisma.due.findUnique({
      where: { id: input.dueId },
      select: {
        id: true,
        apartmentId: true,
        apartment: {
          select: {
            block: true,
            number: true,
            resident: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        amount: true,
        dueDate: true,
        status: true,
        lateFeeAmount: true,
        payments: {
          select: {
            amount: true,
            paidAt: true
          }
        },
        createdAt: true
      }
    });

    if (!due) {
      throw Object.assign(new Error("Aidat kaydi bulunamadi."), { statusCode: 404 });
    }

    if (input.actorRole === "RESIDENT" && due.apartment.resident?.id !== input.actorUserId) {
      throw Object.assign(new Error("Sadece kendi aidatinizi odeyebilirsiniz."), { statusCode: 403 });
    }

    const summary = toDueResponse(due);
    if (summary.outstandingAmount <= 0) {
      throw Object.assign(new Error("Bu aidat zaten odenmis."), { statusCode: 409 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          dueId: due.id,
          amount: summary.outstandingAmount,
          method: input.method,
          createdById: input.actorUserId
        },
        select: {
          id: true,
          dueId: true,
          due: {
            select: {
              apartment: {
                select: {
                  block: true,
                  number: true
                }
              }
            }
          },
          amount: true,
          method: true,
          paidAt: true,
          createdById: true
        }
      });

      await tx.due.update({
        where: { id: due.id },
        data: {
          status: "PAID",
          lateFeeAmount: summary.lateFeeAmount
        }
      });

      return created;
    });

    const residentId = due.apartment.resident?.id;
    if (residentId) {
      await notifyUsers([residentId], {
        title: "Aidat odemesi alindi",
        message: `${summary.apartmentLabel} aidati ${summary.outstandingAmount} TL olarak odendi.`,
        category: "PAYMENT_RECEIVED",
        link: "/panel/resident"
      });
    }

    await recordAuditLog({
      userId: input.actorUserId,
      action: "PAYMENT_CREATED",
      entityType: "payment",
      entityId: payment.id,
      details: { dueId: due.id, method: input.method, amount: summary.outstandingAmount }
    });

    return toPayment(payment);
  },

  async listPayments(input) {
    if (input.actorRole === "SECURITY") {
      return [];
    }

    const where: {
      method?: PaymentMethod;
      paidAt?: { gte?: Date; lte?: Date };
      due?: { apartment?: { resident?: { id: string } } };
    } = {};

    if (input.method) {
      where.method = input.method;
    }
    if (input.dateFrom || input.dateTo) {
      where.paidAt = {};
      if (input.dateFrom) {
        where.paidAt.gte = input.dateFrom;
      }
      if (input.dateTo) {
        where.paidAt.lte = input.dateTo;
      }
    }
    if (input.actorRole === "RESIDENT") {
      where.due = {
        apartment: {
          resident: {
            id: input.actorUserId
          }
        }
      };
    }

    const payments = await prisma.payment.findMany({
      where,
      select: {
        id: true,
        dueId: true,
        due: {
          select: {
            apartment: {
              select: {
                block: true,
                number: true
              }
            }
          }
        },
        amount: true,
        method: true,
        paidAt: true,
        createdById: true
      },
      orderBy: { paidAt: "desc" }
    });

    return payments.map(toPayment);
  },

  async getReceipt(input) {
    if (input.actorRole === "SECURITY") {
      return null;
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: input.paymentId,
        ...(input.actorRole === "RESIDENT"
          ? {
              due: {
                apartment: {
                  resident: {
                    id: input.actorUserId
                  }
                }
              }
            }
          : {})
      },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        due: {
          select: {
            dueDate: true,
            lateFeeAmount: true,
            apartment: {
              select: {
                block: true,
                number: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return null;
    }

    return createSimplePdf(
      [
        `Makbuz No: ${payment.id}`,
        `Daire: ${apartmentLabel(payment.due.apartment)}`,
        `Odeme Tarihi: ${payment.paidAt.toISOString()}`,
        `Yontem: ${payment.method}`,
        `Tutar: ${toMoney(payment.amount)} TL`,
        `Gecikme Faizi: ${toMoney(payment.due.lateFeeAmount)} TL`,
        `Aidat Vadesi: ${payment.due.dueDate.toISOString()}`
      ],
      "ASYS Aidat Makbuzu"
    );
  }
};

export function createPaymentCreateHandler(store: PaymentStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedBody = paymentCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz odeme verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const payment = await store.createPayment({
        actorUserId: req.authUser.id,
        actorRole: req.authUser.role,
        dueId: parsedBody.data.dueId,
        method: parsedBody.data.method
      });
      res.status(201).json(paymentMutationResponseSchema.parse({ payment }));
    } catch (error) {
      next(error);
    }
  };
}

export function createPaymentListHandler(store: PaymentStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const methodQuery = queryString(req.query.method);
    const methodResult = methodQuery ? paymentMethodSchema.safeParse(methodQuery) : null;
    if (methodResult && !methodResult.success) {
      res.status(400).json({ message: "Gecersiz odeme yontemi." });
      return;
    }

    const dateFrom = queryString(req.query.dateFrom);
    const dateTo = queryString(req.query.dateTo);
    const filters: { method?: PaymentMethod; dateFrom?: Date; dateTo?: Date } = {};
    if (methodResult?.success) {
      filters.method = methodResult.data;
    }
    if (dateFrom) {
      filters.dateFrom = parseDateOnly(dateFrom, "start");
    }
    if (dateTo) {
      filters.dateTo = parseDateOnly(dateTo, "end");
    }

    try {
      const payments = await store.listPayments({
        actorUserId: req.authUser.id,
        actorRole: req.authUser.role,
        ...filters
      });
      res.status(200).json(paymentListResponseSchema.parse({ payments }));
    } catch (error) {
      next(error);
    }
  };
}

export function createPaymentReceiptHandler(store: PaymentStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedParams = paymentParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz odeme kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    try {
      const pdf = await store.getReceipt({
        actorUserId: req.authUser.id,
        actorRole: req.authUser.role,
        paymentId: parsedParams.data.paymentId
      });
      if (!pdf) {
        res.status(404).json({ message: "Makbuz bulunamadi." });
        return;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="asys-makbuz-${parsedParams.data.paymentId}.pdf"`);
      res.status(200).send(pdf);
    } catch (error) {
      next(error);
    }
  };
}

export function createPaymentsRouter(options: PaymentsRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/", createPaymentListHandler(store));
  router.post("/", createPaymentCreateHandler(store));
  router.get("/:paymentId/receipt.pdf", createPaymentReceiptHandler(store));

  return router;
}
