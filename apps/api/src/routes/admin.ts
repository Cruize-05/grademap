import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { supabase, requireAdmin } from "../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const MINING_BASE_URL = process.env["MINING_BASE_URL"] ?? "http://localhost:8000";
const MINING_SECRET = process.env["MINING_SHARED_SECRET"] ?? "";

adminRouter.get("/quarantine", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("grade_submissions")
      .select(
        "id, profile_id, course_id, semester, academic_year, grade, created_at, courses(code, title)"
      )
      .eq("status", "quarantine")
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

const actionSchema = z.object({ notes: z.string().optional() });

adminRouter.post("/quarantine/:id/approve", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = actionSchema.parse(req.body);

    const { error } = await supabase
      .from("grade_submissions")
      .update({ status: "approved" })
      .eq("id", id)
      .eq("status", "quarantine");

    if (error) throw error;

    await supabase.from("admin_audit_log").insert({
      actor_id: req.userId,
      action: "approve_submission",
      target_id: id,
      notes,
    });

    res.json({ approved: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/quarantine/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = actionSchema.parse(req.body);

    const { error } = await supabase
      .from("grade_submissions")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("status", "quarantine");

    if (error) throw error;

    await supabase.from("admin_audit_log").insert({
      actor_id: req.userId,
      action: "reject_submission",
      target_id: id,
      notes,
    });

    res.json({ rejected: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/mining/run", async (req, res, next) => {
  try {
    const response = await axios.post(
      `${MINING_BASE_URL}/pipeline/run`,
      {},
      { headers: { "x-mining-secret": MINING_SECRET } }
    );
    res.json(response.data);
  } catch (err) {
    next(err);
  }
});
