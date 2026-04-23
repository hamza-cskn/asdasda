import {
  authLoginResponseSchema,
  authMessageResponseSchema,
  authSessionResponseSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  type Role
} from "@asys/contracts";
import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";

import {
  attachAuthCookie,
  buildAuthCookieOptions,
  clearAuthCookie,
  createAuthMiddleware,
  signAccessToken
} from "../../middleware/auth.js";
import { recordAuditLog } from "../../lib/audit.js";

type AuthUserRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

type EmailOutboxEntry = {
  toEmail: string;
  subject: string;
  body: string;
  category: string;
};

type AuthStore = {
  findUserByEmail: (email: string) => Promise<AuthUserRecord | null>;
  setLoginFailureState: (userId: string, failedLoginAttempts: number, lockedUntil: Date | null) => Promise<void>;
  clearLoginFailureState: (userId: string) => Promise<void>;
  createPasswordResetToken: (userId: string, tokenHash: string, expiresAt: Date) => Promise<void>;
  findPasswordResetToken: (tokenHash: string) => Promise<PasswordResetTokenRecord | null>;
  markPasswordResetTokenUsed: (tokenId: string) => Promise<void>;
  updatePasswordHash: (userId: string, passwordHash: string) => Promise<void>;
  enqueueEmail: (entry: EmailOutboxEntry) => Promise<void>;
  recordAudit?: (input: { userId: string | null; action: string; entityType: string; entityId?: string | null }) => Promise<void>;
};

type AuthRouterOptions = {
  store?: AuthStore;
  now?: () => Date;
  passwordSaltRounds?: number;
};

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_MINUTES = 15;
const PASSWORD_RESET_TOKEN_MINUTES = 60;
const MALICIOUS_PAYLOAD_PATTERN = /<\s*script\b|\bunion\b|\bselect\b\s+.+\s+\bfrom\b|\bdrop\b|\bor\b\s+1=1|--|\/\*|\*\/|;/i;

const defaultStore: AuthStore = {
  async findUserByEmail(email) {
    const { prisma } = await import("../../lib/prisma.js");
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true
      }
    });

    return user;
  },

  async setLoginFailureState(userId, failedLoginAttempts, lockedUntil) {
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts,
        lockedUntil
      }
    });
  },

  async clearLoginFailureState(userId) {
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });
  },

  async createPasswordResetToken(userId, tokenHash, expiresAt) {
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          userId,
          usedAt: null
        },
        data: {
          usedAt: new Date()
        }
      }),
      prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt
        }
      })
    ]);
  },

  async findPasswordResetToken(tokenHash) {
    const { prisma } = await import("../../lib/prisma.js");
    const token = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true
      }
    });

    return token;
  },

  async markPasswordResetTokenUsed(tokenId) {
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.passwordResetToken.update({
      where: { id: tokenId },
      data: {
        usedAt: new Date()
      }
    });
  },

  async updatePasswordHash(userId, passwordHash) {
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash
      }
    });
  },

  async enqueueEmail(entry) {
    const { prisma } = await import("../../lib/prisma.js");
    await prisma.emailOutbox.create({
      data: {
        toEmail: entry.toEmail,
        subject: entry.subject,
        body: entry.body,
        category: entry.category
      }
    });
  },

  async recordAudit(input) {
    await recordAuditLog(input);
  }
};

function hasMaliciousPayload(value: unknown): boolean {
  const serialized = JSON.stringify(value) ?? "";
  return MALICIOUS_PAYLOAD_PATTERN.test(serialized);
}

function sendValidationError(res: Response, message: string, details: unknown): void {
  res.status(400).json({
    message,
    errors: details
  });
}

