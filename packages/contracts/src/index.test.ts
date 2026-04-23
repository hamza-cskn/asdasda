import assert from "node:assert/strict";
import test from "node:test";

import {
  announcementCreateRequestSchema,
  announcementListResponseSchema,
  authSessionSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  maintenanceCreateRequestSchema,
  maintenanceListResponseSchema,
  maintenanceRatingUpdateRequestSchema,
  maintenanceStatusUpdateRequestSchema,
  managedUserActivationResponseSchema,
  managedUserListResponseSchema,
  resetPasswordRequestSchema,
  roleSchema
} from "./index.js";

test("role schema allows expected roles", () => {
  assert.equal(roleSchema.parse("ADMIN"), "ADMIN");
  assert.equal(roleSchema.parse("RESIDENT"), "RESIDENT");
  assert.equal(roleSchema.parse("SECURITY"), "SECURITY");
});

test("login request enforces minimum password length", () => {
  const parsed = loginRequestSchema.parse({
    email: "resident@asys.local",
    password: "UzunSifre1234!"
  });

  assert.equal(parsed.email, "resident@asys.local");
  assert.throws(() =>
    loginRequestSchema.parse({
      email: "resident@asys.local",
      password: "Kisa123!"
    })
  );
});

test("jwt auth session schema validates token payload", () => {
  const parsed = authSessionSchema.parse({
    mode: "JWT",
    accessToken: "token",
    expiresAt: "2026-04-23T10:00:00.000Z",
    user: {
      id: "usr_admin",
      name: "Site Yoneticisi",
      email: "admin@asys.local",
      role: "ADMIN",
      isActive: true
    }
  });

  assert.equal(parsed.user.role, "ADMIN");
});

test("password reset payload schemas validate", () => {
  const forgot = forgotPasswordRequestSchema.parse({
    email: "resident@asys.local"
  });
  const reset = resetPasswordRequestSchema.parse({
    token: "1234567890abcdef",
    newPassword: "YeniSifre12345!"
  });

  assert.equal(forgot.email, "resident@asys.local");
  assert.equal(reset.newPassword.length >= 12, true);
});

test("managed user responses validate activation payloads", () => {
  const list = managedUserListResponseSchema.parse({
    users: [
      {
        id: "usr_1",
        name: "Ornek Kullanici",
        email: "ornek@asys.local",
        role: "RESIDENT",
        isActive: true,
        phone: null,
        apartmentId: null,
        apartmentLabel: null
      }
    ]
  });
  const activation = managedUserActivationResponseSchema.parse({
    user: {
      id: "usr_1",
      name: "Ornek Kullanici",
      email: "ornek@asys.local",
      role: "RESIDENT",
      isActive: false,
      phone: null,
      apartmentId: null,
      apartmentLabel: null
    }
  });

  assert.equal(list.users[0]?.role, "RESIDENT");
  assert.equal(activation.user.isActive, false);
});

test("announcement schemas validate request and listing payloads", () => {
  const createPayload = announcementCreateRequestSchema.parse({
    title: "Asansor Bakimi",
    content: "22 Nisan 2026 14:00 itibariyla asansor bakimi baslayacaktir."
  });
  const listPayload = announcementListResponseSchema.parse({
    announcements: [
      {
        id: "ann_1",
        title: createPayload.title,
        content: createPayload.content,
        publishedAt: "2026-04-22T10:00:00.000Z",
        authorId: "usr_admin",
        authorName: "Site Yoneticisi"
      }
    ]
  });

  assert.equal(createPayload.title, "Asansor Bakimi");
  assert.equal(listPayload.announcements[0]?.authorName, "Site Yoneticisi");
});

test("maintenance schemas validate lifecycle payloads", () => {
  const createPayload = maintenanceCreateRequestSchema.parse({
    category: "Su Sizintisi",
    description: "Banyoda saat 09:00 civarinda su sizintisi basladi.",
    photoUrl: "https://asys.local/mock/su-sizintisi.jpg"
  });
  const statusPayload = maintenanceStatusUpdateRequestSchema.parse({
    status: "ISLEMDE"
  });
  const ratingPayload = maintenanceRatingUpdateRequestSchema.parse({
    rating: 5
  });
  const listPayload = maintenanceListResponseSchema.parse({
    requests: [
      {
        id: "req_1",
        residentId: "usr_resident",
        residentName: "Ornek Sakin",
        category: createPayload.category,
        description: createPayload.description,
        photoUrl: createPayload.photoUrl,
        status: "TAMAMLANDI",
        rating: ratingPayload.rating,
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T10:00:00.000Z",
        responseDueAt: "2026-04-23T10:00:00.000Z",
        respondedAt: "2026-04-23T09:00:00.000Z",
        escalatedAt: null
      }
    ]
  });

  assert.equal(statusPayload.status, "ISLEMDE");
  assert.equal(listPayload.requests[0]?.rating, 5);
  assert.throws(() => maintenanceRatingUpdateRequestSchema.parse({ rating: 6 }));
});
