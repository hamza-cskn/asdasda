import {
  parkingSpotListResponseSchema,
  parkingSpotMutationResponseSchema,
  visitorVehicleCreateRequestSchema,
  visitorVehicleListResponseSchema,
  visitorVehicleMutationResponseSchema,
  type ParkingSpot,
  type VisitorVehicle
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse, parseRequestPayload } from "../lib/http";

export async function listParkingSpots(accessToken: string): Promise<ParkingSpot[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/parking-spots`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, parkingSpotListResponseSchema);
  return parsed.spots;
}

export async function assignParkingSpot(
  accessToken: string,
  parkingSpotId: string,
  apartmentId: string | null
): Promise<ParkingSpot> {
  const response = await fetch(
    `${webEnv.VITE_API_BASE_URL}/api/parking-spots/${encodeURIComponent(parkingSpotId)}/assignment`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(accessToken)
      },
      credentials: "include",
      body: JSON.stringify({ apartmentId })
    }
  );

  const parsed = await parseApiResponse(response, parkingSpotMutationResponseSchema);
  return parsed.spot;
}

export async function listVisitorVehicles(accessToken: string): Promise<VisitorVehicle[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/visitor-vehicles`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, visitorVehicleListResponseSchema);
  return parsed.vehicles;
}

export async function createVisitorVehicle(
  accessToken: string,
  payload: {
    plate: string;
    apartmentId: string;
    parkingSpotId: string;
  }
): Promise<VisitorVehicle> {
  const body = parseRequestPayload(
    visitorVehicleCreateRequestSchema,
    payload,
    "Ziyaretci giris formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/visitor-vehicles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, visitorVehicleMutationResponseSchema);
  return parsed.vehicle;
}

export async function exitVisitorVehicle(accessToken: string, vehicleId: string): Promise<VisitorVehicle> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/visitor-vehicles/${encodeURIComponent(vehicleId)}/exit`, {
    method: "PATCH",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, visitorVehicleMutationResponseSchema);
  return parsed.vehicle;
}
