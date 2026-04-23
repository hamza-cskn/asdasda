import {
  reservationListResponseSchema,
  reservationCreateRequestSchema,
  reservationMutationResponseSchema,
  type Reservation
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse, parseRequestPayload } from "../lib/http";

export async function listReservations(accessToken: string): Promise<Reservation[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/reservations`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, reservationListResponseSchema);
  return parsed.reservations;
}

export async function createReservation(
  accessToken: string,
  payload: { commonAreaId: string; startsAt: string; endsAt: string }
): Promise<Reservation> {
  const body = parseRequestPayload(
    reservationCreateRequestSchema,
    payload,
    "Rezervasyon formu gonderilemedi. Alanlari ve saatleri kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, reservationMutationResponseSchema);
  return parsed.reservation;
}

export async function cancelReservation(accessToken: string, reservationId: string): Promise<Reservation> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/reservations/${encodeURIComponent(reservationId)}/cancel`, {
    method: "PATCH",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, reservationMutationResponseSchema);
  return parsed.reservation;
}
