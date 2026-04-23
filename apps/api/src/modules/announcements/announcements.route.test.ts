import assert from "node:assert/strict";
import test from "node:test";
import type { Announcement } from "@asys/contracts";
import type { Request, RequestHandler, Response } from "express";

import { requireRoles } from "../../middleware/auth.js";
import {
  createAnnouncementDeleteHandler,
  createAnnouncementPublishHandler,
  createAnnouncementUpdateHandler,
  createListAnnouncementsHandler
} from "./announcements.route.js";

type MockResponseStore = {
  statusCode: number;
  body: unknown;
};

type OutboxEntry = {
  toEmail: string;
  subject: string;
  body: string;
  category: string;
};

type AnnouncementRecord = Announcement;

type MockRequestOptions = {
  body?: unknown;
  params?: Record<string, string>;
  authRole?: "ADMIN" | "RESIDENT" | "SECURITY";
  authUserId?: string;
};

function createMockRequest(options: MockRequestOptions = {}): Request {
  const authRole = options.authRole;
  return {
    body: options.body ?? {},
    params: options.params ?? {},
    authUser: authRole
      ? {
          id: options.authUserId ?? "actor_id",
          name: "Test Actor",
          email: "actor@asys.local",
          role: authRole,
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

function createInMemoryStore(seedAnnouncements: AnnouncementRecord[] = []) {
  const announcementsById = new Map(seedAnnouncements.map((announcement) => [announcement.id, { ...announcement }]));
  const outbox: OutboxEntry[] = [];
  const residentEmails = ["resident1@asys.local", "resident2@asys.local"];
  let index = seedAnnouncements.length;

  return {
    store: {
      async listAnnouncements() {
        return Array.from(announcementsById.values()).sort((left, right) =>
          right.publishedAt.localeCompare(left.publishedAt)
        );
      },
      async createAnnouncement(input: { title: string; content: string; authorId: string }) {
        index += 1;
        const created: AnnouncementRecord = {
          id: `ann_${index}`,
          title: input.title,
          content: input.content,
          publishedAt: new Date(`2026-04-22T10:0${index}:00.000Z`).toISOString(),
          authorId: input.authorId,
          authorName: "Site Yoneticisi"
        };

        announcementsById.set(created.id, created);
        for (const toEmail of residentEmails) {
          outbox.push({
            toEmail,
            subject: `Yeni Duyuru: ${created.title}`,
            body: `${created.title}\n\n${created.content}`,
            category: "ANNOUNCEMENT_PUBLISHED"
          });
        }

        return {
          announcement: created,
          notifiedResidentCount: residentEmails.length
        };
      },
      async updateAnnouncement(announcementId: string, input: { title: string; content: string }) {
        const existing = announcementsById.get(announcementId);
        if (!existing) {
          return null;
        }

        const updated: AnnouncementRecord = {
          ...existing,
          title: input.title,
          content: input.content
        };
        announcementsById.set(announcementId, updated);
        return updated;
      },
      async deleteAnnouncement(announcementId: string) {
        return announcementsById.delete(announcementId);
      }
    },
    getOutbox() {
      return outbox.map((entry) => ({ ...entry }));
    }
  };
}

async function invokeHandler(handler: RequestHandler, req: Request, res: Response) {
  await handler(req, res, () => undefined);
}

test("admin can publish/edit/delete announcements and residents get descending history", async () => {
  const fixture = createInMemoryStore([
    {
      id: "ann_1",
      title: "Eski Duyuru",
      content: "Bu duyuru onceki gunden kalmistir.",
      publishedAt: "2026-04-21T09:00:00.000Z",
      authorId: "usr_admin",
      authorName: "Site Yoneticisi"
    }
  ]);

  const publishHandler = createAnnouncementPublishHandler(fixture.store);
  const listHandler = createListAnnouncementsHandler(fixture.store);
  const updateHandler = createAnnouncementUpdateHandler(fixture.store);
  const deleteHandler = createAnnouncementDeleteHandler(fixture.store);

  const publishReq = createMockRequest({
    authRole: "ADMIN",
    authUserId: "usr_admin",
    body: {
      title: "Asansor Bakimi",
      content: "22 Nisan 2026 14:00 itibariyla asansor bakimi baslayacaktir."
    }
  });
  const publishRes = createMockResponse();
  await invokeHandler(publishHandler, publishReq, publishRes.response);

  assert.equal(publishRes.store.statusCode, 201);
  const created = (publishRes.store.body as { announcement: AnnouncementRecord }).announcement;
  assert.equal(created.title, "Asansor Bakimi");
  assert.equal(fixture.getOutbox().length, 2);
  assert.equal(fixture.getOutbox()[0]?.category, "ANNOUNCEMENT_PUBLISHED");

  const residentListReq = createMockRequest({ authRole: "RESIDENT", authUserId: "usr_resident" });
  const residentListRes = createMockResponse();
  await invokeHandler(listHandler, residentListReq, residentListRes.response);

  assert.equal(residentListRes.store.statusCode, 200);
  const listPayload = residentListRes.store.body as { announcements: AnnouncementRecord[] };
  assert.equal(listPayload.announcements.length, 2);
  assert.equal(listPayload.announcements[0]?.id, created.id);
  assert.equal(listPayload.announcements[1]?.id, "ann_1");

  const updateReq = createMockRequest({
    authRole: "ADMIN",
    params: { announcementId: created.id },
    body: {
      title: "Asansor Bakimi Guncellendi",
      content: "Bakim saati 15:00 olarak guncellenmistir."
    }
  });
  const updateRes = createMockResponse();
  await invokeHandler(updateHandler, updateReq, updateRes.response);

  assert.equal(updateRes.store.statusCode, 200);
  assert.equal(
    (updateRes.store.body as { announcement: AnnouncementRecord }).announcement.title,
    "Asansor Bakimi Guncellendi"
  );

  const deleteReq = createMockRequest({
    authRole: "ADMIN",
    params: { announcementId: created.id }
  });
  const deleteRes = createMockResponse();
  await invokeHandler(deleteHandler, deleteReq, deleteRes.response);

  assert.equal(deleteRes.store.statusCode, 200);

  const finalListRes = createMockResponse();
  await invokeHandler(listHandler, residentListReq, finalListRes.response);
  assert.equal((finalListRes.store.body as { announcements: AnnouncementRecord[] }).announcements.length, 1);
});

test("admin can publish announcements repeatedly without state corruption", async () => {
  const fixture = createInMemoryStore();
  const publishHandler = createAnnouncementPublishHandler(fixture.store);
  const listHandler = createListAnnouncementsHandler(fixture.store);

  const firstPayload = {
    title: "Ilk Duyuru",
    content: "Bu ilk duyuru metni normal bir uzunlukta yazilmistir."
  };
  const secondPayload = {
    title: "Ikinci Duyuru",
    content: "Bu ikinci duyuru metni de ayni sekilde gecerli bir icerik sunar."
  };

  const firstReq = createMockRequest({
    authRole: "ADMIN",
    authUserId: "usr_admin",
    body: firstPayload
  });
  const firstRes = createMockResponse();
  await invokeHandler(publishHandler, firstReq, firstRes.response);
  assert.equal(firstRes.store.statusCode, 201);

  const secondReq = createMockRequest({
    authRole: "ADMIN",
    authUserId: "usr_admin",
    body: secondPayload
  });
  const secondRes = createMockResponse();
  await invokeHandler(publishHandler, secondReq, secondRes.response);
  assert.equal(secondRes.store.statusCode, 201);

  const listReq = createMockRequest({ authRole: "RESIDENT", authUserId: "usr_resident" });
  const listRes = createMockResponse();
  await invokeHandler(listHandler, listReq, listRes.response);
  assert.equal(listRes.store.statusCode, 200);

  const announcements = (listRes.store.body as { announcements: AnnouncementRecord[] }).announcements;
  assert.equal(announcements.length, 2);
  assert.equal(announcements[0]?.title, secondPayload.title);
  assert.equal(announcements[1]?.title, firstPayload.title);
  assert.equal(fixture.getOutbox().length, 4);
});

test("non-admin role is denied by admin RBAC guard on announcement mutations", async () => {
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
