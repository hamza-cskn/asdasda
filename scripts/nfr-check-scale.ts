import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

type TimedResult = {
  status: number;
  durationMs: number;
};

type LoginResponse = {
  accessToken: string;
};

type ScaleReport = {
  generatedAt: string;
  inputs: {
    apiBaseUrl: string;
    scaleApartments: number;
    dashboardIterations: number;
    dashboardP95ThresholdMs: number;
  };
  dataSetup: {
    prefix: string;
    apartmentCount: number;
    dueCount: number;
    pass: boolean;
  };
  dashboardLatency: {
    avgMs: number;
    p95Ms: number;
    maxMs: number;
    successCount: number;
    totalCount: number;
    pass: boolean;
  };
  cleanup: {
    keepData: boolean;
    executed: boolean;
  };
};

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/asys?schema=public";

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
    throw new Error(`Scale login failed: ${response.status}`);
  }

  const payload = (await response.json()) as LoginResponse;
  if (!payload.accessToken) {
    throw new Error("Scale login did not return access token.");
  }

  return payload.accessToken;
}

async function measureDashboardLatency(
  apiBaseUrl: string,
  accessToken: string,
  iterations: number
): Promise<{ durations: number[]; successCount: number }> {
  const durations: number[] = [];
  let successCount = 0;

  for (let index = 0; index < iterations; index += 1) {
    const result = await timedFetch(`${apiBaseUrl}/api/dashboard`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (result.status === 200) {
      successCount += 1;
      durations.push(result.durationMs);
      continue;
    }

    throw new Error(`/api/dashboard returned ${result.status} in scale test.`);
  }

  return {
    durations,
    successCount
  };
}

async function createScaleData(client: Client, prefix: string, apartmentCount: number): Promise<void> {
  await client.query(
    `INSERT INTO apartments (apartment_id, block, floor, number, monthly_due, is_occupied, created_at, updated_at)
     SELECT
       format('%s-apt-%s', $1::text, lpad(series.i::text, 4, '0')),
       'NFR',
       ((series.i - 1) % 20) + 1,
       format('NFR-%s', lpad(series.i::text, 4, '0')),
       1200.00,
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     FROM generate_series(1, $2::int) AS series(i)
     ON CONFLICT (block, number) DO NOTHING`,
    [prefix, apartmentCount]
  );

  await client.query(
    `INSERT INTO dues (due_id, apartment_id, amount, due_date, status, late_fee_amount, created_at, updated_at)
     SELECT
       format('%s-due-%s', $1::text, lpad(series.i::text, 4, '0')),
       format('%s-apt-%s', $1::text, lpad(series.i::text, 4, '0')),
       1200.00,
       '2026-04-05T12:00:00.000Z'::timestamptz,
       'PENDING'::"DueStatus",
       0.00,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     FROM generate_series(1, $2::int) AS series(i)
     ON CONFLICT (apartment_id, due_date) DO NOTHING`,
    [prefix, apartmentCount]
  );
}

async function getScaleCounts(client: Client, prefix: string): Promise<{ apartmentCount: number; dueCount: number }> {
  const apartmentResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM apartments
     WHERE starts_with(apartment_id, $1)`,
    [prefix]
  );
  const dueResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM dues
     WHERE starts_with(apartment_id, $1)`,
    [prefix]
  );

  return {
    apartmentCount: Number.parseInt(apartmentResult.rows[0]?.count ?? "0", 10),
    dueCount: Number.parseInt(dueResult.rows[0]?.count ?? "0", 10)
  };
}

async function cleanupScaleData(client: Client, prefix: string): Promise<void> {
  await client.query(
    `DELETE FROM apartments
     WHERE starts_with(apartment_id, $1)`,
    [prefix]
  );
}

async function writeReport(scaleApartments: number, report: ScaleReport): Promise<void> {
  const outputPath = resolve(process.cwd(), `artifacts/nfr/scale-${scaleApartments}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(`NFR scale report written: ${outputPath}`);
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const apiBaseUrl = process.env.NFR_API_BASE_URL ?? "http://127.0.0.1:3001";
  const scaleApartments = Number.parseInt(process.env.NFR_SCALE_APARTMENTS ?? "500", 10);
  const dashboardIterations = Number.parseInt(process.env.NFR_DB_ITERATIONS ?? "20", 10);
  const dashboardP95ThresholdMs = Number.parseInt(process.env.NFR_DB_P95_THRESHOLD_MS ?? "500", 10);
  const keepData = (process.env.NFR_SCALE_KEEP_DATA ?? "false").toLowerCase() === "true";
  const prefix = process.env.NFR_SCALE_PREFIX ?? `nfrscale${Date.now()}`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let cleanupExecuted = false;
  try {
    await createScaleData(client, prefix, scaleApartments);
    const counts = await getScaleCounts(client, prefix);
    const token = await loginAsAdmin(apiBaseUrl);
    const latency = await measureDashboardLatency(apiBaseUrl, token, dashboardIterations);
    const p95Ms = percentile(latency.durations, 0.95);

    const report: ScaleReport = {
      generatedAt: new Date().toISOString(),
      inputs: {
        apiBaseUrl,
        scaleApartments,
        dashboardIterations,
        dashboardP95ThresholdMs
      },
      dataSetup: {
        prefix,
        apartmentCount: counts.apartmentCount,
        dueCount: counts.dueCount,
        pass: counts.apartmentCount >= scaleApartments && counts.dueCount >= scaleApartments
      },
      dashboardLatency: {
        avgMs: Number(
          (latency.durations.reduce((sum, value) => sum + value, 0) / Math.max(latency.durations.length, 1)).toFixed(2)
        ),
        p95Ms: Number(p95Ms.toFixed(2)),
        maxMs: Number(Math.max(...latency.durations, 0).toFixed(2)),
        successCount: latency.successCount,
        totalCount: dashboardIterations,
        pass: latency.successCount === dashboardIterations && p95Ms < dashboardP95ThresholdMs
      },
      cleanup: {
        keepData,
        executed: false
      }
    };

    if (!keepData) {
      await cleanupScaleData(client, prefix);
      cleanupExecuted = true;
      report.cleanup.executed = true;
    }

    await writeReport(scaleApartments, report);

    if (!report.dataSetup.pass || !report.dashboardLatency.pass) {
      process.exitCode = 1;
    }
  } finally {
    if (!keepData && !cleanupExecuted) {
      await cleanupScaleData(client, prefix).catch(() => undefined);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error("NFR scale check failed:", error);
  process.exitCode = 1;
});
