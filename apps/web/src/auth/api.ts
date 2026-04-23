import {
  authLoginResponseSchema,
  authMessageResponseSchema,
  authSessionResponseSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  type AuthSession,
  type ForgotPasswordRequest,
  type LoginRequest
} from "@asys/contracts";

import { ApiError } from "../lib/api-error";
import { parseApiResponse, parseRequestPayload } from "../lib/http";
import { webEnv } from "../config";

export { ApiError };

export function buildAuthHeaders(accessToken?: string): HeadersInit {
  if (!accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${accessToken}`
  };
}

export async function login(payload: LoginRequest): Promise<AuthSession> {
  const body = parseRequestPayload(loginRequestSchema, payload, "Giris formu alanlari gecersiz.");
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  return parseApiResponse(response, authLoginResponseSchema);
}

export async function fetchCurrentSession(accessToken?: string): Promise<AuthSession> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/auth/me`, {
    method: "GET",
    headers: {
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include"
  });

  return parseApiResponse(response, authSessionResponseSchema);
}

export async function logout(accessToken?: string): Promise<void> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include"
  });

  await parseApiResponse(response, authMessageResponseSchema);
}

export async function forgotPassword(payload: ForgotPasswordRequest): Promise<void> {
  const body = parseRequestPayload(
    forgotPasswordRequestSchema,
    payload,
    "Sifremi unuttum formu alanlari gecersiz."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  await parseApiResponse(response, authMessageResponseSchema);
}

export async function resetPassword(payload: { token: string; newPassword: string }): Promise<void> {
  const body = parseRequestPayload(resetPasswordRequestSchema, payload, "Sifre sifirlama formu gecersiz.");
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  await parseApiResponse(response, authMessageResponseSchema);
}
