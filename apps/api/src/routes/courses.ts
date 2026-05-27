import { Router } from "express";
import { z } from "zod";
import { supabase } from "../middleware/auth.js";
import axios from "axios";

export const coursesRouter = Router();

const MINING_BASE_URL = process.env["MINING_BASE_URL"] ?? "http://localhost:8000";
const K_THRESHOLD = Number(process.env["K_ANONYMITY_THRESHOLD"] ?? 10);

const searchSchema = z.object({
  institution: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

coursesRouter.get("/", async (req, res, next) => {
  try {
    const { institution, q, limit } = searchSchema.parse(req.query);

    let query = supabase
      .from("courses")
      .select("id, code, title, credits, level, institution_id")
      .limit(limit);

    if (institution) {
      const { data: inst } = await supabase
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

coursesRouter.get("/:id/difficulty", async (req, res, next) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${MINING_BASE_URL}/courses/${id}/difficulty`);
    const result = response.data as { n_students?: number };

    if (result.n_students !== undefined && result.n_students < K_THRESHOLD) {
      res.json({ insufficientData: true, threshold: K_THRESHOLD });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
