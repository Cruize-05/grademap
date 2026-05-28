import { Router } from "express";
import { supabaseAdmin } from "../middleware/auth.js";

export const institutionsRouter = Router();

/** GET /api/institutions — public list for the onboarding picker. */
institutionsRouter.get("/", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("institutions")
      .select("id, code, name, email_domain, grade_mapping, max_grade_point")
      .order("name");

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});
