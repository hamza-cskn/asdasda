import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

import { createAuthMiddleware, requireRoles } from "./auth.js";

type MockResponseStore = {
  statusCode: number;
  body: unknown;
};

function createMockResponse() {
  const store: MockResponseStore = {
    statusCode: 200,
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

function createMockRequest(headers: Record<string, string> = {}): Request {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    header(name: string) {
      return normalizedHeaders[name.toLowerCase()];
    }
  } as Request;
}

test("auth middleware accepts valid JWT and loads user", async () => {
  const secret = "test-secret";
  const token = jwt.sign(
    {
      role: "ADMIN",
      email: "admin@asys.local"
    },
    secret,
    {
      subject: "usr_admin",
      expiresIn: "24h",
      issuer: "asys-api",
      audience: "asys-web"
    }
  );

  const req = createMockRequest({ authorization: `Bearer ${token}` });
  const { response, store } = createMockResponse();

  let nextCalled = false;
  const middleware = createAuthMiddleware({
    jwtSecret: secret,
    async userLookup() {
      return {
        id: "usr_admin",
        name: "Site Yoneticisi",
        email: "admin@asys.local",
        role: "ADMIN",
        isActive: true
      };
    }
  });

  await middleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(store.statusCode, 200);
  assert.equal(req.authUser?.role, "ADMIN");
});

test("auth middleware rejects expired JWT", async () => {
  const secret = "test-secret";
  const token = jwt.sign(
    {
      role: "RESIDENT",
      email: "resident@asys.local"
    },
    secret,
    {
      subject: "usr_resident",
      expiresIn: -1,
      issuer: "asys-api",
      audience: "asys-web"
    }
  );

  const req = createMockRequest({ authorization: `Bearer ${token}` });
  const { response, store } = createMockResponse();

  const middleware = createAuthMiddleware({
    jwtSecret: secret,
    async userLookup() {
      return {
        id: "usr_resident",
        name: "Ornek Sakin",
        email: "resident@asys.local",
        role: "RESIDENT",
        isActive: true
      };
    }
  });

  let nextCalled = false;
  await middleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(store.statusCode, 401);
  assert.deepEqual(store.body, {
    message: "Oturum suresi doldu. Lutfen tekrar giris yapin."
  });
});

test("role middleware blocks role mismatches", () => {
  const req = {
    authUser: {
      id: "usr_security",
      name: "Guvenlik Gorevlisi",
      email: "security@asys.local",
      role: "SECURITY",
      isActive: true
    }
  } as unknown as Request;
  const { response, store } = createMockResponse();

  const guard = requireRoles(["ADMIN"]);
  let nextCalled = false;
  guard(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(store.statusCode, 403);
  assert.deepEqual(store.body, {
    message: "Bu islem icin yetkiniz bulunmuyor."
  });
});
