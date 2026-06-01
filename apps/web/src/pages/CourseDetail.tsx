import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingDown, Users, Lock, BookOpen } from "lucide-react";
import { api } from "../lib/api.ts";

interface ApiCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
  level: number;
  institution_id: string;
}

interface Difficulty {
  courseId: string;
  nStudents: number;
  passRate: number;
  avgGradePoint: number;
  difficultyScore: number;
  updatedAt: string;
}

interface InsufficientData {
  insufficientData: true;
  threshold: number;
}

type DifficultyResult = Difficulty | InsufficientData;

function isInsufficient(d: DifficultyResult): d is InsufficientData {
  return "insufficientData" in d;
}

function difficultyLabel(score: number): { label: string; tone: string } {
  if (score >= 0.8) return { label: "Very hard", tone: "text-danger" };
  if (score >= 0.6) return { label: "Hard", tone: "text-accent" };
  if (score >= 0.4) return { label: "Moderate", tone: "text-accent" };
  if (score >= 0.2) return { label: "Manageable", tone: "text-success" };
  return { label: "Easy", tone: "text-success" };
}

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();

  const course = useQuery({
    queryKey: ["course", id],
    queryFn: () => api.get<ApiCourse>(`/api/courses/${id}`),
    enabled: !!id,
  });

  const difficulty = useQuery({
    queryKey: ["course", id, "difficulty"],
    queryFn: () => api.get<DifficultyResult>(`/api/courses/${id}/difficulty`),
    enabled: !!id,
  });

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Link
            to="/dashboard"
            className="p-1 text-gray-400 hover:text-primary transition-colors shrink-0"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="font-semibold text-primary truncate">
              {course.data ? course.data.code : "Course"}
            </p>
            <p className="text-xs text-gray-500 truncate">{course.data?.title}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Course metadata */}
        {course.isLoading ? (
          <div className="bg-white border border-border rounded-xl p-4 animate-pulse h-20" />
        ) : course.error ? (
          <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 text-sm text-danger">
            {(course.error as Error).message}
          </div>
        ) : course.data ? (
          <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="bg-primary/10 rounded-lg p-3 shrink-0">
              <BookOpen size={20} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg text-gray-900">{course.data.code}</p>
              <p className="text-sm text-gray-600 truncate">{course.data.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Level {course.data.level} · {course.data.credits} credits
              </p>
            </div>
          </div>
        ) : null}

        {/* Difficulty */}
        <section className="bg-white border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown size={18} className="text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-900">Course difficulty</h2>
          </div>

          {difficulty.isLoading ? (
            <div className="animate-pulse h-24 bg-gray-50 rounded-lg" />
          ) : difficulty.error ? (
            <p className="text-sm text-danger">{(difficulty.error as Error).message}</p>
          ) : difficulty.data && isInsufficient(difficulty.data) ? (
            <div className="flex items-start gap-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
              <Lock size={18} className="text-gray-400 shrink-0 mt-0.5" />
              <p>
                Not enough data yet. We only show statistics once at least{" "}
                <span className="font-semibold">{difficulty.data.threshold}</span> students have
                contributed approved grades for this course, to protect everyone&apos;s privacy.
              </p>
            </div>
          ) : difficulty.data ? (
            <DifficultyView data={difficulty.data} />
          ) : null}
        </section>

        <p className="text-center text-xs text-gray-400 px-4">
          Statistics are computed only from approved, verified grades and never identify individual
          students.
        </p>
      </main>
    </div>
  );
}

function DifficultyView({ data }: { data: Difficulty }) {
  const { label, tone } = difficultyLabel(data.difficultyScore);
  const passPct = Math.round(data.passRate * 100);
  const diffPct = Math.round(data.difficultyScore * 100);

  return (
    <div className="space-y-4">
      {/* Difficulty bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className={`font-bold text-lg ${tone}`}>{label}</span>
          <span className="text-xs text-gray-400 tabular-nums">{diffPct}/100</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, diffPct))}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pass rate" value={`${passPct}%`} />
        <Stat label="Avg grade point" value={data.avgGradePoint.toFixed(2)} />
      </div>

      {/* n_students — always shown alongside any statistic */}
      <div className="flex items-center gap-2 text-xs text-gray-500 border-t border-border pt-3">
        <Users size={14} className="text-gray-400" />
        <span>
          Based on <span className="font-semibold tabular-nums">{data.nStudents}</span> students
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-xl text-primary tabular-nums">{value}</p>
    </div>
  );
}
