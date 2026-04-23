import {
  maintenanceCreateRequestSchema,
  maintenanceListResponseSchema,
  maintenanceMutationResponseSchema,
  maintenanceRatingUpdateRequestSchema,
  maintenanceStatusUpdateRequestSchema,
  type MaintenanceRequest,
  type MaintenanceStatus
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse, parseRequestPayload } from "../lib/http";

export async function listMaintenanceRequests(
  accessToken: string,
  filters?: {
    category?: string;
    status?: MaintenanceStatus;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<MaintenanceRequest[]> {
  const params = new URLSearchParams();

  if (filters?.category) {
    params.set("category", filters.category);
  }
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters?.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/maintenance-requests${query}`, {
    method: "GET",
    headers: {
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, maintenanceListResponseSchema);
  return parsed.requests;
}

export async function createMaintenanceRequest(
  accessToken: string,
  payload: {
    category: string;
    description: string;
    photoUrl?: string;
  }
): Promise<MaintenanceRequest> {
  const body = parseRequestPayload(
    maintenanceCreateRequestSchema,
    payload,
    "Bakim talep formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/maintenance-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, maintenanceMutationResponseSchema);
  return parsed.request;
}

export async function updateMaintenanceStatus(
  accessToken: string,
  requestId: string,
  status: MaintenanceStatus
): Promise<MaintenanceRequest> {
  const body = parseRequestPayload(
    maintenanceStatusUpdateRequestSchema,
    { status },
    "Bakim durum guncelleme verisi gecersiz."
  );
  const response = await fetch(
    `${webEnv.VITE_API_BASE_URL}/api/maintenance-requests/${encodeURIComponent(requestId)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(accessToken)
      },
      credentials: "include",
      body: JSON.stringify(body)
    }
  );

  const parsed = await parseApiResponse(response, maintenanceMutationResponseSchema);
  return parsed.request;
}

export async function rateMaintenanceRequest(
  accessToken: string,
  requestId: string,
  rating: number
): Promise<MaintenanceRequest> {
  const body = parseRequestPayload(
    maintenanceRatingUpdateRequestSchema,
    { rating },
    "Bakim puanlama verisi gecersiz."
  );
  const response = await fetch(
    `${webEnv.VITE_API_BASE_URL}/api/maintenance-requests/${encodeURIComponent(requestId)}/rating`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(accessToken)
      },
      credentials: "include",
      body: JSON.stringify(body)
    }
  );

  const parsed = await parseApiResponse(response, maintenanceMutationResponseSchema);
  return parsed.request;
}
