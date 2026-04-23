import type { Due, DueStatus } from "@asys/contracts";

import { buildDueDateForMonth, calculateLateFee, calculateOverdueMonthCount, monthKey } from "../../lib/due-rules.js";
import { sumMoney, toMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";

type DueRow = {
  id: string;
  apartmentId: string;
  apartment: {
    block: string;
    number: string;
  };
  amount: unknown;
  dueDate: Date;
  status: DueStatus;
  lateFeeAmount: unknown;
  payments: Array<{
    amount: unknown;
    paidAt: Date;
  }>;
  createdAt: Date;
};

export function apartmentLabel(apartment: { block: string; number: string }): string {
  return `${apartment.block}-${apartment.number}`;
}

function dueMonthRange(month: string): { gte: Date; lt: Date } {
  const dueDate = buildDueDateForMonth(month);
  return {
    gte: new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  };
}

export function toDueResponse(row: DueRow, asOf: Date = new Date()): Due {
  const amount = toMoney(row.amount);
  const paidAmount = sumMoney(row.payments.map((payment) => toMoney(payment.amount)));
  const computedLateFee = row.status === "PAID" ? toMoney(row.lateFeeAmount) : calculateLateFee(amount, row.dueDate, asOf);
  const totalAmount = toMoney(amount + computedLateFee);
  const outstandingAmount = toMoney(Math.max(0, totalAmount - paidAmount));
  const status: DueStatus =
    outstandingAmount <= 0 ? "PAID" : calculateOverdueMonthCount(row.dueDate, asOf) > 0 ? "OVERDUE" : "PENDING";

  return {
    id: row.id,
    apartmentId: row.apartmentId,
    apartmentLabel: apartmentLabel(row.apartment),
    amount,
    lateFeeAmount: computedLateFee,
    totalAmount,
    paidAmount,
    outstandingAmount,
    status,
    dueDate: row.dueDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    overdueMonthCount: status === "PAID" ? 0 : calculateOverdueMonthCount(row.dueDate, asOf),
    receiptAvailable: row.payments.length > 0
  };
}

export async function syncDueStatuses(asOf: Date = new Date()): Promise<void> {
  const dues = await prisma.due.findMany({
    where: {
      status: {
        not: "PAID"
      }
    },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      status: true,
      lateFeeAmount: true,
      payments: {
        select: {
          amount: true,
          paidAt: true
        }
      }
    }
  });

  for (const due of dues) {
    const amount = toMoney(due.amount);
    const paidAmount = sumMoney(due.payments.map((payment) => toMoney(payment.amount)));
    const lateFeeAmount = calculateLateFee(amount, due.dueDate, asOf);
    const totalAmount = toMoney(amount + lateFeeAmount);
    const status: DueStatus =
      paidAmount >= totalAmount ? "PAID" : calculateOverdueMonthCount(due.dueDate, asOf) > 0 ? "OVERDUE" : "PENDING";

    if (status !== due.status || toMoney(due.lateFeeAmount) !== lateFeeAmount) {
      await prisma.due.update({
        where: { id: due.id },
        data: {
          status,
          lateFeeAmount
        }
      });
    }
  }
}

export async function generateMonthlyDues(month: string): Promise<{ createdCount: number; dueDate: Date }> {
  const dueDate = buildDueDateForMonth(month);
  const apartments = await prisma.apartment.findMany({
    select: {
      id: true,
      monthlyDue: true
    }
  });

  if (apartments.length === 0) {
    return { createdCount: 0, dueDate };
  }

  const result = await prisma.due.createMany({
    data: apartments.map((apartment) => ({
      apartmentId: apartment.id,
      amount: apartment.monthlyDue,
      dueDate,
      status: "PENDING"
    })),
    skipDuplicates: true
  });

  return {
    createdCount: result.count,
    dueDate
  };
}

export async function listDuesForActor(input: {
  actorRole: "ADMIN" | "RESIDENT" | "SECURITY";
  actorUserId: string;
  status?: DueStatus;
  month?: string;
}): Promise<Due[]> {
  await syncDueStatuses();

  const where: {
    apartmentId?: string;
    status?: DueStatus;
    dueDate?: { gte: Date; lt: Date };
  } = {};

  if (input.actorRole === "RESIDENT") {
    const user = await prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { apartmentId: true }
    });

    if (!user?.apartmentId) {
      return [];
    }

    where.apartmentId = user.apartmentId;
  }

  if (input.status) {
    where.status = input.status;
  }
  if (input.month) {
    where.dueDate = dueMonthRange(input.month);
  }

  const dues = await prisma.due.findMany({
    where,
    select: {
      id: true,
      apartmentId: true,
      apartment: {
        select: {
          block: true,
          number: true
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
    },
    orderBy: [{ dueDate: "desc" }, { apartment: { block: "asc" } }]
  });

  return dues.map((due) => toDueResponse(due));
}

export async function hasUnpaidDuesForResident(userId: string): Promise<boolean> {
  await syncDueStatuses();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apartmentId: true }
  });

  if (!user?.apartmentId) {
    return false;
  }

  const unpaidCount = await prisma.due.count({
    where: {
      apartmentId: user.apartmentId,
      status: {
        not: "PAID"
      }
    }
  });

  return unpaidCount > 0;
}

export async function listDebtorApartments(): Promise<
  Array<{ apartmentId: string; apartmentLabel: string; outstandingAmount: number; overdueCount: number }>
> {
  await syncDueStatuses();
  const dues = await prisma.due.findMany({
    where: {
      status: {
        not: "PAID"
      }
    },
    select: {
      id: true,
      apartmentId: true,
      apartment: {
        select: {
          block: true,
          number: true
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

  const debtors = new Map<string, { apartmentId: string; apartmentLabel: string; outstandingAmount: number; overdueCount: number }>();
  for (const due of dues) {
    const summary = toDueResponse(due);
    if (summary.outstandingAmount <= 0) {
      continue;
    }

    const existing = debtors.get(summary.apartmentId) ?? {
      apartmentId: summary.apartmentId,
      apartmentLabel: summary.apartmentLabel,
      outstandingAmount: 0,
      overdueCount: 0
    };
    existing.outstandingAmount = toMoney(existing.outstandingAmount + summary.outstandingAmount);
    existing.overdueCount += summary.status === "OVERDUE" ? 1 : 0;
    debtors.set(summary.apartmentId, existing);
  }

  return [...debtors.values()].sort((left, right) => right.outstandingAmount - left.outstandingAmount);
}

export async function getDuesTrend(monthsBack = 12, asOf: Date = new Date()) {
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1, 0, 0, 0, 0));
  const payments = await prisma.payment.findMany({
    where: {
      paidAt: {
        gte: start
      }
    },
    select: {
      amount: true,
      paidAt: true
    }
  });

  const totals = new Map<string, number>();
  for (let index = 0; index < monthsBack; index += 1) {
    const monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1, 0, 0, 0, 0));
    totals.set(monthKey(monthDate), 0);
  }

  for (const payment of payments) {
    const key = monthKey(payment.paidAt);
    totals.set(key, toMoney((totals.get(key) ?? 0) + toMoney(payment.amount)));
  }

  return [...totals.entries()].map(([month, collectedAmount]) => ({ month, collectedAmount }));
}
