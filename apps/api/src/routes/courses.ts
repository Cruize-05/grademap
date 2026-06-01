import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { supabaseAdmin } from "../middleware/auth.js";

export const coursesRouter = Router();

const MINING_BASE_URL = process.env["MINING_BASE_URL"] ?? "http://localhost:8000";
const K_THRESHOLD = Number(process.env["K_ANONYMITY_THRESHOLD"] ?? 10);

// Response shape from the mining service: either a full difficulty record or
// an insufficient-data sentinel. Validated before we trust/forward it.
const difficultyResponseSchema = z.union([
  z.object({
    courseId: z.string(),
    nStudents: z.number(),
    passRate: z.number(),
    avgGradePoint: z.number(),
    difficultyScore: z.number(),
    updatedAt: z.string(),
  }),
  z.object({
    insufficientData: z.boolean(),
    threshold: z.number(),
  }),
]);

const searchSchema = z.object({
  institution: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/** GET /api/courses — public read of the course catalogue.
 *  Accepts ?institution=CODE or ?institution_id=UUID to filter by institution.
 */
coursesRouter.get("/", async (req, res, next) => {
  try {
    const { institution, institution_id, q, limit } = searchSchema.parse(req.query);

    let query = supabaseAdmin
      .from("courses")
      .select("id, code, title, credits, level, institution_id")
      .order("code")
      .limit(limit);

    if (institution_id) {
      query = query.eq("institution_id", institution_id);
    } else if (institution) {
      const { data: inst } = await supabaseAdmin
        .from("institutions")
        .select("id")
        .eq("code", institution)
        .single();
      if (inst) query = query.eq("institution_id", inst.id);
    }

    if (q) {
      query = query.or(`code.ilike.%${q}%,title.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** GET /api/courses/:id/difficulty — k-anonymity enforced. */
coursesRouter.get("/:id/difficulty", async (req, res, next) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${MINING_BASE_URL}/courses/${id}/difficulty`);
    // Mining returns either DifficultyResponse {nStudents,...} or
    // InsufficientDataResponse {insufficientData: true, threshold}.
    // Defence-in-depth: re-check the gate even though mining already enforces it.
    const result = difficultyResponseSchema.parse(response.data);

    if ("insufficientData" in result) {
      res.json({ insufficientData: true, threshold: K_THRESHOLD });
      return;
    }
    if (result.nStudents < K_THRESHOLD) {
      res.json({ insufficientData: true, threshold: K_THRESHOLD });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
