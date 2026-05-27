import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../index.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data.",
        details: err.flatten(),
      },
    });
    return;
  }

  logger.error(err, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}
