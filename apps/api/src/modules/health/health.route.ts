import type { Request, Response } from "express";
import { Router } from "express";

export const healthRouter = Router();

export function getHealth(_req: Request, res: Response) {
  res.status(200).json({
    status: "ok",
    service: "api",
    slice: "S1"
  });
}

healthRouter.get("/", getHealth);
