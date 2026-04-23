import type { NextFunction, Request, Response } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const maybeStatus = typeof err === "object" && err !== null && "statusCode" in err ? Number(err.statusCode) : 500;
  const statusCode = Number.isInteger(maybeStatus) && maybeStatus >= 400 && maybeStatus < 600 ? maybeStatus : 500;
  const message = err instanceof Error ? err.message : "Bilinmeyen sunucu hatasi";
  res.status(statusCode).json({ message });
}
