import {
  apartmentListResponseSchema,
  authMessageResponseSchema,
  managedUserActivationRequestSchema,
  managedUserCreateRequestSchema,
  managedUserListResponseSchema,
  managedUserMutationResponseSchema,
  managedUserUpdateRequestSchema,
  profileUpdateRequestSchema,
  userProfileResponseSchema,
  type Apartment,
  type ManagedUser,
  type Role,
  type UserProfile
} from "@asys/contracts";
import bcrypt from "bcrypt";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit.js";
import { toMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { createAuthMiddleware, requireRoles } from "../../middleware/auth.js";

type UserManagementStore = {
  listUsers: () => Promise<ManagedUser[]>;
  createUser: (input: {
    name: string;
    email: string;
    password: string;
    role: Role;
    phone: string | null;
    apartmentId: string | null;
  }) => Promise<ManagedUser>;
  updateUser: (
    userId: string,
    input: { name: string; phone: string | null; role?: Role; apartmentId: string | null }
  ) => Promise<ManagedUser | null>;
  setUserActivation: (userId: string, isActive: boolean) => Promise<ManagedUser | null>;
  listApartments: () => Promise<Apartment[]>;
  updateApartment: (apartmentId: string, input: { monthlyDue?: number; isOccupied?: boolean }) => Promise<Apartment | null>;
  getProfile: (userId: string) => Promise<UserProfile | null>;
  updateProfile: (userId: string, input: { name: string; phone: string | null }) => Promise<UserProfile | null>;
  recordAudit?: (input: Parameters<typeof recordAuditLog>[0]) => Promise<void>;
};

type UserManagementRouterOptions = {
  store?: UserManagementStore;
  authMiddleware?: RequestHandler;
};

const userIdParamsSchema = z.object({
  userId: z.string().trim().min(1)
});

const apartmentIdParamsSchema = z.object({
  apartmentId: z.string().trim().min(1)
});

const apartmentUpdateRequestSchema = z
  .object({
    monthlyDue: z.number().finite().nonnegative().optional(),
    isOccupied: z.boolean().optional()
  })
  .strict();

function apartmentLabel(apartment: { block: string; number: string }): string {
  return `${apartment.block}-${apartment.number}`;
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeApartmentId(value: string | null | undefined): string | null {
  if (value === null) {
    return null;
  }

  return nullableText(value);
}

function toManagedUser(row: {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  isActive: boolean;
  apartmentId: string | null;
  apartment: { block: string; number: string } | null;
}): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    isActive: row.isActive,
    apartmentId: row.apartmentId,
    apartmentLabel: row.apartment ? apartmentLabel(row.apartment) : null
  };
}

function toApartment(row: {
  id: string;
  block: string;
  floor: number;
  number: string;
  monthlyDue: unknown;
  isOccupied: boolean;
  resident: { id: string; name: string } | null;
}): Apartment {
  return {
    id: row.id,
    block: row.block,
    floor: row.floor,
    number: row.number,
    monthlyDue: toMoney(row.monthlyDue),
    isOccupied: row.isOccupied,
    residentId: row.resident?.id ?? null,
    residentName: row.resident?.name ?? null
  };
}

function toProfile(row: {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  isActive: boolean;
  apartment: {
    id: string;
    block: string;
    floor: number;
    number: string;
    monthlyDue: unknown;
    isOccupied: boolean;
    resident: { id: string; name: string } | null;
  } | null;
}): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    isActive: row.isActive,
    apartment: row.apartment ? toApartment(row.apartment) : null
  };
}