function buildUserView(user: Pick<AuthUserRecord, "id" | "name" | "email" | "role" | "isActive">) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive
  };
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createLoginHandler(
  store: AuthStore,
  now: () => Date
): RequestHandler {
  return async (req: Request, res: Response, next) => {
    if (hasMaliciousPayload(req.body)) {
      res.status(400).json({ message: "Guvenlik politikasi nedeniyle istek reddedildi." });
      return;
    }

    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, "Gecersiz giris verisi.", parsed.error.flatten());
      return;
    }

    try {
      const user = await store.findUserByEmail(parsed.data.email.toLowerCase());
      if (!user) {
        res.status(401).json({ message: "E-posta veya sifre hatali." });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ message: "Bu hesap pasif durumda. Lutfen yonetici ile iletisime gecin." });
        return;
      }

      const currentTime = now();
      if (user.lockedUntil && user.lockedUntil.getTime() > currentTime.getTime()) {
        res.status(423).json({ message: "Hesap gecici olarak kilitlendi. 15 dakika sonra tekrar deneyin." });
        return;
      }

      const isPasswordValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!isPasswordValid) {
        const nextAttempts = user.failedLoginAttempts + 1;
        if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
          const lockedUntil = new Date(currentTime.getTime() + ACCOUNT_LOCK_MINUTES * 60 * 1000);
          await store.setLoginFailureState(user.id, 0, lockedUntil);
          res.status(423).json({ message: "Hesap gecici olarak kilitlendi. 15 dakika sonra tekrar deneyin." });
          return;
        }

        await store.setLoginFailureState(user.id, nextAttempts, null);
        res.status(401).json({ message: "E-posta veya sifre hatali." });
        return;
      }

      await store.clearLoginFailureState(user.id);
      const { token, expiresAt } = signAccessToken(user, currentTime);
      attachAuthCookie(res, token, buildAuthCookieOptions(req));
      await store.recordAudit?.({
        userId: user.id,
        action: "LOGIN_SUCCEEDED",
        entityType: "auth",
        entityId: user.id
      });

      res.status(200).json(
        authLoginResponseSchema.parse({
          mode: "JWT",
          accessToken: token,
          expiresAt,
          user: buildUserView(user)
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createMeHandler(): RequestHandler {
  return (req: Request, res: Response) => {
    if (!req.authUser || !req.authToken || !req.authTokenExpiresAt) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    res.status(200).json(
      authSessionResponseSchema.parse({
        mode: "JWT",
        accessToken: req.authToken,
        expiresAt: req.authTokenExpiresAt,
        user: buildUserView(req.authUser)
      })
    );
  };
}

export function createLogoutHandler(): RequestHandler {
  return (_req: Request, res: Response) => {
    clearAuthCookie(res);
    res.status(200).json(
      authMessageResponseSchema.parse({
        success: true,
        message: "Oturum kapatildi."
      })
    );
  };
}

export function createForgotPasswordHandler(store: AuthStore, now: () => Date): RequestHandler {
  return async (req: Request, res: Response, next) => {
    if (hasMaliciousPayload(req.body)) {
      res.status(400).json({ message: "Guvenlik politikasi nedeniyle istek reddedildi." });
      return;
    }

    const parsed = forgotPasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, "Gecersiz sifre sifirlama istegi.", parsed.error.flatten());
      return;
    }

    try {
      const user = await store.findUserByEmail(parsed.data.email.toLowerCase());
      if (user && user.isActive) {
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(rawToken);
        const expiresAt = new Date(now().getTime() + PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000);

        await store.createPasswordResetToken(user.id, tokenHash, expiresAt);
        await store.enqueueEmail({
          toEmail: user.email,
          subject: "ASYS Sifre Sifirlama",
          body: `Sifre sifirlama tokeniniz: ${rawToken}`,
          category: "PASSWORD_RESET"
        });
      }

      res.status(200).json(
        authMessageResponseSchema.parse({
          success: true,
          message: "Eger hesap bulunduysa sifre sifirlama adimlari e-posta kutunuza gonderildi."
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createResetPasswordHandler(
  store: AuthStore,
  now: () => Date,
  passwordSaltRounds: number
): RequestHandler {
  return async (req: Request, res: Response, next) => {
    if (hasMaliciousPayload(req.body)) {
      res.status(400).json({ message: "Guvenlik politikasi nedeniyle istek reddedildi." });
      return;
    }

    const parsed = resetPasswordRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, "Gecersiz sifre sifirlama verisi.", parsed.error.flatten());
      return;
    }

    try {
      const tokenHash = hashResetToken(parsed.data.token);
      const tokenRecord = await store.findPasswordResetToken(tokenHash);
      if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt.getTime() <= now().getTime()) {
        res.status(400).json({ message: "Sifirlama baglantisi gecersiz veya suresi dolmus." });
        return;
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, passwordSaltRounds);
      await store.updatePasswordHash(tokenRecord.userId, passwordHash);
      await store.clearLoginFailureState(tokenRecord.userId);
      await store.markPasswordResetTokenUsed(tokenRecord.id);
      await store.recordAudit?.({
        userId: tokenRecord.userId,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "auth",
        entityId: tokenRecord.userId
      });

      res.status(200).json(
        authMessageResponseSchema.parse({
          success: true,
          message: "Sifreniz guncellendi. Yeni sifrenizle giris yapabilirsiniz."
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export function createAuthRouter(options: AuthRouterOptions = {}) {
  const authRouter = Router();
  const store = options.store ?? defaultStore;
  const now = options.now ?? (() => new Date());
  const passwordSaltRounds = options.passwordSaltRounds ?? 10;
  const authMiddleware = createAuthMiddleware();

  authRouter.post("/login", createLoginHandler(store, now));
  authRouter.get("/me", authMiddleware, createMeHandler());
  authRouter.post("/logout", createLogoutHandler());
  authRouter.post("/forgot-password", createForgotPasswordHandler(store, now));
  authRouter.post("/reset-password", createResetPasswordHandler(store, now, passwordSaltRounds));

  return authRouter;
}

export type { AuthStore, AuthUserRecord, PasswordResetTokenRecord, EmailOutboxEntry };
