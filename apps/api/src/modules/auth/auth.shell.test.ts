import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import type { Request, RequestHandler, Response } from "express";

import {
  createForgotPasswordHandler,
  createLoginHandler,
  createResetPasswordHandler,
  type AuthUserRecord,
  type EmailOutboxEntry,
  type PasswordResetTokenRecord
} from "./auth.route.js";

type MockResponseStore = {
  statusCode: number;
  body: unknown;
  cookies: Array<{ name: string; value: string; options: unknown }>;
  clearedCookies: string[];
};

type ResetTokenInternal = PasswordResetTokenRecord & {
  tokenHash: string;
};

function createMockRequest(body: unknown = {}): Request {
  return {
    body,
    secure: false,
    header(name: string) {
      return undefined;
    }
  } as Request;
}

function createMockResponse() {
  const store: MockResponseStore = {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: []
  };

  const response = {
    status(code: number) {
      store.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      store.body = payload;
      return this;
    },
    cookie(name: string, value: string, options: unknown) {
      store.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string) {
      store.clearedCookies.push(name);
      return this;
    }
  } as unknown as Response;

  return { response, store };
}

function extractTokenFromOutboxBody(body: string): string {
  const marker = "Sifre sifirlama tokeniniz: ";
  const index = body.indexOf(marker);
  if (index === -1) {
    throw new Error("Token marker not found in outbox body");
  }

  return body.slice(index + marker.length).trim();
}

function createInMemoryStore(seedUsers: AuthUserRecord[]) {
  const usersById = new Map(seedUsers.map((user) => [user.id, { ...user }]));
  const usersByEmail = new Map(seedUsers.map((user) => [user.email.toLowerCase(), user.id]));
  const resetTokensById = new Map<string, ResetTokenInternal>();
  const resetTokensByHash = new Map<string, string>();
  const outbox: EmailOutboxEntry[] = [];

  return {
    store: {
      async findUserByEmail(email: string) {
        const userId = usersByEmail.get(email.toLowerCase());
        if (!userId) {
          return null;
        }

        const user = usersById.get(userId);
        return user ? { ...user } : null;
      },
      async setLoginFailureState(userId: string, failedLoginAttempts: number, lockedUntil: Date | null) {
        const user = usersById.get(userId);
        if (!user) {
          return;
        }

        user.failedLoginAttempts = failedLoginAttempts;
        user.lockedUntil = lockedUntil;
      },
      async clearLoginFailureState(userId: string) {
        const user = usersById.get(userId);
        if (!user) {
          return;
        }

        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
      },
      async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
        for (const token of resetTokensById.values()) {
          if (token.userId === userId && token.usedAt === null) {
            token.usedAt = new Date();
          }
        }

        const id = `rt_${resetTokensById.size + 1}`;
        const token: ResetTokenInternal = {
          id,
          userId,
          tokenHash,
          expiresAt,
          usedAt: null
        };
        resetTokensById.set(id, token);
        resetTokensByHash.set(tokenHash, id);
      },
      async findPasswordResetToken(tokenHash: string) {
        const tokenId = resetTokensByHash.get(tokenHash);
        if (!tokenId) {
          return null;
        }

        const token = resetTokensById.get(tokenId);
        if (!token) {
          return null;
        }

        return {
          id: token.id,
          userId: token.userId,
          expiresAt: token.expiresAt,
          usedAt: token.usedAt
        };
      },
      async markPasswordResetTokenUsed(tokenId: string) {
        const token = resetTokensById.get(tokenId);
        if (!token) {
          return;
        }

        token.usedAt = new Date();
      },
      async updatePasswordHash(userId: string, passwordHash: string) {
        const user = usersById.get(userId);
        if (!user) {
          return;
        }

        user.passwordHash = passwordHash;
      },
      async enqueueEmail(entry: EmailOutboxEntry) {
        outbox.push({ ...entry });
      }
    },
    getUserById(userId: string) {
      const user = usersById.get(userId);
      return user ? { ...user } : null;
    },
    getOutbox() {
      return outbox.map((entry) => ({ ...entry }));
    }
  };
}

async function invokeHandler(handler: RequestHandler, req: Request, res: Response) {
  await handler(req, res, () => undefined);
}

test("login issues JWT session and secure cookie contract", async () => {
  const passwordHash = await bcrypt.hash("AsysDemo1234!", 4);
  const fixture = createInMemoryStore([
    {
      id: "usr_admin",
      name: "Site Yoneticisi",
      email: "admin@asys.local",
      role: "ADMIN",
      isActive: true,
      passwordHash,
      failedLoginAttempts: 2,
      lockedUntil: null
    }
  ]);

  const handler = createLoginHandler(fixture.store, () => new Date("2026-04-22T10:00:00.000Z"));
  const req = createMockRequest({
    email: "admin@asys.local",
    password: "AsysDemo1234!"
  });
  const { response, store } = createMockResponse();

  await invokeHandler(handler, req, response);

  assert.equal(store.statusCode, 200);
  assert.equal((store.body as { mode: string }).mode, "JWT");
  assert.equal(typeof (store.body as { accessToken: string }).accessToken, "string");
  assert.equal(store.cookies.length, 1);
  assert.equal(store.cookies[0]?.name, "asys_access_token");
  assert.equal(fixture.getUserById("usr_admin")?.failedLoginAttempts, 0);
  assert.equal(fixture.getUserById("usr_admin")?.lockedUntil, null);
});

