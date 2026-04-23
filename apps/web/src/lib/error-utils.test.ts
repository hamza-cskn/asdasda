import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { ApiError } from "./api-error.js";
import { toApiLikeError, toUserMessage } from "./error-utils.js";

test("toUserMessage prioritizes validation message from zod", () => {
  const schema = z.object({
    title: z.string().min(3, "Baslik en az 3 karakter olmalidir.")
  });
  const parsed = schema.safeParse({ title: "ab" });

  assert.equal(parsed.success, false);
  assert.equal(toUserMessage(parsed.error, "fallback"), "Baslik en az 3 karakter olmalidir.");
});

test("toUserMessage returns ApiError message", () => {
  const apiError = new ApiError("Backend aciklama", 400);
  assert.equal(toUserMessage(apiError, "fallback"), "Backend aciklama");
});

test("toUserMessage maps network errors to connectivity message", () => {
  const networkError = new TypeError("Failed to fetch");
  assert.equal(
    toUserMessage(networkError, "fallback"),
    "Sunucuya erisilemedi. Baglantinizi ve servis durumunu kontrol edin."
  );
});

test("toUserMessage falls back for unknown values", () => {
  assert.equal(toUserMessage({ foo: "bar" }, "fallback"), "fallback");
});

test("toApiLikeError converts zod errors into ApiError", () => {
  const schema = z.object({
    email: z.string().email("Gecerli bir e-posta giriniz.")
  });
  const parsed = schema.safeParse({ email: "not-an-email" });

  assert.equal(parsed.success, false);
  const error = toApiLikeError(parsed.error, "fallback", 422);

  assert.equal(error instanceof ApiError, true);
  assert.equal(error.message, "Gecerli bir e-posta giriniz.");
  assert.equal(error.statusCode, 422);
});
