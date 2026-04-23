import { PrismaClient } from "@prisma/client";

import {
  type BackupRotationStore
} from "./backup-rotation.js";
import {
  type MaintenanceEscalationStore
} from "./maintenance-escalation.js";
import {
  type MonthlyDuesStore
} from "./monthly-dues-generation.js";
import {
  OVERDUE_ADMIN_ESCALATION_MONTHS,
  type OverdueReminderStore
} from "./overdue-reminder-dispatch.js";
import {
  type VisitorOverstayStore
} from "./visitor-overstay-alert.js";
import {
  type UserRetentionStore
} from "./user-retention-cleanup.js";

function toMoney(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
}

function calculateOverdueMonths(dueDate: Date, now: Date): number {
  if (now.getTime() <= dueDate.getTime()) {
    return 0;
  }
  const monthDifference = (now.getUTCFullYear() - dueDate.getUTCFullYear()) * 12 + (now.getUTCMonth() - dueDate.getUTCMonth());
  return Math.max(1, monthDifference + 1);
}

function apartmentLabel(apartment: { block: string; number: string }): string {
  return `${apartment.block}-${apartment.number}`;
}

export function createWorkerPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
}

export function createMonthlyDuesStore(prisma: PrismaClient): MonthlyDuesStore {
  return {
    async listApartmentsForDues() {
      const apartments = await prisma.apartment.findMany({
        select: {
          id: true,
          monthlyDue: true
        }
      });
      return apartments.map((apartment) => ({
        apartmentId: apartment.id,
        amount: toMoney(apartment.monthlyDue)
      }));
    },

    async createMonthlyDues(records) {
      const result = await prisma.due.createMany({
        data: records.map((record) => ({
          apartmentId: record.apartmentId,
          amount: record.amount,
          dueDate: record.dueDate,
          status: "PENDING"
        })),
        skipDuplicates: true
      });
      return result.count;
    }
  };
}

export function createOverdueReminderStore(prisma: PrismaClient): OverdueReminderStore {
  return {
    async listOverdueDues(now) {
      const dues = await prisma.due.findMany({
        where: {
          status: {
            not: "PAID"
          },
          dueDate: {
            lt: now
          }
        },
        select: {
          id: true,
          dueDate: true,
          amount: true,
          lateFeeAmount: true,
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
          payments: {
            select: {
              amount: true
            }
          }
        }
      });

      return dues
        .map((due) => {
          const total = toMoney(due.amount) + toMoney(due.lateFeeAmount);
          const paid = due.payments.reduce((sum, payment) => sum + toMoney(payment.amount), 0);
          const outstanding = Math.max(0, Math.round((total - paid) * 100) / 100);
          return {
            dueId: due.id,
            apartmentLabel: apartmentLabel(due.apartment),
            residentId: due.apartment.resident?.id ?? null,
            residentEmail: due.apartment.resident?.email ?? null,
            overdueMonths: calculateOverdueMonths(due.dueDate, now),
            outstandingAmount: outstanding
          };
        })
        .filter((due) => due.outstandingAmount > 0);
    },

    async listAdminContacts() {
      return prisma.user.findMany({
        where: {
          role: "ADMIN",
          isActive: true
        },
        select: {
          id: true,
          email: true
        }
      });
    },

    async enqueueEmails(entries) {
      if (entries.length === 0) {
        return;
      }
      await prisma.emailOutbox.createMany({
        data: entries.map((entry) => ({
          toEmail: entry.toEmail,
          subject: entry.subject,
          body: entry.body,
          category: entry.category
        }))
      });
    },

    async enqueueNotifications(entries) {
      if (entries.length === 0) {
        return;
      }
      await prisma.notification.createMany({
        data: entries.map((entry) => ({
          userId: entry.userId,
          title: entry.title,
          message: entry.message,
          category: entry.category,
          link: entry.link
        }))
      });
    }
  };
}

export function createMaintenanceEscalationStore(prisma: PrismaClient): MaintenanceEscalationStore {
  return {
    async listEscalationCandidates(cutoff) {
      const requests = await prisma.maintenanceRequest.findMany({
        where: {
          status: {
            in: ["BEKLEMEDE", "ISLEMDE"]
          },
          createdAt: {
            lte: cutoff
          },
          escalatedAt: null
        },
        select: {
          id: true,
          category: true,
          createdAt: true,
          resident: {
            select: {
              name: true
            }
          }
        }
      });

      return requests.map((request) => ({
        requestId: request.id,
        residentName: request.resident.name,
        category: request.category,
        createdAt: request.createdAt
      }));
    },

    async markEscalated(requestIds, escalatedAt) {
      if (requestIds.length === 0) {
        return;
      }
      await prisma.maintenanceRequest.updateMany({
        where: {
          id: {
            in: requestIds
          }
        },
        data: {
          escalatedAt
        }
      });
    },

    async listAdminEmails() {
      const admins = await prisma.user.findMany({
        where: {
          role: "ADMIN",
          isActive: true
        },
        select: {
          email: true
        }
      });
      return admins.map((admin) => admin.email);
    },

    async enqueueNotifications(entries) {
      if (entries.length === 0) {
        return;
      }
      await prisma.emailOutbox.createMany({
        data: entries.map((entry) => ({
          toEmail: entry.toEmail,
          subject: entry.subject,
          body: entry.body,
          category: entry.category
        }))
      });
    }
  };
}

