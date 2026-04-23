import {
  notificationListResponseSchema,
  notificationMutationResponseSchema,
  type Notification
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse } from "../lib/http";

export async function listNotifications(accessToken: string): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/notifications`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  return parseApiResponse(response, notificationListResponseSchema);
}

export async function markNotificationRead(accessToken: string, notificationId: string): Promise<Notification> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "PATCH",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, notificationMutationResponseSchema);
  return parsed.notification;
}
