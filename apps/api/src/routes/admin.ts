import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { supabaseAdmin, requireAdmin } from "../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const MINING_BASE_URL = process.env["MINING_BASE_URL"] ?? "http://localhost:8000";
const MINING_SECRET = process.env["MINING_SHARED_SECRET"] ?? "";

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const countFor = (status: string) =>
      supabaseAdmin
        .from("grade_submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

    const [quarantine, approved, rejected] = await Promise.all([
      countFor("quarantine"),
      countFor("approved"),
      countFor("rejected"),
    ]);

    const { data: lastRun, error: runError } = await supabaseAdmin
      .from("mining_runs")
      .select("id, started_at, finished_at, status, row_count_input")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) throw runError;

    res.json({
      submissions: {
        quarantine: quarantine.count ?? 0,
        approved: approved.count ?? 0,
        rejected: rejected.count ?? 0,
      },
      lastMiningRun: lastRun,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/audit-log", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_id, action, target_id, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/quarantine", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
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

    const { error } = await supabaseAdmin
      .from("grade_submissions")
      .update({ status: "approved" })
      .eq("id", id)
      .eq("status", "quarantine");

    if (error) throw error;

    await supabaseAdmin.from("admin_audit_log").insert({
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

    const { error } = await supabaseAdmin
      .from("grade_submissions")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("status", "quarantine");

    if (error) throw error;

    await supabaseAdmin.from("admin_audit_log").insert({
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
