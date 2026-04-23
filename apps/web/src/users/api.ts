import {
  apartmentListResponseSchema,
  managedUserActivationRequestSchema,
  managedUserMutationResponseSchema,
  managedUserCreateRequestSchema,
  managedUserListResponseSchema,
  managedUserUpdateRequestSchema,
  profileUpdateRequestSchema,
  userProfileResponseSchema,
  type Apartment,
  type ManagedUser,
  type UserProfile
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse, parseRequestPayload } from "../lib/http";

export async function listManagedUsers(accessToken: string): Promise<ManagedUser[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, managedUserListResponseSchema);
  return parsed.users;
}

export async function createManagedUser(
  accessToken: string,
  payload: {
    name: string;
    email: string;
    password: string;
    role: "ADMIN" | "RESIDENT" | "SECURITY";
    phone?: string;
    apartmentId?: string | null;
  }
): Promise<ManagedUser> {
  const body = parseRequestPayload(
    managedUserCreateRequestSchema,
    payload,
    "Kullanici olusturma formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, managedUserMutationResponseSchema);
  return parsed.user;
}

export async function updateManagedUser(
  accessToken: string,
  userId: string,
  payload: {
    name: string;
    phone?: string;
    role?: "ADMIN" | "RESIDENT" | "SECURITY";
    apartmentId?: string | null;
  }
): Promise<ManagedUser> {
  const body = parseRequestPayload(
    managedUserUpdateRequestSchema,
    payload,
    "Kullanici guncelleme formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, managedUserMutationResponseSchema);
  return parsed.user;
}

export async function updateManagedUserActivation(
  accessToken: string,
  userId: string,
  isActive: boolean
): Promise<ManagedUser> {
  const payload = parseRequestPayload(
    managedUserActivationRequestSchema,
    { isActive },
    "Kullanici aktivasyon bilgisi gecersiz."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users/${encodeURIComponent(userId)}/activation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const parsed = await parseApiResponse(response, managedUserMutationResponseSchema);
  return parsed.user;
}

export async function listApartments(accessToken: string): Promise<Apartment[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users/apartments`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, apartmentListResponseSchema);
  return parsed.apartments;
}

export async function fetchUserProfile(accessToken: string): Promise<UserProfile> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users/profile`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, userProfileResponseSchema);
  return parsed.profile;
}

export async function updateUserProfile(
  accessToken: string,
  payload: { name: string; phone?: string }
): Promise<UserProfile> {
  const body = parseRequestPayload(
    profileUpdateRequestSchema,
    payload,
    "Profil formu gonderilemedi. Lutfen alanlari kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/users/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, userProfileResponseSchema);
  return parsed.profile;
}
