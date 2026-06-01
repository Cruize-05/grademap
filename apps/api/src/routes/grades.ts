import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import PDFDocument from "pdfkit";
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

// ─── GET /api/grades/report ───────────────────────────────────────────────────
// Personal academic report (PDF). Reads ONLY the caller's own rows via RLS —
// no aggregates, so no k-anonymity concern. Streams a pdfkit document.

interface ReportGrade {
  semester: number;
  academic_year: number;
  grade: string;
  grade_point: number | null;
  status: string;
  courses: { code: string; title: string; credits: number } | null;
}

function weightedGpa(rows: ReportGrade[]): { value: number; n: number } {
  const valid = rows.filter((r) => r.grade_point != null && r.courses?.credits);
  if (valid.length === 0) return { value: 0, n: 0 };
  const totalGp = valid.reduce((s, r) => s + (r.grade_point ?? 0) * (r.courses?.credits ?? 0), 0);
  const totalCr = valid.reduce((s, r) => s + (r.courses?.credits ?? 0), 0);
  return { value: totalCr === 0 ? 0 : totalGp / totalCr, n: valid.length };
}

gradesRouter.get("/report", async (req, res, next) => {
  try {
    const { data: profile, error: profileErr } = await req
      .supabase!.from("profiles")
      .select("programme, level, institution_id")
      .eq("id", req.userId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!profile) {
      res
        .status(400)
        .json({ error: { code: "NO_PROFILE", message: "Complete onboarding first." } });
      return;
    }

    const { data: institution } = await supabaseAdmin
      .from("institutions")
      .select("name")
      .eq("id", profile.institution_id)
      .single();

    const { data: grades, error: gradesErr } = await req
      .supabase!.from("grade_submissions")
      .select("semester, academic_year, grade, grade_point, status, courses(code, title, credits)")
      .eq("profile_id", req.userId)
      .order("academic_year", { ascending: true })
      .order("semester", { ascending: true });

    if (gradesErr) throw gradesErr;

    const rows = (grades ?? []) as unknown as ReportGrade[];
    const gpa = weightedGpa(rows);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="grademap-report.pdf"');

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    // Header
    doc.fontSize(20).fillColor("#1e3a5f").text("GradeMap UB", { continued: false });
    doc.fontSize(12).fillColor("#475569").text("Academic Report");
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor("#64748b")
      .text(`${profile.programme} · Year ${profile.level}`)
      .text(institution?.name ?? "")
      .text(req.userEmail ?? "")
      .text(`Generated ${new Date().toLocaleDateString()}`);

    doc.moveDown(1);

    // GPA summary
    doc.fontSize(11).fillColor("#0f172a").text("Cumulative GPA", { continued: true });
    doc
      .fontSize(11)
      .fillColor("#1e3a5f")
      .text(`   ${gpa.value.toFixed(2)}  (across ${gpa.n} graded course${gpa.n === 1 ? "" : "s"})`);

    doc.moveDown(1);

    // Table header
    const cols = { code: 50, title: 130, sem: 330, year: 380, grade: 450, gp: 500 };
    const drawHeader = (y: number): void => {
      doc.fontSize(9).fillColor("#64748b");
      doc.text("Course", cols.code, y);
      doc.text("Title", cols.title, y);
      doc.text("Sem", cols.sem, y);
      doc.text("Year", cols.year, y);
      doc.text("Grade", cols.grade, y);
      doc.text("GP", cols.gp, y);
      doc
        .moveTo(cols.code, y + 12)
        .lineTo(545, y + 12)
        .strokeColor("#e2e8f0")
        .stroke();
    };

    drawHeader(doc.y);
    doc.moveDown(1.2);

    if (rows.length === 0) {
      doc.fontSize(10).fillColor("#94a3b8").text("No grades submitted yet.", cols.code);
    }

    for (const r of rows) {
      let y = doc.y;
      if (y > 760) {
        doc.addPage();
        drawHeader(50);
        y = 74;
      }
      doc.fontSize(9).fillColor("#0f172a");
      doc.text(r.courses?.code ?? "—", cols.code, y, { width: 75 });
      doc.text(r.courses?.title ?? "—", cols.title, y, { width: 190, ellipsis: true, height: 11 });
      doc.text(String(r.semester), cols.sem, y);
      doc.text(String(r.academic_year), cols.year, y);
      doc.text(r.grade, cols.grade, y);
      doc.text(r.grade_point != null ? r.grade_point.toFixed(2) : "—", cols.gp, y);
      doc.moveDown(0.8);
    }

    // Footer disclaimer
    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(
        "This report reflects self-submitted grades. It is statistical guidance, not an official transcript. Confirm with your faculty advisor.",
        50,
        doc.y,
        { width: 495 }
      );

    doc.end();
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
