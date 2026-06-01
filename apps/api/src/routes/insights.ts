import { Router, type Response, type NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import axios from "axios";
import { filterByKAnonymity } from "../lib/kAnonymity.js";

export const insightsRouter = Router();

const MINING_BASE_URL = process.env["MINING_BASE_URL"] ?? "http://localhost:8000";
const K_THRESHOLD = Number(process.env["K_ANONYMITY_THRESHOLD"] ?? 10);

/**
 * Forward an error from the mining service (or a validation error) to the
 * client. Axios errors carry the mining status + FastAPI `detail`, which we
 * surface verbatim so the UI can show e.g. "no grade history yet" (422) or
 * "model not ready" (503) instead of an opaque 500.
 */
function handleInsightError(err: unknown, res: Response, next: NextFunction): void {
  if (axios.isAxiosError(err) && err.response) {
    const detail = (err.response.data as { detail?: string } | undefined)?.detail;
    res.status(err.response.status).json({
      error: { code: "MINING_ERROR", message: detail ?? "Insight service error." },
    });
    return;
  }
  next(err);
}

const insightsLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.userId ?? req.ip ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
});

insightsRouter.use(["/risk-score", "/combinations/check", "/trajectory"], insightsLimiter);

const riskSchema = z.object({
  plannedCourseIds: z.array(z.string().uuid()).min(1).max(20),
});

// Response schemas — validate what the mining service returns before we trust
// and forward it. Shapes mirror the mining Pydantic models (camelCase).
const riskResponseSchema = z.object({
  score: z.number(),
  drivers: z.array(
    z.object({
      description: z.string(),
      courseIds: z.array(z.string()),
      severity: z.enum(["low", "medium", "high"]),
    })
  ),
  plannedCourseIds: z.array(z.string()),
});

const combinationsResponseSchema = z.object({
  combinations: z.array(
    z.object({
      courseA: z.string(),
      courseB: z.string(),
      support: z.number(),
      confidence: z.number(),
      lift: z.number(),
      nStudents: z.number(),
      coFailRate: z.number(),
    })
  ),
});

const trajectoryResponseSchema = z.object({
  projections: z.array(
    z.object({
      semesterIndex: z.number(),
      gpa: z.number(),
      ciLow: z.number(),
      ciHigh: z.number(),
    })
  ),
  modelInfo: z.string(),
});

insightsRouter.post("/risk-score", async (req, res, next) => {
  try {
    const { plannedCourseIds } = riskSchema.parse(req.body);

    const response = await axios.post(`${MINING_BASE_URL}/risk-score`, {
      studentId: req.userId,
      plannedCourseIds,
    });

    res.json(riskResponseSchema.parse(response.data));
  } catch (err) {
    handleInsightError(err, res, next);
  }
});

insightsRouter.post("/combinations/check", async (req, res, next) => {
  try {
    const { plannedCourseIds } = riskSchema.parse(req.body);

    const response = await axios.post(`${MINING_BASE_URL}/combinations/check`, {
      plannedCourseIds,
    });

    // Mining service already enforces the k=10 gate at the SQL layer, but we
    // re-filter here as defence-in-depth after validating the response shape.
    const data = combinationsResponseSchema.parse(response.data);
    const filtered = filterByKAnonymity(data.combinations, K_THRESHOLD);

    res.json({ combinations: filtered });
  } catch (err) {
    handleInsightError(err, res, next);
  }
});

const trajectorySchema = z.object({
  plannedSemesters: z
    .array(z.object({ courses: z.array(z.string().uuid()) }))
    .min(1)
    .max(4),
});

insightsRouter.post("/trajectory", async (req, res, next) => {
  try {
    const body = trajectorySchema.parse(req.body);

    const response = await axios.post(`${MINING_BASE_URL}/trajectory`, {
      studentId: req.userId,
      plannedSemesters: body.plannedSemesters,
    });

    res.json(trajectoryResponseSchema.parse(response.data));
  } catch (err) {
    handleInsightError(err, res, next);
  }
});
