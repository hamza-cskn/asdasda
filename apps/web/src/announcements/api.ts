import {
  announcementCreateRequestSchema,
  announcementListResponseSchema,
  announcementMutationResponseSchema,
  announcementUpdateRequestSchema,
  authMessageResponseSchema,
  type Announcement
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse, parseRequestPayload } from "../lib/http";

export async function listAnnouncements(accessToken: string): Promise<Announcement[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/announcements`, {
    method: "GET",
    headers: {
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, announcementListResponseSchema);
  return parsed.announcements;
}

export async function publishAnnouncement(
  accessToken: string,
  payload: { title: string; content: string }
): Promise<Announcement> {
  const body = parseRequestPayload(
    announcementCreateRequestSchema,
    payload,
    "Duyuru formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/announcements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, announcementMutationResponseSchema);
  return parsed.announcement;
}

export async function updateAnnouncement(
  accessToken: string,
  announcementId: string,
  payload: { title: string; content: string }
): Promise<Announcement> {
  const body = parseRequestPayload(
    announcementUpdateRequestSchema,
    payload,
    "Duyuru guncelleme formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/announcements/${encodeURIComponent(announcementId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, announcementMutationResponseSchema);
  return parsed.announcement;
}

export async function deleteAnnouncement(accessToken: string, announcementId: string): Promise<void> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/announcements/${encodeURIComponent(announcementId)}`, {
    method: "DELETE",
    headers: {
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include"
  });

  await parseApiResponse(response, authMessageResponseSchema);
}
