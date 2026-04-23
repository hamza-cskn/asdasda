import { defineConfig, devices } from "@playwright/test";

const E2E_WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? "http://localhost:3100";
const E2E_API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:3101";
const E2E_WEB_PORT = new URL(E2E_WEB_ORIGIN).port || "3100";
const E2E_API_PORT = new URL(E2E_API_ORIGIN).port || "3101";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  webServer: [
    {
      command: "npm run build -w @asys/api && npm run start -w @asys/api",
      url: `${E2E_API_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        WEB_ORIGIN: E2E_WEB_ORIGIN,
        API_PORT: E2E_API_PORT
      }
    },
    {
      command: `npm run build -w @asys/web && npm run preview -w @asys/web -- --host 0.0.0.0 --port ${E2E_WEB_PORT}`,
      url: `${E2E_WEB_ORIGIN}/giris`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_BASE_URL: E2E_API_ORIGIN
      }
    }
  ]
});