const defaultStore: UserManagementStore = {
  async listUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        isActive: true,
        apartmentId: true,
        apartment: {
          select: {
            block: true,
            number: true
          }
        }
      },
      orderBy: [{ role: "asc" }, { email: "asc" }]
    });

    return users.map(toManagedUser);
  },

  async createUser(input) {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          phone: input.phone,
          apartmentId: input.apartmentId
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          isActive: true,
          apartmentId: true,
          apartment: {
            select: {
              block: true,
              number: true
            }
          }
        }
      });

      if (input.apartmentId) {
        await tx.apartment.update({
          where: { id: input.apartmentId },
          data: { isOccupied: true }
        });
      }

      return user;
    });

    return toManagedUser(created);
  },

  async updateUser(userId, input) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, apartmentId: true }
    });

    if (!existing) {
      return null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: {
        name: string;
        phone: string | null;
        apartmentId: string | null;
        role?: Role;
      } = {
        name: input.name,
        phone: input.phone,
        apartmentId: input.apartmentId
      };
      if (input.role) {
        data.role = input.role;
      }

      const user = await tx.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          isActive: true,
          apartmentId: true,
          apartment: {
            select: {
              block: true,
              number: true
            }
          }
        }
      });

      if (existing.apartmentId && existing.apartmentId !== input.apartmentId) {
        await tx.apartment.update({
          where: { id: existing.apartmentId },
          data: { isOccupied: false }
        });
      }

      if (input.apartmentId) {
        await tx.apartment.update({
          where: { id: input.apartmentId },
          data: { isOccupied: true }
        });
      }

      return user;
    });

    return toManagedUser(updated);
  },

  async setUserActivation(userId, isActive) {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!existingUser) {
      return null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive,
        deactivatedAt: isActive ? null : new Date()
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        isActive: true,
        apartmentId: true,
        apartment: {
          select: {
            block: true,
            number: true
          }
        }
      }
    });

    return toManagedUser(updatedUser);
  },

  async listApartments() {
    const apartments = await prisma.apartment.findMany({
      select: {
        id: true,
        block: true,
        floor: true,
        number: true,
        monthlyDue: true,
        isOccupied: true,
        resident: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [{ block: "asc" }, { number: "asc" }]
    });

    return apartments.map(toApartment);
  },

  async updateApartment(apartmentId, input) {
    const existing = await prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: { id: true }
    });

    if (!existing) {
      return null;
    }

    const data: { monthlyDue?: number; isOccupied?: boolean } = {};
    if (input.monthlyDue !== undefined) {
      data.monthlyDue = input.monthlyDue;
    }
    if (input.isOccupied !== undefined) {
      data.isOccupied = input.isOccupied;
    }

    const updated = await prisma.apartment.update({
      where: { id: apartmentId },
      data,
      select: {
        id: true,
        block: true,
        floor: true,
        number: true,
        monthlyDue: true,
        isOccupied: true,
        resident: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return toApartment(updated);
  },

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        apartment: {
          select: {
            id: true,
            block: true,
            floor: true,
            number: true,
            monthlyDue: true,
            isOccupied: true,
            resident: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    return user ? toProfile(user) : null;
  },

  async updateProfile(userId, input) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        phone: input.phone
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        apartment: {
          select: {
            id: true,
            block: true,
            floor: true,
            number: true,
            monthlyDue: true,
            isOccupied: true,
            resident: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    return toProfile(user);
  },

  async recordAudit(input) {
    await recordAuditLog(input);
  }
};

export function createListManagedUsersHandler(store: UserManagementStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.status(200).json(
        managedUserListResponseSchema.parse({
          users: await store.listUsers()
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createManagedUserCreateHandler(store: UserManagementStore): RequestHandler {
  return async (req, res, next) => {
    const parsedBody = managedUserCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz kullanici verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const createdUser = await store.createUser({
        name: parsedBody.data.name.trim(),
        email: parsedBody.data.email,
        password: parsedBody.data.password,
        role: parsedBody.data.role,
        phone: nullableText(parsedBody.data.phone),
        apartmentId: normalizeApartmentId(parsedBody.data.apartmentId)
      });
      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "USER_CREATED",
        entityType: "user",
        entityId: createdUser.id,
        details: { role: createdUser.role, apartmentId: createdUser.apartmentId }
      });

      res.status(201).json(managedUserMutationResponseSchema.parse({ user: createdUser }));
    } catch (error) {
      next(error);
    }
  };
}

export function createManagedUserUpdateHandler(store: UserManagementStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = userIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz kullanici kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    const parsedBody = managedUserUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz kullanici verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const updatePayload: {
        name: string;
        phone: string | null;
        apartmentId: string | null;
        role?: Role;
      } = {
        name: parsedBody.data.name.trim(),
        phone: nullableText(parsedBody.data.phone),
        apartmentId: normalizeApartmentId(parsedBody.data.apartmentId)
      };
      if (parsedBody.data.role) {
        updatePayload.role = parsedBody.data.role;
      }

      const updatedUser = await store.updateUser(parsedParams.data.userId, {
        ...updatePayload
      });

      if (!updatedUser) {
        res.status(404).json({ message: "Kullanici bulunamadi." });
        return;
      }

      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "USER_UPDATED",
        entityType: "user",
        entityId: updatedUser.id,
        details: { role: updatedUser.role, apartmentId: updatedUser.apartmentId }
      });

      res.status(200).json(managedUserMutationResponseSchema.parse({ user: updatedUser }));
    } catch (error) {
      next(error);
    }
  };
}

