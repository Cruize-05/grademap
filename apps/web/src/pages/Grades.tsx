import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Trash2,
  Upload,
  Plus,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { api } from "../lib/api.ts";

// ─── Local types ──────────────────────────────────────────────────────────────

interface ApiInstitution {
  id: string;
  code: string;
  name: string;
  email_domain: string;
  grade_mapping: Record<string, number>;
  max_grade_point: number;
}

interface ApiCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
  level: number;
  institution_id: string;
}

interface GradeRow {
  id: string;
  course_id: string;
  semester: number;
  academic_year: number;
  grade: string;
  grade_point: number | null;
  status: "quarantine" | "approved" | "rejected";
  created_at: string;
  courses: { code: string; title: string; credits: number } | null;
}

interface BulkResult {
  rowIndex: number;
  success: boolean;
  error?: string;
  submissionId?: string;
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const singleSchema = z.object({
  courseId: z.string().uuid({ message: "Please select a course" }),
  grade: z.string().min(1, "Please select a grade"),
  semester: z.union([z.literal("1"), z.literal("2")]),
  academicYear: z.coerce.number().int().min(2000).max(2100),
});
type SingleForm = z.infer<typeof singleSchema>;

// ─── Bulk CSV parsing ─────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  rawLine: string;
  courseCode: string;
  courseId: string | undefined;
  grade: string;
  semester: number;
  academicYear: number;
  error: string | undefined;
}

const HEADER_PATTERN = /^(course|code|subject)/i;

function parseBulkText(text: string, coursesByCode: Map<string, ApiCourse>): ParsedRow[] {
  const results: ParsedRow[] = [];

  text.split("\n").forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || HEADER_PATTERN.test(line)) return;

    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const courseCode = (parts[0] ?? "").toUpperCase();
    const grade = parts[1] ?? "";
    const semStr = parts[2] ?? "";
    const yearStr = parts[3] ?? "";

    let error: string | undefined;
    let courseId: string | undefined;

    if (!courseCode) {
      error = "Missing course code";
    } else if (!grade) {
      error = "Missing grade";
    } else {
      const semester = parseInt(semStr, 10);
      const academicYear = parseInt(yearStr, 10);

      if (isNaN(semester) || (semester !== 1 && semester !== 2)) {
        error = "Semester must be 1 or 2";
      } else if (isNaN(academicYear) || academicYear < 2000 || academicYear > 2100) {
        error = "Year must be between 2000 and 2100";
      } else {
        const course = coursesByCode.get(courseCode);
        if (!course) {
          error = `Course '${courseCode}' not found`;
        } else {
          courseId = course.id;
        }
      }

      results.push({
        rowIndex: i,
        rawLine,
        courseCode,
        courseId,
        grade,
        semester: isNaN(semester) ? 0 : semester,
        academicYear: isNaN(academicYear) ? 0 : academicYear,
        error,
      });
      return;
    }

    results.push({
      rowIndex: i,
      rawLine,
      courseCode,
      courseId,
      grade,
      semester: 0,
      academicYear: 0,
      error,
    });
  });

  return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

