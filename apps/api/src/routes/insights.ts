import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import axios from "axios";

export const insightsRouter = Router();

const MINING_BASE_URL = process.env["MINING_BASE_URL"] ?? "http://localhost:8000";
const K_THRESHOLD = Number(process.env["K_ANONYMITY_THRESHOLD"] ?? 10);

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

insightsRouter.post("/risk-score", async (req, res, next) => {
  try {
    const { plannedCourseIds } = riskSchema.parse(req.body);

    const response = await axios.post(`${MINING_BASE_URL}/risk-score`, {
      studentId: req.userId,
      plannedCourseIds,
    });

    res.json(response.data);
  } catch (err) {
    next(err);
  }
});

insightsRouter.post("/combinations/check", async (req, res, next) => {
  try {
    const { plannedCourseIds } = riskSchema.parse(req.body);

    const response = await axios.post(`${MINING_BASE_URL}/combinations/check`, {
      plannedCourseIds,
    });

    const data = response.data as { combinations?: Array<{ n_students: number }> };
    const filtered = (data.combinations ?? []).filter((c) => c.n_students >= K_THRESHOLD);

    res.json({ combinations: filtered });
  } catch (err) {
    next(err);
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

    res.json(response.data);
  } catch (err) {
    next(err);
  }
});