export function createSetManagedUserActivationHandler(store: UserManagementStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = userIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        message: "Gecersiz kullanici kimligi.",
        errors: parsedParams.error.flatten()
      });
      return;
    }

    const parsedBody = managedUserActivationRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        message: "Gecersiz aktivasyon verisi.",
        errors: parsedBody.error.flatten()
      });
      return;
    }

    if (req.authUser?.id === parsedParams.data.userId && parsedBody.data.isActive === false) {
      res.status(409).json({ message: "Yonetici kendi hesabini pasife alamaz." });
      return;
    }

    try {
      const updatedUser = await store.setUserActivation(parsedParams.data.userId, parsedBody.data.isActive);

      if (!updatedUser) {
        res.status(404).json({
          message: "Kullanici bulunamadi."
        });
        return;
      }

      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: updatedUser.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        entityType: "user",
        entityId: updatedUser.id
      });

      res.status(200).json(
        managedUserMutationResponseSchema.parse({
          user: updatedUser
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createListApartmentsHandler(store: UserManagementStore): RequestHandler {
  return async (_req, res, next) => {
    try {
      res.status(200).json(apartmentListResponseSchema.parse({ apartments: await store.listApartments() }));
    } catch (error) {
      next(error);
    }
  };
}

export function createUpdateApartmentHandler(store: UserManagementStore): RequestHandler {
  return async (req, res, next) => {
    const parsedParams = apartmentIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: "Gecersiz daire kimligi.", errors: parsedParams.error.flatten() });
      return;
    }

    const parsedBody = apartmentUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz daire verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const apartmentUpdateInput: { monthlyDue?: number; isOccupied?: boolean } = {};
      if (parsedBody.data.monthlyDue !== undefined) {
        apartmentUpdateInput.monthlyDue = parsedBody.data.monthlyDue;
      }
      if (parsedBody.data.isOccupied !== undefined) {
        apartmentUpdateInput.isOccupied = parsedBody.data.isOccupied;
      }

      const updated = await store.updateApartment(parsedParams.data.apartmentId, apartmentUpdateInput);
      if (!updated) {
        res.status(404).json({ message: "Daire bulunamadi." });
        return;
      }

      await store.recordAudit?.({
        userId: req.authUser?.id ?? null,
        action: "APARTMENT_UPDATED",
        entityType: "apartment",
        entityId: updated.id,
        details: { monthlyDue: updated.monthlyDue, isOccupied: updated.isOccupied }
      });

      res.status(200).json(apartmentListResponseSchema.parse({ apartments: [updated] }));
    } catch (error) {
      next(error);
    }
  };
}

export function createProfileGetHandler(store: UserManagementStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    try {
      const profile = await store.getProfile(req.authUser.id);
      if (!profile) {
        res.status(404).json({ message: "Profil bulunamadi." });
        return;
      }

      res.status(200).json(userProfileResponseSchema.parse({ profile }));
    } catch (error) {
      next(error);
    }
  };
}

export function createProfileUpdateHandler(store: UserManagementStore): RequestHandler {
  return async (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    const parsedBody = profileUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Gecersiz profil verisi.", errors: parsedBody.error.flatten() });
      return;
    }

    try {
      const profile = await store.updateProfile(req.authUser.id, {
        name: parsedBody.data.name.trim(),
        phone: nullableText(parsedBody.data.phone)
      });
      if (!profile) {
        res.status(404).json({ message: "Profil bulunamadi." });
        return;
      }

      await store.recordAudit?.({
        userId: req.authUser.id,
        action: "PROFILE_UPDATED",
        entityType: "user",
        entityId: req.authUser.id
      });

      res.status(200).json(userProfileResponseSchema.parse({ profile }));
    } catch (error) {
      next(error);
    }
  };
}

export function createUserManagementRouter(options: UserManagementRouterOptions = {}) {
  const router = Router();
  const store = options.store ?? defaultStore;
  const authMiddleware = options.authMiddleware ?? createAuthMiddleware();

  router.use(authMiddleware);
  router.get("/profile", createProfileGetHandler(store));
  router.patch("/profile", createProfileUpdateHandler(store));
  router.get("/apartments", requireRoles(["ADMIN", "SECURITY"]), createListApartmentsHandler(store));
  router.patch("/apartments/:apartmentId", requireRoles(["ADMIN"]), createUpdateApartmentHandler(store));
  router.use(requireRoles(["ADMIN"]));
  router.get("/", createListManagedUsersHandler(store));
  router.post("/", createManagedUserCreateHandler(store));
  router.patch("/:userId", createManagedUserUpdateHandler(store));
  router.patch("/:userId/activation", createSetManagedUserActivationHandler(store));
  router.delete("/:userId", (_req, res) => {
    res.status(405).json(
      authMessageResponseSchema.parse({
        success: false,
        message: "Kullanici silme yerine pasife alma kullanilir; veri 6 ay saklama kuralini ihlal etmez."
      })
    );
  });

  return router;
}
