import { ZodError } from "zod";

import { ApiError } from "./api-error";

const NETWORK_MESSAGE = "Sunucuya erisilemedi. Baglantinizi ve servis durumunu kontrol edin.";

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.toLocaleLowerCase("tr-TR");
  return normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("load failed");
}

function firstValidationMessage(error: ZodError, fallback: string): string {
  const issue = error.issues.find((candidate) => Boolean(candidate.message?.trim()));
  return issue?.message?.trim() || fallback;
}

export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    return firstValidationMessage(error, fallback);
  }

  if (error instanceof ApiError) {
    return error.message || fallback;
  }

  if (isNetworkError(error)) {
    return NETWORK_MESSAGE;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

export function toApiLikeError(error: unknown, fallback: string, statusCode = 400): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(firstValidationMessage(error, fallback), statusCode);
  }

  if (isNetworkError(error)) {
    return new ApiError(NETWORK_MESSAGE, 503);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return new ApiError((error as { message: string }).message, (error as { statusCode: number }).statusCode);
  }

  if (error instanceof Error && error.message.trim()) {
    return new ApiError(error.message.trim(), statusCode);
  }

  return new ApiError(fallback, statusCode);
}
