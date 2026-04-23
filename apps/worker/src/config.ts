import dotenv from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WORKER_TICK_MS: z.coerce.number().int().positive().default(30_000),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/asys?schema=public")
});

export const workerEnv = workerEnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  WORKER_TICK_MS: process.env.WORKER_TICK_MS,
  DATABASE_URL: process.env.DATABASE_URL
});
