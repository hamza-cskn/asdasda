import { z } from "zod";

const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:3001")
});

export const webEnv = webEnvSchema.parse({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL
});
