import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";

import { getHealth } from "./health.route.js";

function createMockResponse() {
  const store: { statusCode: number; body: unknown } = {
    statusCode: 0,
    body: null
  };
  const response = {
    status(code: number) {
      store.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      store.body = payload;
      return this;
    }
  } as unknown as Response;

  return { response, store };
}

test("health handler returns api health payload", () => {
  const { response, store } = createMockResponse();

  getHealth({} as never, response);

  assert.equal(store.statusCode, 200);
  assert.deepEqual(store.body, {
    status: "ok",
    service: "api",
    slice: "S1"
  });
});