test("login rejects passwords shorter than 12 characters", async () => {
  const passwordHash = await bcrypt.hash("AsysDemo1234!", 4);
  const fixture = createInMemoryStore([
    {
      id: "usr_resident",
      name: "Ornek Sakin",
      email: "resident@asys.local",
      role: "RESIDENT",
      isActive: true,
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null
    }
  ]);

  const handler = createLoginHandler(fixture.store, () => new Date("2026-04-22T10:00:00.000Z"));
  const req = createMockRequest({
    email: "resident@asys.local",
    password: "Kisa123!"
  });
  const { response, store } = createMockResponse();

  await invokeHandler(handler, req, response);

  assert.equal(store.statusCode, 400);
  assert.deepEqual(store.body, {
    message: "Gecersiz giris verisi.",
    errors: {
      formErrors: [],
      fieldErrors: {
        password: ["Sifre en az 12 karakter olmalidir."]
      }
    }
  });
});

test("five failed logins lock account for 15 minutes", async () => {
  const passwordHash = await bcrypt.hash("AsysDemo1234!", 4);
  const now = new Date("2026-04-22T10:00:00.000Z");
  const fixture = createInMemoryStore([
    {
      id: "usr_security",
      name: "Guvenlik Gorevlisi",
      email: "security@asys.local",
      role: "SECURITY",
      isActive: true,
      passwordHash,
      failedLoginAttempts: 4,
      lockedUntil: null
    }
  ]);

  const handler = createLoginHandler(fixture.store, () => now);
  const wrongReq = createMockRequest({
    email: "security@asys.local",
    password: "YanlisSifre1234!"
  });
  const wrongRes = createMockResponse();

  await invokeHandler(handler, wrongReq, wrongRes.response);

  assert.equal(wrongRes.store.statusCode, 423);
  const lockedUser = fixture.getUserById("usr_security");
  assert.notEqual(lockedUser?.lockedUntil, null);

  const correctReq = createMockRequest({
    email: "security@asys.local",
    password: "AsysDemo1234!"
  });
  const correctRes = createMockResponse();
  await invokeHandler(handler, correctReq, correctRes.response);

  assert.equal(correctRes.store.statusCode, 423);
});

test("forgot-password creates outbox token and reset persists bcrypt hash", async () => {
  const oldPasswordHash = await bcrypt.hash("AsysDemo1234!", 4);
  const fixture = createInMemoryStore([
    {
      id: "usr_resident",
      name: "Ornek Sakin",
      email: "resident@asys.local",
      role: "RESIDENT",
      isActive: true,
      passwordHash: oldPasswordHash,
      failedLoginAttempts: 3,
      lockedUntil: new Date("2026-04-22T10:10:00.000Z")
    }
  ]);

  const now = () => new Date("2026-04-22T10:00:00.000Z");
  const forgotHandler = createForgotPasswordHandler(fixture.store, now);
  const resetHandler = createResetPasswordHandler(fixture.store, now, 4);

  const forgotReq = createMockRequest({ email: "resident@asys.local" });
  const forgotRes = createMockResponse();
  await invokeHandler(forgotHandler, forgotReq, forgotRes.response);

  assert.equal(forgotRes.store.statusCode, 200);
  const outbox = fixture.getOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.toEmail, "resident@asys.local");

  const rawToken = extractTokenFromOutboxBody(outbox[0]!.body);
  const resetReq = createMockRequest({
    token: rawToken,
    newPassword: "YeniSifre12345!"
  });
  const resetRes = createMockResponse();
  await invokeHandler(resetHandler, resetReq, resetRes.response);

  assert.equal(resetRes.store.statusCode, 200);

  const updatedUser = fixture.getUserById("usr_resident");
  assert.equal(updatedUser?.passwordHash === "YeniSifre12345!", false);
  assert.equal(await bcrypt.compare("YeniSifre12345!", updatedUser?.passwordHash ?? ""), true);
  assert.equal(updatedUser?.failedLoginAttempts, 0);
  assert.equal(updatedUser?.lockedUntil, null);

  const replayReq = createMockRequest({
    token: rawToken,
    newPassword: "IkinciSifre12345!"
  });
  const replayRes = createMockResponse();
  await invokeHandler(resetHandler, replayReq, replayRes.response);

  assert.equal(replayRes.store.statusCode, 400);
  assert.deepEqual(replayRes.store.body, {
    message: "Sifirlama baglantisi gecersiz veya suresi dolmus."
  });
});

test("malicious auth payloads are blocked", async () => {
  const passwordHash = await bcrypt.hash("AsysDemo1234!", 4);
  const fixture = createInMemoryStore([
    {
      id: "usr_admin",
      name: "Site Yoneticisi",
      email: "admin@asys.local",
      role: "ADMIN",
      isActive: true,
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null
    }
  ]);

  const handler = createLoginHandler(fixture.store, () => new Date("2026-04-22T10:00:00.000Z"));
  const req = createMockRequest({
    email: "admin@asys.local",
    password: "AsysDemo1234!",
    payload: "<script>alert(1)</script>"
  });
  const { response, store } = createMockResponse();

  await invokeHandler(handler, req, response);

  assert.equal(store.statusCode, 400);
  assert.deepEqual(store.body, {
    message: "Guvenlik politikasi nedeniyle istek reddedildi."
  });
});