export default function Grades() {
  const { user, signOut } = useAuth();
  const profile = useProfile(true);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkText, setBulkText] = useState("");
  const [bulkParsed, setBulkParsed] = useState<ParsedRow[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "quarantine" | "approved" | "rejected">(
    "all"
  );

  // ── Institutions (for grade alphabet) ──────────────────────────────────────
  const { data: institutions = [] } = useQuery({
    queryKey: ["institutions"],
    queryFn: () => api.get<ApiInstitution[]>("/api/institutions"),
  });

  const institution = institutions.find((i) => i.id === profile.data?.institutionId);
  const gradeOptions =
    institution && Object.keys(institution.grade_mapping).length > 0
      ? Object.keys(institution.grade_mapping)
      : ["A", "B+", "B", "C+", "C", "D", "F"];

  // ── Courses (filtered by institution) ─────────────────────────────────────
  const { data: courses = [] } = useQuery({
    queryKey: ["courses", profile.data?.institutionId],
    queryFn: () =>
      api.get<ApiCourse[]>(`/api/courses?institution_id=${profile.data!.institutionId}&limit=100`),
    enabled: !!profile.data?.institutionId,
  });

  const coursesByCode = new Map(courses.map((c) => [c.code.toUpperCase(), c]));

  // Group for the <select> optgroups
  const coursesByLevel = courses.reduce<Record<number, ApiCourse[]>>((acc, c) => {
    const lvl = c.level;
    if (!acc[lvl]) acc[lvl] = [];
    acc[lvl]!.push(c);
    return acc;
  }, {});

  // ── My grades ─────────────────────────────────────────────────────────────
  const { data: grades = [] } = useQuery({
    queryKey: ["grades", "mine"],
    queryFn: () => api.get<GradeRow[]>("/api/grades/mine"),
    enabled: !!profile.data,
  });

  const filteredGrades =
    statusFilter === "all" ? grades : grades.filter((g) => g.status === statusFilter);

  const countByStatus = {
    quarantine: grades.filter((g) => g.status === "quarantine").length,
    approved: grades.filter((g) => g.status === "approved").length,
    rejected: grades.filter((g) => g.status === "rejected").length,
  };

  // ── Single-grade form ──────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SingleForm>({
    resolver: zodResolver(singleSchema),
    defaultValues: {
      courseId: "",
      grade: gradeOptions[0] ?? "A",
      semester: "1",
      academicYear: CURRENT_YEAR,
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: (data: SingleForm) =>
      api.post<GradeRow>("/api/grades", {
        courseId: data.courseId,
        grade: data.grade,
        semester: Number(data.semester),
        academicYear: data.academicYear,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades", "mine"] });
      reset({
        courseId: "",
        grade: gradeOptions[0] ?? "A",
        semester: "1",
        academicYear: CURRENT_YEAR,
      });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (
      rows: Array<{
        courseId: string;
        grade: string;
        semester: number;
        academicYear: number;
        rowIndex: number;
      }>
    ) => api.post<BulkResult[]>("/api/grades/bulk", rows),
    onSuccess: (results) => {
      setBulkResults(results);
      queryClient.invalidateQueries({ queryKey: ["grades", "mine"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del<void>(`/api/grades/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades", "mine"] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.post<{ verified: boolean }>("/api/me/verify", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleParse = () => {
    setBulkResults([]);
    setBulkParsed(parseBulkText(bulkText, coursesByCode));
  };

  const handleBulkSubmit = () => {
    const validRows = bulkParsed
      .filter((r) => !r.error && r.courseId)
      .map((r) => ({
        courseId: r.courseId!,
        grade: r.grade,
        semester: r.semester,
        academicYear: r.academicYear,
        rowIndex: r.rowIndex,
      }));
    if (validRows.length > 0) bulkMutation.mutate(validRows);
  };

  const isVerified = profile.data?.verifiedAt != null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/dashboard"
              className="p-1 text-gray-400 hover:text-primary transition-colors shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              <p className="font-semibold text-primary">My Grades</p>
            </div>
          </div>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="p-2 text-gray-400 hover:text-danger transition-colors shrink-0"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Verification banner */}
        {!isVerified && (
          <div className="bg-accent/5 border border-accent/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-accent shrink-0 mt-0.5" size={20} />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-gray-900">Email not verified</p>
              <p className="text-gray-600 mt-1">
                Your grades go into <span className="font-medium">quarantine</span> until you verify
                your institutional email. Quarantined grades don&apos;t affect public statistics.
              </p>
              {verifyMutation.isSuccess ? (
                <p className="mt-2 text-success text-xs font-semibold flex items-center gap-1">
                  <ShieldCheck size={13} /> Verified!
                </p>
              ) : (
                <button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  className="mt-2 text-accent font-semibold text-xs hover:underline disabled:opacity-60"
                >
                  {verifyMutation.isPending ? "Verifying…" : "Verify my @ub.cm email →"}
                </button>
              )}
              {verifyMutation.error && (
                <p className="mt-1 text-danger text-xs">
                  {(verifyMutation.error as Error).message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Submit section ───────────────────────────────────────────────── */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {(["single", "bulk"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  mode === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "single" ? "Single grade" : "Bulk import"}
              </button>
            ))}
          </div>

          {/* ── Single form ─────────────────────────────────────────────────── */}
          {mode === "single" && (
            <form
              onSubmit={handleSubmit((d) => submitMutation.mutate(d))}
              className="p-5 space-y-4"
            >
              {/* Course */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Course</label>
                <select
                  {...register("courseId")}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                >
                  <option value="">Select a course…</option>
                  {Object.entries(coursesByLevel)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([level, lvlCourses]) => (
                      <optgroup key={level} label={`Level ${level}`}>
                        {lvlCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.title} ({c.credits} cr)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                </select>
                {errors.courseId && (
                  <p className="text-xs text-danger mt-1">{errors.courseId.message}</p>
                )}
              </div>

              {/* Grade + Semester */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Grade</label>
                  <select
                    {...register("grade")}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    {gradeOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                        {institution?.grade_mapping[g] != null
                          ? ` (${institution.grade_mapping[g].toFixed(2)})`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {errors.grade && (
                    <p className="text-xs text-danger mt-1">{errors.grade.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Semester</label>
                  <select
                    {...register("semester")}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                  >
                    <option value="1">Semester 1</option>
                    <option value="2">Semester 2</option>
                  </select>
                </div>
              </div>

              {/* Academic year */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Academic year
                </label>
                <input
                  type="number"
                  {...register("academicYear")}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  min={2000}
                  max={2100}
                />
                {errors.academicYear && (
                  <p className="text-xs text-danger mt-1">{errors.academicYear.message}</p>
                )}
              </div>

              {/* Feedback */}
              {submitMutation.error && (
                <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                  {(submitMutation.error as Error).message}
                </p>
              )}
              {submitMutation.isSuccess && (
                <p className="text-sm text-success bg-success/5 border border-success/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 size={15} /> Grade submitted — pending review.
                </p>
              )}

              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {submitMutation.isPending ? "Submitting…" : "Submit grade"}
              </button>
            </form>
          )}

          {/* ── Bulk import ─────────────────────────────────────────────────── */}
          {mode === "bulk" && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                One grade per line:{" "}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                  COURSE_CODE, GRADE, SEMESTER, YEAR
                </code>
                . Lines starting with <code className="bg-gray-100 px-1 rounded font-mono">#</code>{" "}
                are ignored.
              </p>

              <textarea
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value);
                  setBulkParsed([]);
                  setBulkResults([]);
                }}
                placeholder={
                  "# Paste your transcript here\nMATH101, A, 1, 2024\nPHY101, B+, 2, 2024\nCSC201, B, 1, 2024"
                }
                rows={7}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                spellCheck={false}
              />

              <button
                type="button"
                onClick={handleParse}
                disabled={!bulkText.trim()}
                className="w-full border border-primary text-primary font-semibold py-2 rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                Preview
              </button>

              {/* Preview table */}
              {bulkParsed.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-700">
                    <span className="text-success font-bold">
                      {bulkParsed.filter((r) => !r.error).length}
                    </span>{" "}
                    valid ·{" "}
                    <span className="text-danger font-bold">
                      {bulkParsed.filter((r) => !!r.error).length}
                    </span>{" "}
                    errors
                  </p>

                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="px-3 py-2 text-left font-medium">Course</th>
                          <th className="px-3 py-2 text-left font-medium">Grade</th>
                          <th className="px-3 py-2 text-left font-medium">Sem</th>
                          <th className="px-3 py-2 text-left font-medium">Year</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkParsed.map((row) => (
                          <tr
                            key={row.rowIndex}
                            className={`border-t border-border ${row.error ? "bg-danger/5" : ""}`}
                          >
                            <td className="px-3 py-2 font-medium">{row.courseCode || "—"}</td>
                            <td className="px-3 py-2">{row.grade || "—"}</td>
                            <td className="px-3 py-2">{row.semester || "—"}</td>
                            <td className="px-3 py-2">{row.academicYear || "—"}</td>
                            <td className="px-3 py-2">
                              {row.error ? (
                                <span className="text-danger">{row.error}</span>
                              ) : (
                                <span className="text-success flex items-center gap-1">
                                  <CheckCircle2 size={11} /> OK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bulk submit results */}
                  {bulkResults.length > 0 && (
                    <div className="space-y-1">
                      {bulkResults.map((r) => (
                        <p
                          key={r.rowIndex}
                          className={`text-xs px-3 py-1.5 rounded ${
                            r.success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                          }`}
                        >
                          Row {r.rowIndex + 1}: {r.success ? "Submitted ✓" : r.error}
                        </p>
                      ))}
                    </div>
                  )}

                  {bulkResults.length === 0 && (
                    <>
                      {bulkMutation.error && (
                        <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                          {(bulkMutation.error as Error).message}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={handleBulkSubmit}
                        disabled={
                          bulkMutation.isPending || bulkParsed.filter((r) => !r.error).length === 0
                        }
                        className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        <Upload size={15} />
                        {bulkMutation.isPending
                          ? "Submitting…"
                          : `Submit ${bulkParsed.filter((r) => !r.error).length} grade${
                              bulkParsed.filter((r) => !r.error).length !== 1 ? "s" : ""
                            }`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Submissions list ─────────────────────────────────────────────── */}
        <div className="bg-white border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-semibold text-sm text-gray-900">
              My submissions
              {grades.length > 0 && (
                <span className="ml-1.5 text-gray-400 font-normal">({grades.length})</span>
              )}
            </p>
            <div className="flex gap-1 flex-wrap">
              {(["all", "quarantine", "approved", "rejected"] as const).map((s) => {
                const count = s === "all" ? grades.length : countByStatus[s];
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      statusFilter === s
                        ? "bg-primary text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                    {count > 0 && (
                      <span
                        className={`ml-1 ${statusFilter === s ? "opacity-75" : "text-gray-400"}`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredGrades.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No submissions yet.</p>
              <p className="text-xs mt-1">Use the form above to add your first grade.</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredGrades.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/courses/${row.course_id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {row.courses?.code ?? "—"}
                      </Link>
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {row.courses?.title ?? "Unknown course"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Semester {row.semester} · {row.academic_year}
                      {row.courses?.credits != null && ` · ${row.courses.credits} cr`}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums text-gray-900">{row.grade}</p>
                      {row.grade_point != null && (
                        <p className="text-xs text-gray-400 tabular-nums">
                          {row.grade_point.toFixed(2)} GP
                        </p>
                      )}
                    </div>
                    {row.status === "quarantine" && (
                      <button
                        onClick={() => deleteMutation.mutate(row.id)}
                        disabled={deleteMutation.isPending}
                        aria-label="Delete submission"
                        title="Delete this submission"
                        className="p-1.5 text-gray-300 hover:text-danger transition-colors disabled:opacity-40 rounded"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setMode("single");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="w-full flex items-center justify-center gap-1 text-primary text-sm font-semibold py-2 hover:underline"
          >
            <Plus size={15} /> Add another grade
          </button>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 mt-6 px-4">
        Submissions enter quarantine until an admin reviews them. Quarantined grades do not affect
        public statistics.
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "quarantine" | "approved" | "rejected" }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
        <CheckCircle2 size={10} /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-danger/10 text-danger">
        <XCircle size={10} /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      <Clock size={10} /> In review
    </span>
  );
}
