import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type TimedResult = {
  status: number;
  durationMs: number;
};

type LoginResponse = {
  accessToken: string;
};

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

async function timedFetch(url: string, init?: RequestInit): Promise<TimedResult> {
  const start = performance.now();
  const response = await fetch(url, init);
  const durationMs = performance.now() - start;
  return {
    status: response.status,
    durationMs
  };
}

async function loginAsAdmin(apiBaseUrl: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: "admin@asys.local",
      password: "AsysDemo1234!"
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed for NFR check: ${response.status}`);
  }

  const payload = (await response.json()) as LoginResponse;
  if (!payload.accessToken) {
    throw new Error("Login response did not include access token.");
  }

  return payload.accessToken;
}

async function measureWebBundleLoad(webBaseUrl: string): Promise<{ htmlMs: number; bundleMs: number; totalMs: number }> {
  const htmlStart = performance.now();
  const htmlResponse = await fetch(`${webBaseUrl}/giris`);
  const htmlText = await htmlResponse.text();
  const htmlMs = performance.now() - htmlStart;

  const assetPaths = Array.from(htmlText.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)).map((match) => match[1] ?? "");
  const assetUrls = assetPaths.map((path) => new URL(path, webBaseUrl).toString());
  const bundleStart = performance.now();
  if (assetUrls.length > 0) {
    await Promise.all(assetUrls.map((url) => fetch(url)));
  }
  const bundleMs = performance.now() - bundleStart;

  return {
    htmlMs,
    bundleMs,
    totalMs: htmlMs + bundleMs
  };
}

async function measureConcurrentHealth(apiBaseUrl: string, concurrentUsers: number): Promise<{
  durations: number[];
  okCount: number;
}> {
  const calls = Array.from({ length: concurrentUsers }, () => timedFetch(`${apiBaseUrl}/health`));
  const results = await Promise.all(calls);
  return {
    durations: results.map((result) => result.durationMs),
    okCount: results.filter((result) => result.status === 200).length
  };
}

async function measureDashboardLatency(apiBaseUrl: string, accessToken: string, iterations: number): Promise<number[]> {
  const durations: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const result = await timedFetch(`${apiBaseUrl}/api/dashboard`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (result.status !== 200) {
      throw new Error(`/api/dashboard returned ${result.status} during DB latency check.`);
    }
    durations.push(result.durationMs);
  }
  return durations;
}

async function main() {
  const apiBaseUrl = process.env.NFR_API_BASE_URL ?? "http://127.0.0.1:3001";
  const webBaseUrl = process.env.NFR_WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const concurrentUsers = Number.parseInt(process.env.NFR_CONCURRENT_USERS ?? "100", 10);
  const dashboardIterations = Number.parseInt(process.env.NFR_DB_ITERATIONS ?? "10", 10);

  const [bundleLoad, healthCheck] = await Promise.all([
    measureWebBundleLoad(webBaseUrl),
    measureConcurrentHealth(apiBaseUrl, concurrentUsers)
  ]);

  const token = await loginAsAdmin(apiBaseUrl);
  const dashboardDurations = await measureDashboardLatency(apiBaseUrl, token, dashboardIterations);

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      apiBaseUrl,
      webBaseUrl,
      concurrentUsers,
      dashboardIterations
    },
    pageLoad: {
      htmlMs: Number(bundleLoad.htmlMs.toFixed(2)),
      bundleMs: Number(bundleLoad.bundleMs.toFixed(2)),
      totalMs: Number(bundleLoad.totalMs.toFixed(2)),
      pass: bundleLoad.totalMs < 3000
    },
    concurrentHealth: {
      okCount: healthCheck.okCount,
      totalCount: concurrentUsers,
      p95Ms: Number(percentile(healthCheck.durations, 0.95).toFixed(2)),
      maxMs: Number(Math.max(...healthCheck.durations, 0).toFixed(2)),
      pass: healthCheck.okCount === concurrentUsers
    },
    dashboardLatency: {
      avgMs: Number((dashboardDurations.reduce((sum, value) => sum + value, 0) / dashboardDurations.length).toFixed(2)),
      p95Ms: Number(percentile(dashboardDurations, 0.95).toFixed(2)),
      maxMs: Number(Math.max(...dashboardDurations, 0).toFixed(2)),
      pass: percentile(dashboardDurations, 0.95) < 500
    }
  };

  const outputPath = resolve(process.cwd(), "artifacts/nfr/latest.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  console.log(`NFR report written: ${outputPath}`);
  console.log(JSON.stringify(report, null, 2));

  if (!report.pageLoad.pass || !report.concurrentHealth.pass || !report.dashboardLatency.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("NFR check failed:", error);
  process.exitCode = 1;
});
