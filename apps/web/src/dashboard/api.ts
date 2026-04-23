import { dashboardResponseSchema, type DashboardSummary } from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse } from "../lib/http";

export async function fetchDashboard(accessToken: string): Promise<DashboardSummary> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/dashboard`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, dashboardResponseSchema);
  return parsed.dashboard;
}

export function monthlyReportUrl(month: string): string {
  const params = new URLSearchParams({ month });
  return `${webEnv.VITE_API_BASE_URL}/api/reports/monthly-dues.pdf?${params.toString()}`;
}
