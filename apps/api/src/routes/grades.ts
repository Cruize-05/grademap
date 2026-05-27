import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { supabaseAdmin } from "../middleware/auth.js";

export const gradesRouter = Router();

const gradesLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => req.userId ?? req.ip ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
});

gradesRouter.use(gradesLimiter);

const gradeSubmitSchema = z.object({
  courseId: z.string().uuid(),
  semester: z.union([z.literal(1), z.literal(2)]),
  academicYear: z.number().int().min(2000).max(2100),
  grade: z.string().min(1).max(5),
});

const csvRowSchema = gradeSubmitSchema.extend({ rowIndex: z.number().int() });

gradesRouter.post("/", async (req, res, next) => {
  try {
    const body = gradeSubmitSchema.parse(req.body);

    // Course catalogue is publicly readable; use admin for the existence check
    // to avoid an unnecessary RLS hop.
    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("id, institution_id")
      .eq("id", body.courseId)
      .single();

    if (courseErr || !course) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found." } });
      return;
    }

    // INSERT runs as the user so the gs_insert RLS policy verifies profile_id = auth.uid().
    const { data, error } = await req
      .supabase!.from("grade_submissions")
      .insert({
        profile_id: req.userId,
        course_id: body.courseId,
        semester: body.semester,
        academic_year: body.academicYear,
        grade: body.grade,
        status: "quarantine",
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

gradesRouter.post("/bulk", async (req, res, next) => {
  try {
    const rows = z.array(csvRowSchema).parse(req.body);
    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const { data, error } = await req
          .supabase!.from("grade_submissions")
          .insert({
            profile_id: req.userId,
            course_id: row.courseId,
            semester: row.semester,
            academic_year: row.academicYear,
            grade: row.grade,
            status: "quarantine",
          })
          .select("id")
          .single();

        if (error) throw error;
        return { rowIndex: row.rowIndex, success: true, submissionId: data?.id };
      })
    );

    const output = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { rowIndex: rows[i]?.rowIndex ?? i, success: false, error: String(r.reason) }
    );

    res.json(output);
  } catch (err) {
    next(err);
  }
});

gradesRouter.get("/mine", async (req, res, next) => {
  try {
    // RLS gs_select policy ensures only own rows are returned even if profile_id is omitted.
    const { data, error } = await req
      .supabase!.from("grade_submissions")
      .select(
        "id, course_id, semester, academic_year, grade, grade_point, status, created_at, courses(code, title, credits)"
      )
      .eq("profile_id", req.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});
