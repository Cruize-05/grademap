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

// ─── POST /api/grades ─────────────────────────────────────────────────────────

gradesRouter.post("/", async (req, res, next) => {
  try {
    const body = gradeSubmitSchema.parse(req.body);

    // Fetch caller's profile (own row via RLS).
    const { data: profile, error: profileErr } = await req
      .supabase!.from("profiles")
      .select("institution_id")
      .eq("id", req.userId)
      .maybeSingle();

    if (profileErr) throw profileErr;

    if (!profile) {
      res
        .status(400)
        .json({ error: { code: "NO_PROFILE", message: "Complete onboarding first." } });
      return;
    }

    // Fetch institution grade_mapping (institutions is a public table).
    const { data: institution, error: instErr } = await supabaseAdmin
      .from("institutions")
      .select("grade_mapping")
      .eq("id", profile.institution_id)
      .single();

    if (instErr) throw instErr;

    const gradeMapping = (institution?.grade_mapping ?? {}) as Record<string, number>;
    const hasMapping = Object.keys(gradeMapping).length > 0;

    // Validate grade alphabet (skip if institution has no mapping configured yet).
    if (hasMapping && !Object.hasOwn(gradeMapping, body.grade)) {
      const allowed = Object.keys(gradeMapping).join(", ");
      res.status(422).json({
        error: {
          code: "INVALID_GRADE",
          message: `Grade '${body.grade}' is not in the allowed alphabet. Allowed: ${allowed}`,
        },
      });
      return;
    }

    // Verify course exists and belongs to the caller's institution.
    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("id, institution_id")
      .eq("id", body.courseId)
      .single();

    if (courseErr || !course) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found." } });
      return;
    }

    if (course.institution_id !== profile.institution_id) {
      res.status(422).json({
        error: {
          code: "INSTITUTION_MISMATCH",
          message: "This course belongs to a different institution.",
        },
      });
      return;
    }

    const gradePoint = hasMapping ? (gradeMapping[body.grade] ?? null) : null;

    // INSERT via user-client so gs_insert RLS (profile_id = auth.uid()) is enforced.
    const { data, error } = await req
      .supabase!.from("grade_submissions")
      .insert({
        profile_id: req.userId,
        course_id: body.courseId,
        semester: body.semester,
        academic_year: body.academicYear,
        grade: body.grade,
        grade_point: gradePoint,
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

// ─── POST /api/grades/bulk ────────────────────────────────────────────────────

gradesRouter.post("/bulk", async (req, res, next) => {
  try {
    const rows = z.array(csvRowSchema).parse(req.body);

    // Resolve caller's institution once.
    const { data: callerProfile, error: profileErr } = await req
      .supabase!.from("profiles")
      .select("institution_id")
      .eq("id", req.userId)
      .maybeSingle();

    if (profileErr) throw profileErr;

    if (!callerProfile) {
      res
        .status(400)
        .json({ error: { code: "NO_PROFILE", message: "Complete onboarding first." } });
      return;
    }

    const { data: institution, error: instErr } = await supabaseAdmin
      .from("institutions")
      .select("grade_mapping")
      .eq("id", callerProfile.institution_id)
      .single();

    if (instErr) throw instErr;

    const gradeMapping = (institution?.grade_mapping ?? {}) as Record<string, number>;
    const hasMapping = Object.keys(gradeMapping).length > 0;

    // Batch-fetch all unique courses referenced by the upload.
    const courseIds = [...new Set(rows.map((r) => r.courseId))];
    const { data: courses } = await supabaseAdmin
      .from("courses")
      .select("id, institution_id")
      .in("id", courseIds);

    const courseMap = new Map((courses ?? []).map((c) => [c.id as string, c]));

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        // Per-row validation before inserting.
        const course = courseMap.get(row.courseId);
        if (!course) throw new Error("Course not found.");
        if (course.institution_id !== callerProfile.institution_id) {
          throw new Error("Course belongs to a different institution.");
        }
        if (hasMapping && !Object.hasOwn(gradeMapping, row.grade)) {
          const allowed = Object.keys(gradeMapping).join(", ");
          throw new Error(`Grade '${row.grade}' is not valid. Allowed: ${allowed}`);
        }

        const gradePoint = hasMapping ? (gradeMapping[row.grade] ?? null) : null;

        const { data, error } = await req
          .supabase!.from("grade_submissions")
          .insert({
            profile_id: req.userId,
            course_id: row.courseId,
            semester: row.semester,
            academic_year: row.academicYear,
            grade: row.grade,
            grade_point: gradePoint,
            status: "quarantine",
          })
          .select("id")
          .single();

        if (error) throw error;
        return { rowIndex: row.rowIndex, success: true, submissionId: data?.id as string };
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

// ─── GET /api/grades/mine ─────────────────────────────────────────────────────

gradesRouter.get("/mine", async (req, res, next) => {
  try {
    // RLS gs_select policy ensures only own rows are returned.
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

// ─── DELETE /api/grades/:id ───────────────────────────────────────────────────

gradesRouter.delete("/:id", async (req, res, next) => {
  try {
    const idParse = z.string().uuid().safeParse(req.params["id"]);
    if (!idParse.success) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid submission ID." } });
      return;
    }
    const id = idParse.data;

    // Use the user's client — gs_select RLS ensures we only see our own rows.
    const { data: existing, error: fetchErr } = await req
      .supabase!.from("grade_submissions")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!existing) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Submission not found." } });
      return;
    }

    if (existing.status !== "quarantine") {
      res.status(409).json({
        error: {
          code: "IMMUTABLE",
          message: "Only submissions in quarantine can be deleted.",
        },
      });
      return;
    }

    // gs_delete_own_quarantine RLS enforces profile_id = auth.uid() AND status = 'quarantine'.
    const { error: delErr } = await req.supabase!.from("grade_submissions").delete().eq("id", id);

    if (delErr) throw delErr;

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
