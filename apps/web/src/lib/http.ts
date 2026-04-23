import { ApiError } from "./api-error";
import { toApiLikeError } from "./error-utils";

type ParseSchema<T> = {
  parse: (input: unknown) => T;
};

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return "Islem basarisiz.";
}

export async function parseApiResponse<T>(
  response: Response,
  schema: ParseSchema<T>,
  invalidPayloadFallback = "Sunucu yaniti dogrulanamadi."
): Promise<T> {
  const payload = (await response.json().catch(() => ({ message: "Beklenmeyen sunucu yaniti." }))) as unknown;

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload), response.status);
  }

  try {
    return schema.parse(payload);
  } catch (error) {
    throw toApiLikeError(error, invalidPayloadFallback, response.status || 500);
  }
}

export function parseRequestPayload<T>(
  schema: ParseSchema<T>,
  payload: unknown,
  invalidPayloadFallback = "Gonderilen veriler gecersiz."
): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    throw toApiLikeError(error, invalidPayloadFallback, 400);
  }
}
