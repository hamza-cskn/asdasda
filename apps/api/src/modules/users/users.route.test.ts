import assert from "node:assert/strict";
import test from "node:test";
import type { ManagedUser } from "@asys/contracts";
import type { Request, RequestHandler, Response } from "express";

import { requireRoles } from "../../middleware/auth.js";
import {
  createListManagedUsersHandler,
  createSetManagedUserActivationHandler
} from "./users.route.js";

type MockResponseStore = {
  statusCode: number;
  body: unknown;
};

type MockRequestOptions = {
  body?: unknown;
  params?: Record<string, string>;
  authRole?: "ADMIN" | "RESIDENT" | "SECURITY";
};

function createMockRequest(options: MockRequestOptions = {}): Request {
  return {
    body: options.body ?? {},
    params: options.params ?? {},
    authUser: options.authRole
      ? {
          id: "actor_id",
          name: "Test Actor",
          email: "actor@asys.local",
          role: options.authRole,
          isActive: true
        }
      : undefined
  } as Request;
}

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

function createInMemoryStore(seedUsers: ManagedUser[]) {
  const usersById = new Map(seedUsers.map((user) => [user.id, { ...user }]));

  return {
    async listUsers() {
      return Array.from(usersById.values());
    },
    async createUser(_input: {
      name: string;
      email: string;
      password: string;
      role: "ADMIN" | "RESIDENT" | "SECURITY";
      phone: string | null;
      apartmentId: string | null;
    }) {
      throw new Error("Not implemented in this test");
    },
    async updateUser(
      _userId: string,
      _input: {
        name: string;
        phone: string | null;
        role?: "ADMIN" | "RESIDENT" | "SECURITY";
        apartmentId: string | null;
      }
    ) {
      return null;
    },
    async setUserActivation(userId: string, isActive: boolean) {
      const user = usersById.get(userId);
      if (!user) {
        return null;
      }

      const updatedUser = {
        ...user,
        isActive
      };
      usersById.set(userId, updatedUser);
      return updatedUser;
    },
    async listApartments() {
      return [];
    },
    async updateApartment(_apartmentId: string, _input: { monthlyDue?: number; isOccupied?: boolean }) {
      return null;
    },
    async getProfile(_userId: string) {
      return null;
    },
    async updateProfile(_userId: string, _input: { name: string; phone: string | null }) {
      return null;
    }
  };
}

async function invokeHandler(handler: RequestHandler, req: Request, res: Response) {
  await handler(req, res, () => undefined);
}

test("admin can list users and toggle activation state", async () => {
  const store = createInMemoryStore([
    {
      id: "usr_admin",
      name: "Site Yoneticisi",
      email: "admin@asys.local",
      role: "ADMIN",
      isActive: true,
      phone: null,
      apartmentId: null,
      apartmentLabel: null
    },
    {
      id: "usr_resident",
      name: "Ornek Sakin",
      email: "resident@asys.local",
      role: "RESIDENT",
      isActive: true,
      phone: null,
      apartmentId: null,
      apartmentLabel: null
    }
  ]);

  const listHandler = createListManagedUsersHandler(store);
  const toggleHandler = createSetManagedUserActivationHandler(store);

  const listReq = createMockRequest({ authRole: "ADMIN" });
  const { response: listRes, store: listStore } = createMockResponse();
  await invokeHandler(listHandler, listReq, listRes);

  assert.equal(listStore.statusCode, 200);
  assert.equal((listStore.body as { users: ManagedUser[] }).users.length, 2);

  const toggleReq = createMockRequest({
    authRole: "ADMIN",
    params: { userId: "usr_resident" },
    body: { isActive: false }
  });
  const { response: toggleRes, store: toggleStore } = createMockResponse();
  await invokeHandler(toggleHandler, toggleReq, toggleRes);

  assert.equal(toggleStore.statusCode, 200);
  assert.equal((toggleStore.body as { user: ManagedUser }).user.isActive, false);
});

test("non-admin role is denied by admin RBAC guard", async () => {
  const guard = requireRoles(["ADMIN"]);
  const req = createMockRequest({ authRole: "SECURITY" });
  const { response, store } = createMockResponse();

  let nextCalled = false;
  await guard(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(store.statusCode, 403);
  assert.deepEqual(store.body, {
    message: "Bu islem icin yetkiniz bulunmuyor."
  });
});
