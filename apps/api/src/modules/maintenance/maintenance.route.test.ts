import assert from "node:assert/strict";
import test from "node:test";
import type { Request, RequestHandler, Response } from "express";

import { requireRoles } from "../../middleware/auth.js";
import {
  createListMaintenanceRequestsHandler,
  createMaintenanceRatingUpdateHandler,
  createMaintenanceRequestCreateHandler,
  createMaintenanceStatusUpdateHandler
} from "./maintenance.route.js";

type MaintenanceStatus = "BEKLEMEDE" | "ISLEMDE" | "TAMAMLANDI";

type MaintenanceRequestRecord = {
  id: string;
  residentId: string;
  residentName: string;
  residentEmail: string;
  category: string;
  description: string;
  photoUrl: string | null;
  status: MaintenanceStatus;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
  responseDueAt: Date | null;
  respondedAt: Date | null;
  escalatedAt: Date | null;
};

type EmailOutboxEntry = {
  toEmail: string;
  subject: string;
  body: string;
  category: string;
};

type MockResponseStore = {
  statusCode: number;
  body: unknown;
};

type MockRequestOptions = {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
  authRole?: "ADMIN" | "RESIDENT" | "SECURITY";
  authUserId?: string;
};

function createMockRequest(options: MockRequestOptions = {}): Request {
  return {
    body: options.body ?? {},
    params: options.params ?? {},
    query: options.query ?? {},
    authUser: options.authRole
      ? {
          id: options.authUserId ?? "actor_id",
          name: options.authRole === "ADMIN" ? "Site Yoneticisi" : "Ornek Sakin",
          email: options.authRole === "ADMIN" ? "admin@asys.local" : "resident@asys.local",
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

async function invokeHandler(handler: RequestHandler, req: Request, res: Response) {
  await handler(req, res, () => undefined);
}

function createInMemoryStore(seedRequests: MaintenanceRequestRecord[]) {
  const requestsById = new Map(seedRequests.map((request) => [request.id, { ...request }]));
  const outbox: EmailOutboxEntry[] = [];
  let idCounter = seedRequests.length;

  return {
    store: {
      async listMaintenanceRequests(input: {
        actorRole: "ADMIN" | "RESIDENT" | "SECURITY";
        actorUserId: string;
        category?: string;
        status?: MaintenanceStatus;
        createdFrom?: Date;
        createdTo?: Date;
      }) {
        const rows = Array.from(requestsById.values()).filter((request) => {
          if (input.actorRole === "RESIDENT" && request.residentId !== input.actorUserId) {
            return false;
          }
          if (input.category && !request.category.toLocaleLowerCase("tr-TR").includes(input.category.toLocaleLowerCase("tr-TR"))) {
            return false;
          }
          if (input.status && request.status !== input.status) {
            return false;
          }
          if (input.createdFrom && request.createdAt.getTime() < input.createdFrom.getTime()) {
            return false;
          }
          if (input.createdTo && request.createdAt.getTime() > input.createdTo.getTime()) {
            return false;
          }
          return true;
        });

        return rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      },
      async countOpenRequestsForResident(residentId: string) {
        return Array.from(requestsById.values()).filter(
          (request) => request.residentId === residentId && (request.status === "BEKLEMEDE" || request.status === "ISLEMDE")
        ).length;
      },
      async createMaintenanceRequest(input: {
        residentId: string;
        category: string;
        description: string;
        photoUrl: string | null;
      }) {
        const createdAt = new Date("2026-04-23T08:00:00.000Z");
        const isEmergency = input.category.toLocaleLowerCase("tr-TR").includes("acil");
        idCounter += 1;
        const created: MaintenanceRequestRecord = {
          id: `req_${idCounter}`,
          residentId: input.residentId,
          residentName: "Ornek Sakin",
          residentEmail: "resident@asys.local",
          category: input.category,
          description: input.description,
          photoUrl: input.photoUrl,
          status: "BEKLEMEDE",
          rating: null,
          createdAt,
          updatedAt: createdAt,
          responseDueAt: isEmergency ? new Date("2026-04-23T10:00:00.000Z") : null,
          respondedAt: null,
          escalatedAt: null
        };

        requestsById.set(created.id, created);
        return created;
      },
      async getMaintenanceRequestById(requestId: string) {
        const request = requestsById.get(requestId);
        return request ? { ...request } : null;
      },
      async updateMaintenanceStatus(requestId: string, status: MaintenanceStatus) {
        const existing = requestsById.get(requestId);
        if (!existing) {
          return null;
        }

        const updatedAt = new Date("2026-04-23T09:00:00.000Z");
        const updated: MaintenanceRequestRecord = {
          ...existing,
          status,
          respondedAt: existing.respondedAt ?? (status === "BEKLEMEDE" ? null : updatedAt),
          updatedAt
        };

        requestsById.set(requestId, updated);
        return updated;
      },
      async updateMaintenanceRating(requestId: string, rating: number) {
        const existing = requestsById.get(requestId);
        if (!existing) {
          return null;
        }

        const updated: MaintenanceRequestRecord = {
          ...existing,
          rating,
          updatedAt: new Date("2026-04-23T10:00:00.000Z")
        };

        requestsById.set(requestId, updated);
        return updated;
      },
      async listActiveAdminEmails() {
        return ["admin1@asys.local", "admin2@asys.local"];
      },
      async enqueueEmails(entries: EmailOutboxEntry[]) {
        outbox.push(...entries);
      }
    },
    getRequest(requestId: string) {
      return requestsById.get(requestId);
    },
    getOutbox() {
      return outbox.map((entry) => ({ ...entry }));
    }
  };
}

test("resident creates request with photo metadata, admin is notified, emergency deadline is tracked, and 4th open request is blocked", async () => {
  const fixture = createInMemoryStore([
    {
      id: "req_1",
      residentId: "usr_resident",
      residentName: "Ornek Sakin",
      residentEmail: "resident@asys.local",
      category: "Elektrik",
      description: "Salonda priz calismiyor.",
      photoUrl: null,
      status: "BEKLEMEDE",
      rating: null,
      createdAt: new Date("2026-04-22T08:00:00.000Z"),
      updatedAt: new Date("2026-04-22T08:00:00.000Z"),
      responseDueAt: null,
      respondedAt: null,
      escalatedAt: null
    },
    {
      id: "req_2",
      residentId: "usr_resident",
      residentName: "Ornek Sakin",
      residentEmail: "resident@asys.local",
      category: "Asansor",
      description: "Asansor kat aralarinda takiliyor.",
      photoUrl: null,
      status: "ISLEMDE",
      rating: null,
      createdAt: new Date("2026-04-22T10:00:00.000Z"),
      updatedAt: new Date("2026-04-22T10:00:00.000Z"),
      responseDueAt: null,
      respondedAt: new Date("2026-04-22T10:30:00.000Z"),
      escalatedAt: null
    }
  ]);

  const createHandler = createMaintenanceRequestCreateHandler(fixture.store);

  const createReq = createMockRequest({
    authRole: "RESIDENT",
    authUserId: "usr_resident",
    body: {
      category: "Acil Su Baskini",
      description: "Mutfakta su baskini var, acil destek gerekiyor.",
      photoUrl: "https://asys.local/mock/su-baskini.jpg"
    }
  });
  const createRes = createMockResponse();
  await invokeHandler(createHandler, createReq, createRes.response);

  assert.equal(createRes.store.statusCode, 201);
  const created = (createRes.store.body as { request: { id: string; responseDueAt: string | null; photoUrl: string } }).request;
  assert.equal(created.photoUrl, "https://asys.local/mock/su-baskini.jpg");
  assert.equal(created.responseDueAt, "2026-04-23T10:00:00.000Z");

  const outbox = fixture.getOutbox();
  assert.equal(outbox.length, 2);
  assert.equal(outbox[0]?.category, "MAINTENANCE_REQUEST_CREATED");

  const blockedReq = createMockRequest({
    authRole: "RESIDENT",
    authUserId: "usr_resident",
    body: {
      category: "Boya",
      description: "Duvarda nem kaynakli boya dokulmesi var.",
      photoUrl: ""
    }
  });
  const blockedRes = createMockResponse();
  await invokeHandler(createHandler, blockedReq, blockedRes.response);

  assert.equal(blockedRes.store.statusCode, 409);
  assert.deepEqual(blockedRes.store.body, {
    message: "Ayni anda en fazla 3 acik bakim talebi olusturabilirsiniz."
  });
});

test("admin status transition is constrained by allowed values and resident receives update notification", async () => {
  const fixture = createInMemoryStore([
    {
      id: "req_1",
      residentId: "usr_resident",
      residentName: "Ornek Sakin",
      residentEmail: "resident@asys.local",
      category: "Asansor",
      description: "Asansor ses yapiyor.",
      photoUrl: null,
      status: "BEKLEMEDE",
      rating: null,
      createdAt: new Date("2026-04-23T07:00:00.000Z"),
      updatedAt: new Date("2026-04-23T07:00:00.000Z"),
      responseDueAt: null,
      respondedAt: null,
      escalatedAt: null
    }
  ]);

  const updateStatusHandler = createMaintenanceStatusUpdateHandler(fixture.store);

  const updateReq = createMockRequest({
    authRole: "ADMIN",
    params: { requestId: "req_1" },
    body: {
      status: "ISLEMDE"
    }
  });
  const updateRes = createMockResponse();
  await invokeHandler(updateStatusHandler, updateReq, updateRes.response);

  assert.equal(updateRes.store.statusCode, 200);
  const updated = (updateRes.store.body as { request: { status: MaintenanceStatus; respondedAt: string | null } }).request;
  assert.equal(updated.status, "ISLEMDE");
  assert.equal(updated.respondedAt, "2026-04-23T09:00:00.000Z");

  const outbox = fixture.getOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.toEmail, "resident@asys.local");
  assert.equal(outbox[0]?.category, "MAINTENANCE_STATUS_UPDATED");

  const invalidStatusReq = createMockRequest({
    authRole: "ADMIN",
    params: { requestId: "req_1" },
    body: {
      status: "KAPANDI"
    }
  });
  const invalidStatusRes = createMockResponse();
  await invokeHandler(updateStatusHandler, invalidStatusReq, invalidStatusRes.response);

  assert.equal(invalidStatusRes.store.statusCode, 400);
});

test("resident can rate only completed maintenance requests and rating must be 1..5", async () => {
  const fixture = createInMemoryStore([
    {
      id: "req_1",
      residentId: "usr_resident",
      residentName: "Ornek Sakin",
      residentEmail: "resident@asys.local",
      category: "Boya",
      description: "Yatak odasinda boya kabardi.",
      photoUrl: null,
      status: "ISLEMDE",
      rating: null,
      createdAt: new Date("2026-04-21T07:00:00.000Z"),
      updatedAt: new Date("2026-04-21T08:00:00.000Z"),
      responseDueAt: null,
      respondedAt: new Date("2026-04-21T07:30:00.000Z"),
      escalatedAt: null
    }
  ]);

  const rateHandler = createMaintenanceRatingUpdateHandler(fixture.store);

  const prematureRateReq = createMockRequest({
    authRole: "RESIDENT",
    authUserId: "usr_resident",
    params: { requestId: "req_1" },
    body: {
      rating: 4
    }
  });
  const prematureRateRes = createMockResponse();
  await invokeHandler(rateHandler, prematureRateReq, prematureRateRes.response);

  assert.equal(prematureRateRes.store.statusCode, 409);

  const invalidRatingReq = createMockRequest({
    authRole: "RESIDENT",
    authUserId: "usr_resident",
    params: { requestId: "req_1" },
    body: {
      rating: 6
    }
  });
  const invalidRatingRes = createMockResponse();
  await invokeHandler(rateHandler, invalidRatingReq, invalidRatingRes.response);

  assert.equal(invalidRatingRes.store.statusCode, 400);

  await fixture.store.updateMaintenanceStatus("req_1", "TAMAMLANDI");

  const completeRateReq = createMockRequest({
    authRole: "RESIDENT",
    authUserId: "usr_resident",
    params: { requestId: "req_1" },
    body: {
      rating: 5
    }
  });
  const completeRateRes = createMockResponse();
  await invokeHandler(rateHandler, completeRateReq, completeRateRes.response);

  assert.equal(completeRateRes.store.statusCode, 200);
  assert.equal((completeRateRes.store.body as { request: { rating: number } }).request.rating, 5);
});

test("admin can filter maintenance history and resident only sees own history", async () => {
  const fixture = createInMemoryStore([
    {
      id: "req_1",
      residentId: "usr_resident",
      residentName: "Ornek Sakin",
      residentEmail: "resident@asys.local",
      category: "Asansor",
      description: "Asansor titretiyor.",
      photoUrl: null,
      status: "BEKLEMEDE",
      rating: null,
      createdAt: new Date("2026-04-12T10:00:00.000Z"),
      updatedAt: new Date("2026-04-12T10:00:00.000Z"),
      responseDueAt: null,
      respondedAt: null,
      escalatedAt: null
    },
    {
      id: "req_2",
      residentId: "usr_other",
      residentName: "Diger Sakin",
      residentEmail: "other@asys.local",
      category: "Su Tesisati",
      description: "Banyoda su kacagi.",
      photoUrl: null,
      status: "ISLEMDE",
      rating: null,
      createdAt: new Date("2026-04-18T11:00:00.000Z"),
      updatedAt: new Date("2026-04-18T11:00:00.000Z"),
      responseDueAt: new Date("2026-04-18T13:00:00.000Z"),
      respondedAt: new Date("2026-04-18T11:45:00.000Z"),
      escalatedAt: null
    }
  ]);

  const listHandler = createListMaintenanceRequestsHandler(fixture.store);

  const adminReq = createMockRequest({
    authRole: "ADMIN",
    authUserId: "usr_admin",
    query: {
      category: "su",
      dateFrom: "2026-04-10",
      dateTo: "2026-04-30"
    }
  });
  const adminRes = createMockResponse();
  await invokeHandler(listHandler, adminReq, adminRes.response);

  assert.equal(adminRes.store.statusCode, 200);
  const adminPayload = adminRes.store.body as { requests: Array<{ id: string }> };
  assert.equal(adminPayload.requests.length, 1);
  assert.equal(adminPayload.requests[0]?.id, "req_2");

  const residentReq = createMockRequest({
    authRole: "RESIDENT",
    authUserId: "usr_resident"
  });
  const residentRes = createMockResponse();
  await invokeHandler(listHandler, residentReq, residentRes.response);

  assert.equal(residentRes.store.statusCode, 200);
  const residentPayload = residentRes.store.body as { requests: Array<{ id: string }> };
  assert.equal(residentPayload.requests.length, 1);
  assert.equal(residentPayload.requests[0]?.id, "req_1");
});

test("non-admin role is denied by admin RBAC guard on status updates", async () => {
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
