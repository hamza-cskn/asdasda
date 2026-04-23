import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "express";
import request from "supertest";

import { createApp } from "./app.js";

function createStubAuthRouter() {
  const router = Router();
  router.get("/ping", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return router;
}

test("maintenance mode blocks API routes during 02:00-03:00 window", async () => {
  const app = createApp({
    enforceHttps: false,
    maintenanceModeEnabled: true,
    now: () => new Date("2026-04-23T02:30:00+03:00"),
    authModuleRouter: createStubAuthRouter()
  });

  const response = await request(app).get("/api/auth/ping");
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "MAINTENANCE_MODE");
});

test("health endpoint stays reachable during maintenance window", async () => {
  const app = createApp({
    enforceHttps: false,
    maintenanceModeEnabled: true,
    now: () => new Date("2026-04-23T02:30:00+03:00"),
    authModuleRouter: createStubAuthRouter()
  });

  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("maintenance mode does not block API routes outside allowed window", async () => {
  const app = createApp({
    enforceHttps: false,
    maintenanceModeEnabled: true,
    now: () => new Date("2026-04-23T04:15:00+03:00"),
    authModuleRouter: createStubAuthRouter()
  });

  const response = await request(app).get("/api/auth/ping");
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});
