import { pathToFileURL } from "node:url";

import { workerEnv } from "./config.js";
import { FileSystemBackupStore, runBackupRotationJob } from "./jobs/backup-rotation.js";
import {
  createBackupRotationStore,
  createMaintenanceEscalationStore,
  createMonthlyDuesStore,
  createOverdueReminderStore,
  createUserRetentionStore,
  createVisitorOverstayStore,
  createWorkerPrismaClient
} from "./jobs/job-store.js";
import { runMaintenanceEscalationJob } from "./jobs/maintenance-escalation.js";
import { runMonthlyDuesGenerationJob } from "./jobs/monthly-dues-generation.js";
import { runOverdueReminderDispatchJob } from "./jobs/overdue-reminder-dispatch.js";
import { runUserRetentionCleanupJob } from "./jobs/user-retention-cleanup.js";
import { runVisitorOverstayAlertJob } from "./jobs/visitor-overstay-alert.js";

const plannedJobs = [
  "monthly-dues-generation",
  "overdue-reminder-dispatch",
  "maintenance-escalation",
  "visitor-overstay-alert",
  "backup-rotation",
  "user-retention-cleanup"
] as const;

export function describeJobs() {
  return [...plannedJobs];
}

export async function runWorkerTick(now: Date = new Date()): Promise<void> {
  const prisma = createWorkerPrismaClient(workerEnv.DATABASE_URL);

  try {
    const monthly = await runMonthlyDuesGenerationJob(createMonthlyDuesStore(prisma), { now });
    const overdue = await runOverdueReminderDispatchJob(createOverdueReminderStore(prisma), now);
    const maintenance = await runMaintenanceEscalationJob(createMaintenanceEscalationStore(prisma), now);
    const visitor = await runVisitorOverstayAlertJob(createVisitorOverstayStore(prisma), now);
    const backup = await runBackupRotationJob(
      createBackupRotationStore(prisma, new FileSystemBackupStore()),
      now
    );
    const retention = await runUserRetentionCleanupJob(createUserRetentionStore(prisma), now);

    console.log(
      `[worker:${now.toISOString()}] dues=${monthly.generatedCount} overdue=${overdue.remindedResidentCount} maintenance=${maintenance.escalatedCount} visitor=${visitor.overstayCount} backup=${backup.createdFileName} retention=${retention.deletedCount}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[worker:${now.toISOString()}] tick failed: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
}

export function startWorker() {
  console.log(`Worker basladi | aralik=${workerEnv.WORKER_TICK_MS}ms`);
  void runWorkerTick();
  return setInterval(() => {
    void runWorkerTick();
  }, workerEnv.WORKER_TICK_MS);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker();
}
