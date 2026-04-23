import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const BACKUP_RETENTION_DAYS = 30;

export type BackupFile = {
  fileName: string;
  createdAt: Date;
};

export type BackupRotationStore = {
  createBackup: (now: Date) => Promise<BackupFile>;
  listBackups: () => Promise<BackupFile[]>;
  removeBackups: (fileNames: string[]) => Promise<void>;
  announceBackup: (input: { fileName: string; removedCount: number }) => Promise<void>;
};

export class FileSystemBackupStore implements BackupRotationStore {
  constructor(private readonly baseDir = resolve(process.cwd(), "backups")) {}

  async createBackup(now: Date): Promise<BackupFile> {
    await mkdir(this.baseDir, { recursive: true });
    const timestamp = now.toISOString().replace(/[:]/g, "-");
    const fileName = `backup-${timestamp}.json`;
    const path = resolve(this.baseDir, fileName);
    await writeFile(path, JSON.stringify({ createdAt: now.toISOString(), source: "asys-worker" }, null, 2));
    return {
      fileName,
      createdAt: now
    };
  }

  async listBackups(): Promise<BackupFile[]> {
    await mkdir(this.baseDir, { recursive: true });
    const entries = await readdir(this.baseDir, { withFileTypes: true });
    const backups: BackupFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith("backup-") || !entry.name.endsWith(".json")) {
        continue;
      }

      const timestamp = entry.name.slice("backup-".length, -".json".length).replace(/-/g, ":");
      const createdAt = new Date(timestamp);
      if (Number.isNaN(createdAt.getTime())) {
        continue;
      }
      backups.push({
        fileName: entry.name,
        createdAt
      });
    }

    return backups.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async removeBackups(fileNames: string[]): Promise<void> {
    for (const fileName of fileNames) {
      await rm(resolve(this.baseDir, fileName), { force: true });
    }
  }

  async announceBackup(_input: { fileName: string; removedCount: number }): Promise<void> {
    return;
  }
}

export function buildBackupCutoff(now: Date): Date {
  return new Date(now.getTime() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function runBackupRotationJob(
  store: BackupRotationStore,
  now: Date = new Date()
): Promise<{ createdFileName: string; removedCount: number }> {
  const created = await store.createBackup(now);
  const backups = await store.listBackups();
  const cutoff = buildBackupCutoff(now);
  const toRemove = backups.filter((backup) => backup.createdAt.getTime() < cutoff.getTime()).map((backup) => backup.fileName);

  if (toRemove.length > 0) {
    await store.removeBackups(toRemove);
  }

  await store.announceBackup({
    fileName: created.fileName,
    removedCount: toRemove.length
  });

  return {
    createdFileName: created.fileName,
    removedCount: toRemove.length
  };
}
