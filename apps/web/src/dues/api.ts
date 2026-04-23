import {
  authMessageResponseSchema,
  dueListResponseSchema,
  type Due,
  type DueStatus
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse } from "../lib/http";

export async function listDues(
  accessToken: string,
  filters?: {
    status?: DueStatus;
    month?: string;
  }
): Promise<Due[]> {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.month) {
    params.set("month", filters.month);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";

  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/dues${query}`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, dueListResponseSchema);
  return parsed.dues;
}

export async function generateMonthlyDues(accessToken: string, month: string): Promise<string> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/dues/generate-monthly`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify({ month })
  });

  const parsed = await parseApiResponse(response, authMessageResponseSchema);
  return parsed.message;
}
