import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogOut, Plus, X, ShieldAlert, TrendingUp, Gauge, Info } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "../hooks/useAuth.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { api } from "../lib/api.ts";

interface ApiCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
  level: number;
  institution_id: string;
}

interface RiskDriver {
  description: string;
  courseIds: string[];
  severity: "low" | "medium" | "high";
}
interface RiskScore {
  score: number;
  drivers: RiskDriver[];
  plannedCourseIds: string[];
}

interface DangerousCombination {
  courseA: string;
  courseB: string;
  support: number;
  confidence: number;
  lift: number;
  nStudents: number;
  coFailRate: number;
}

interface TrajectoryPoint {
  semesterIndex: number;
  gpa: number;
  ciLow: number;
  ciHigh: number;
}
interface GpaTrajectory {
  projections: TrajectoryPoint[];
  modelInfo: string;
}

const MAX_SEMESTERS = 4;
const MAX_COURSES = 20;

export default function Plan() {
  const { user, signOut } = useAuth();
  const profile = useProfile(true);

  // One course-picker list per planned semester. Start with a single semester.
  const [semesters, setSemesters] = useState<string[][]>([[]]);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", profile.data?.institutionId],
    queryFn: () =>
      api.get<ApiCourse[]>(`/api/courses?institution_id=${profile.data!.institutionId}&limit=100`),
    enabled: !!profile.data?.institutionId,
  });

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const coursesByLevel = useMemo(
    () =>
      courses.reduce<Record<number, ApiCourse[]>>((acc, c) => {
        (acc[c.level] ??= []).push(c);
        return acc;
      }, {}),
    [courses]
  );

  // Flatten to a unique list for risk + combinations.
  const plannedCourseIds = useMemo(() => Array.from(new Set(semesters.flat())), [semesters]);
  const nonEmptySemesters = useMemo(
    () => semesters.filter((s) => s.length > 0).map((courses) => ({ courses })),
    [semesters]
  );

  const risk = useQuery({
    queryKey: ["risk", plannedCourseIds],
    queryFn: () => api.post<RiskScore>("/api/risk-score", { plannedCourseIds }),
    enabled: plannedCourseIds.length >= 1 && plannedCourseIds.length <= MAX_COURSES,
  });

  const combos = useQuery({
    queryKey: ["combos", plannedCourseIds],
    queryFn: () =>
      api.post<{ combinations: DangerousCombination[] }>("/api/combinations/check", {
        plannedCourseIds,
      }),
    enabled: plannedCourseIds.length >= 2 && plannedCourseIds.length <= MAX_COURSES,
  });

  const trajectory = useQuery({
    queryKey: ["trajectory", nonEmptySemesters],
    queryFn: () =>
      api.post<GpaTrajectory>("/api/trajectory", { plannedSemesters: nonEmptySemesters }),
    enabled: nonEmptySemesters.length >= 1,
    retry: false,
  });

  // ── Semester editing ──────────────────────────────────────────────────────
  const addCourse = (semIdx: number, courseId: string) => {
    if (!courseId) return;
    setSemesters((prev) =>
      prev.map((s, i) => (i === semIdx && !s.includes(courseId) ? [...s, courseId] : s))
    );
  };
  const removeCourse = (semIdx: number, courseId: string) => {
    setSemesters((prev) =>
      prev.map((s, i) => (i === semIdx ? s.filter((c) => c !== courseId) : s))
    );
  };
  const addSemester = () =>
    setSemesters((prev) => (prev.length < MAX_SEMESTERS ? [...prev, []] : prev));
  const removeSemester = (semIdx: number) =>
    setSemesters((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== semIdx) : prev));

  const hasSelection = plannedCourseIds.length > 0;

  return (
    <div className="min-h-screen bg-background pb-8">
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
              <p className="font-semibold text-primary">Semester Planner</p>
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
        <p className="text-sm text-gray-600">
          Plan up to {MAX_SEMESTERS} upcoming semesters. We&apos;ll estimate your risk, flag
          dangerous course pairs, and project your GPA — all from anonymous, aggregated data.
        </p>

        {/* ── Semester builders ──────────────────────────────────────────── */}
        <div className="space-y-3">
          {semesters.map((sem, idx) => (
            <SemesterCard
              key={idx}
              index={idx}
              selectedIds={sem}
              courseById={courseById}
              coursesByLevel={coursesByLevel}
              onAdd={(cid) => addCourse(idx, cid)}
              onRemove={(cid) => removeCourse(idx, cid)}
              onRemoveSemester={semesters.length > 1 ? () => removeSemester(idx) : undefined}
            />
          ))}
          {semesters.length < MAX_SEMESTERS && (
            <button
              type="button"
              onClick={addSemester}
              className="w-full border border-dashed border-border rounded-xl py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
            >
              <Plus size={15} /> Add semester
            </button>
          )}
        </div>

        {!hasSelection ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Add courses above to see your projected risk and GPA.
          </div>
        ) : (
          <div className="space-y-4">
            <RiskCard query={risk} overLimit={plannedCourseIds.length > MAX_COURSES} />
            <CombinationsCard
              query={combos}
              courseById={courseById}
              enoughCourses={plannedCourseIds.length >= 2}
            />
            <TrajectoryCard query={trajectory} />
          </div>
        )}

        <p className="text-center text-xs text-gray-400 px-4">
          This is statistical guidance, not academic advice. Confirm with your faculty advisor.
        </p>
      </main>
    </div>
  );
}