export function createVisitorOverstayStore(prisma: PrismaClient): VisitorOverstayStore {
  return {
    async listOverstayCandidates(cutoff) {
      const candidates = await prisma.visitorVehicle.findMany({
        where: {
          exitedAt: null,
          enteredAt: {
            lte: cutoff
          }
        },
        select: {
          id: true,
          plate: true,
          enteredAt: true,
          apartment: {
            select: {
              block: true,
              number: true
            }
          },
          parkingSpot: {
            select: {
              spotNumber: true
            }
          }
        }
      });

      if (candidates.length === 0) {
        return [];
      }

      const alertLogs = await prisma.auditLog.findMany({
        where: {
          action: "VISITOR_OVERSTAY_ALERT",
          entityType: "visitor_vehicle",
          entityId: {
            in: candidates.map((candidate) => candidate.id)
          }
        },
        select: {
          entityId: true
        }
      });
      const alertedVehicleIds = new Set(alertLogs.map((log) => log.entityId).filter(Boolean) as string[]);

      return candidates
        .filter((candidate) => !alertedVehicleIds.has(candidate.id))
        .map((candidate) => ({
          visitorVehicleId: candidate.id,
          plate: candidate.plate,
          apartmentLabel: apartmentLabel(candidate.apartment),
          enteredAt: candidate.enteredAt,
          parkingSpotNumber: candidate.parkingSpot.spotNumber
        }));
    },

    async listSecurityContacts() {
      return prisma.user.findMany({
        where: {
          role: "SECURITY",
          isActive: true
        },
        select: {
          id: true,
          email: true
        }
      });
    },

    async enqueueAlerts(entries) {
      if (entries.length === 0) {
        return;
      }
      await prisma.notification.createMany({
        data: entries.map((entry) => ({
          userId: entry.userId,
          title: entry.title,
          message: entry.message,
          category: entry.category,
          link: entry.link
        }))
      });
    },

    async enqueueEmails(entries) {
      if (entries.length === 0) {
        return;
      }
      await prisma.emailOutbox.createMany({
        data: entries.map((entry) => ({
          toEmail: entry.toEmail,
          subject: entry.subject,
          body: entry.body,
          category: entry.category
        }))
      });
    },

    async markAlerted(vehicleIds, alertedAt) {
      if (vehicleIds.length === 0) {
        return;
      }
      await prisma.auditLog.createMany({
        data: vehicleIds.map((vehicleId) => ({
          userId: null,
          action: "VISITOR_OVERSTAY_ALERT",
          entityType: "visitor_vehicle",
          entityId: vehicleId,
          createdAt: alertedAt
        }))
      });
    }
  };
}

export function createBackupRotationStore(prisma: PrismaClient, delegate: BackupRotationStore): BackupRotationStore {
  return {
    async createBackup(now) {
      return delegate.createBackup(now);
    },
    async listBackups() {
      return delegate.listBackups();
    },
    async removeBackups(fileNames) {
      await delegate.removeBackups(fileNames);
    },
    async announceBackup(input) {
      await delegate.announceBackup(input);
      const admins = await prisma.user.findMany({
        where: {
          role: "ADMIN",
          isActive: true
        },
        select: {
          id: true,
          email: true
        }
      });

      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            title: "Gunluk yedekleme tamamlandi",
            message: `${input.fileName} olusturuldu, ${input.removedCount} eski yedek temizlendi.`,
            category: "SYSTEM_BACKUP",
            link: "/panel/admin"
          }))
        });
        await prisma.emailOutbox.createMany({
          data: admins.map((admin) => ({
            toEmail: admin.email,
            subject: "ASYS Gunluk Yedekleme",
            body: `${input.fileName} olusturuldu, ${input.removedCount} eski yedek temizlendi.`,
            category: "SYSTEM_BACKUP"
          }))
        });
      }
    }
  };
}

export function isThreeMonthDebtor(overdueMonths: number): boolean {
  return overdueMonths >= OVERDUE_ADMIN_ESCALATION_MONTHS;
}

export function createUserRetentionStore(prisma: PrismaClient): UserRetentionStore {
  return {
    async listRetentionCandidates(cutoff) {
      const users = await prisma.user.findMany({
        where: {
          isActive: false,
          deactivatedAt: {
            not: null,
            lte: cutoff
          }
        },
        select: {
          id: true,
          apartmentId: true
        }
      });

      return users.map((user) => ({
        userId: user.id,
        apartmentId: user.apartmentId
      }));
    },

    async markApartmentsVacant(apartmentIds) {
      if (apartmentIds.length === 0) {
        return;
      }
      await prisma.apartment.updateMany({
        where: {
          id: {
            in: apartmentIds
          }
        },
        data: {
          isOccupied: false
        }
      });
    },

    async deleteUsers(userIds) {
      if (userIds.length === 0) {
        return 0;
      }
      const result = await prisma.user.deleteMany({
        where: {
          id: {
            in: userIds
          }
        }
      });
      return result.count;
    },

    async appendRetentionAudit(userIds, now) {
      if (userIds.length === 0) {
        return;
      }
      await prisma.auditLog.createMany({
        data: userIds.map((userId) => ({
          userId: null,
          action: "USER_PURGED_RETENTION",
          entityType: "user",
          entityId: userId,
          createdAt: now
        }))
      });
    }
  };
}
