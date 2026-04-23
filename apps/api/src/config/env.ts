import dotenv from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/asys?schema=public"),
  JWT_SECRET: z.string().min(8).default("gelistirme-icin-degistir"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY: z.string().default("1"),
  ENFORCE_HTTPS: z.string().optional(),
  MAINTENANCE_MODE: z.string().optional()
});

function parseBoolean(value: string): boolean {
  return value.toLowerCase() === "true";
}

function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  const asNumber = Number(value);
  if (Number.isInteger(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  return value;
}

const rawEnv = rawEnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  API_PORT: process.env.API_PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
  TRUST_PROXY: process.env.TRUST_PROXY,
  ENFORCE_HTTPS: process.env.ENFORCE_HTTPS,
  MAINTENANCE_MODE: process.env.MAINTENANCE_MODE
});

export const env = {
  ...rawEnv,
  TRUST_PROXY: parseTrustProxy(rawEnv.TRUST_PROXY),
  ENFORCE_HTTPS:
    rawEnv.ENFORCE_HTTPS === undefined ? rawEnv.NODE_ENV === "production" : parseBoolean(rawEnv.ENFORCE_HTTPS),
  MAINTENANCE_MODE: rawEnv.MAINTENANCE_MODE === undefined ? false : parseBoolean(rawEnv.MAINTENANCE_MODE)
};