// ─── Semester card ────────────────────────────────────────────────────────────

function SemesterCard({
  index,
  selectedIds,
  courseById,
  coursesByLevel,
  onAdd,
  onRemove,
  onRemoveSemester,
}: {
  index: number;
  selectedIds: string[];
  courseById: Map<string, ApiCourse>;
  coursesByLevel: Record<number, ApiCourse[]>;
  onAdd: (courseId: string) => void;
  onRemove: (courseId: string) => void;
  onRemoveSemester?: (() => void) | undefined;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm text-gray-900">Semester {index + 1}</p>
        {onRemoveSemester && (
          <button
            type="button"
            onClick={onRemoveSemester}
            className="text-xs text-gray-400 hover:text-danger transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <select
        value=""
        onChange={(e) => {
          onAdd(e.target.value);
          e.target.value = "";
        }}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
      >
        <option value="">Add a course…</option>
        {Object.entries(coursesByLevel)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([level, lvlCourses]) => (
            <optgroup key={level} label={`Level ${level}`}>
              {lvlCourses
                .filter((c) => !selectedIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
            </optgroup>
          ))}
      </select>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((cid) => {
            const c = courseById.get(cid);
            return (
              <span
                key={cid}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium pl-2.5 pr-1 py-1 rounded-full"
              >
                {c?.code ?? "—"}
                <button
                  type="button"
                  onClick={() => onRemove(cid)}
                  aria-label={`Remove ${c?.code ?? "course"}`}
                  className="hover:bg-primary/20 rounded-full p-0.5"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No courses yet.</p>
      )}
    </div>
  );
}

// ─── Risk card ────────────────────────────────────────────────────────────────

function severityTone(s: RiskDriver["severity"]): string {
  if (s === "high") return "bg-danger/10 text-danger";
  if (s === "medium") return "bg-accent/10 text-accent";
  return "bg-gray-100 text-gray-500";
}

function scoreTone(score: number): string {
  if (score >= 66) return "text-danger";
  if (score >= 33) return "text-accent";
  return "text-success";
}

function RiskCard({
  query,
  overLimit,
}: {
  query: ReturnType<typeof useQuery<RiskScore>>;
  overLimit: boolean;
}) {
  return (
    <section className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge size={18} className="text-gray-500" />
        <h2 className="font-semibold text-sm text-gray-900">Planned risk score</h2>
      </div>

      {overLimit ? (
        <p className="text-sm text-accent">Plan {MAX_COURSES} courses or fewer to see a score.</p>
      ) : query.isLoading ? (
        <div className="animate-pulse h-20 bg-gray-50 rounded-lg" />
      ) : query.error ? (
        <p className="text-sm text-danger">{(query.error as Error).message}</p>
      ) : query.data ? (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className={`font-bold text-4xl tabular-nums ${scoreTone(query.data.score)}`}>
              {Math.round(query.data.score)}
            </span>
            <span className="text-sm text-gray-400">/ 100</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, Math.max(0, query.data.score))}%` }}
            />
          </div>
          {query.data.drivers.length > 0 ? (
            <ul className="space-y-1.5">
              {query.data.drivers.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${severityTone(
                      d.severity
                    )}`}
                  >
                    {d.severity}
                  </span>
                  <span className="text-gray-700">{d.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">No significant risk drivers for this plan.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ─── Dangerous combinations card ────────────────────────────────────────────────

function CombinationsCard({
  query,
  courseById,
  enoughCourses,
}: {
  query: ReturnType<typeof useQuery<{ combinations: DangerousCombination[] }>>;
  courseById: Map<string, ApiCourse>;
  enoughCourses: boolean;
}) {
  const code = (id: string) => courseById.get(id)?.code ?? id.slice(0, 8);
  return (
    <section className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-gray-500" />
        <h2 className="font-semibold text-sm text-gray-900">Dangerous combinations</h2>
      </div>

      {!enoughCourses ? (
        <p className="text-sm text-gray-500">Add at least two courses to check for risky pairs.</p>
      ) : query.isLoading ? (
        <div className="animate-pulse h-16 bg-gray-50 rounded-lg" />
      ) : query.error ? (
        <p className="text-sm text-danger">{(query.error as Error).message}</p>
      ) : query.data && query.data.combinations.length > 0 ? (
        <ul className="space-y-2">
          {query.data.combinations.map((c, i) => (
            <li key={i} className="bg-danger/5 border border-danger/20 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-gray-900">
                  {code(c.courseA)} + {code(c.courseB)}
                </span>
                <span className="text-sm font-bold text-danger tabular-nums">
                  {c.coFailRate.toFixed(0)}% co-fail
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Among students who failed {code(c.courseA)}, {c.coFailRate.toFixed(0)}% also failed{" "}
                {code(c.courseB)}. Based on{" "}
                <span className="font-semibold tabular-nums">{c.nStudents}</span> students.
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-success flex items-center gap-1.5">
          <Info size={14} /> No dangerous pairs found in this plan.
        </p>
      )}
    </section>
  );
}

// ─── Trajectory card ────────────────────────────────────────────────────────────

function TrajectoryCard({ query }: { query: ReturnType<typeof useQuery<GpaTrajectory>> }) {
  const chartData = query.data?.projections.map((p) => ({
    name: `S${p.semesterIndex}`,
    gpa: p.gpa,
    range: [p.ciLow, p.ciHigh] as [number, number],
  }));

  return (
    <section className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-gray-500" />
        <h2 className="font-semibold text-sm text-gray-900">Projected GPA trajectory</h2>
      </div>

      {query.isLoading ? (
        <div className="animate-pulse h-44 bg-gray-50 rounded-lg" />
      ) : query.error ? (
        <p className="text-sm text-gray-500">{(query.error as Error).message}</p>
      ) : chartData && chartData.length > 0 ? (
        <>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis domain={[0, 4]} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(value: number | number[], name: string) =>
                    name === "range" && Array.isArray(value)
                      ? [`${(value[0] ?? 0).toFixed(2)} – ${(value[1] ?? 0).toFixed(2)}`, "90% CI"]
                      : [(value as number).toFixed(2), "Projected GPA"]
                  }
                />
                <Area
                  dataKey="range"
                  stroke="none"
                  fill="#6366f1"
                  fillOpacity={0.12}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="gpa"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400">
            Shaded band is the 90% confidence interval from historical variance.
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-500">No projection available for this plan yet.</p>
      )}
    </section>
  );
}
