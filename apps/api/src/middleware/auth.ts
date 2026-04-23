import type { Role } from "@asys/contracts";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env.js";

export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const AUTH_COOKIE_NAME = "asys_access_token";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
  iss: "asys-api";
  aud: "asys-web";
};

type AuthMiddlewareOptions = {
  jwtSecret?: string;
  userLookup?: (userId: string) => Promise<AuthenticatedUser | null>;
};

const verifiedPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "RESIDENT", "SECURITY"]),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  iss: z.literal("asys-api"),
  aud: z.literal("asys-web")
});

async function defaultUserLookup(userId: string): Promise<AuthenticatedUser | null> {
  const { prisma } = await import("../lib/prisma.js");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  });

  return user;
}

function extractTokenFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawKey, ...rawValueParts] = cookie.trim().split("=");
    if (rawKey === AUTH_COOKIE_NAME) {
      return rawValueParts.join("=") || null;
    }
  }

  return null;
}

export function getTokenFromRequest(req: Request): string | null {
  const authorization = req.header("authorization")?.trim();
  if (authorization && /^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim();
  }

  return extractTokenFromCookieHeader(req.header("cookie"));
}

export function signAccessToken(user: Pick<AuthenticatedUser, "id" | "email" | "role">, now: Date = new Date()) {
  const token = jwt.sign(
    {
      role: user.role,
      email: user.email
    },
    env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      issuer: "asys-api",
      audience: "asys-web"
    }
  );

  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();

  return {
    token,
    expiresAt
  };
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return req.secure || forwardedProto === "https";
}

export function buildAuthCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: env.ENFORCE_HTTPS || env.NODE_ENV === "production" || isHttpsRequest(req),
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000
  };
}

export function attachAuthCookie(res: Response, token: string, options: CookieOptions): void {
  res.cookie(AUTH_COOKIE_NAME, token, options);
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    path: "/"
  });
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}): RequestHandler {
  const jwtSecret = options.jwtSecret ?? env.JWT_SECRET;
  const userLookup = options.userLookup ?? defaultUserLookup;

  return async (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ message: "Kimlik dogrulama belirteci gerekli." });
      return;
    }

    try {
      const verified = jwt.verify(token, jwtSecret, {
        issuer: "asys-api",
        audience: "asys-web"
      });
      const payload = verifiedPayloadSchema.parse(verified);

      const user = await userLookup(payload.sub);
      if (!user) {
        res.status(401).json({ message: "Kullanici oturumu gecersiz." });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ message: "Bu hesap pasif durumda. Lutfen yonetici ile iletisime gecin." });
        return;
      }

      if (user.role !== payload.role) {
        res.status(403).json({ message: "Oturum rolu guncel hesap rolu ile uyusmuyor." });
        return;
      }

      req.authUser = user;
      req.authToken = token;
      req.authTokenExpiresAt = new Date(payload.exp * 1000).toISOString();
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ message: "Oturum suresi doldu. Lutfen tekrar giris yapin." });
        return;
      }

      res.status(401).json({ message: "Gecersiz oturum belirteci." });
    }
  };
}

export function requireRoles(allowedRoles: Role[]): RequestHandler {
  return (req, res, next) => {
    const role = req.authUser?.role;

    if (!role) {
      res.status(401).json({ message: "Kimlik dogrulama gerekli." });
      return;
    }

    if (!allowedRoles.includes(role)) {
      res.status(403).json({ message: "Bu islem icin yetkiniz bulunmuyor." });
      return;
    }

    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authToken?: string;
      authTokenExpiresAt?: string;
    }
  }
}
