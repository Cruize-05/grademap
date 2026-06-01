import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  Plus,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  LogOut,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { api } from "../lib/api.ts";

interface GradeRow {
  id: string;
  semester: number;
  academic_year: number;
  grade: string;
  grade_point: number | null;
  status: "quarantine" | "approved" | "rejected";
  created_at: string;
  courses: { code: string; title: string; credits: number } | null;
}

function gpa(rows: GradeRow[]): { value: number; n: number } {
  const valid = rows.filter((r) => r.grade_point != null && r.courses?.credits);
  if (valid.length === 0) return { value: 0, n: 0 };
  const totalGp = valid.reduce((s, r) => s + (r.grade_point ?? 0) * (r.courses?.credits ?? 0), 0);
  const totalCr = valid.reduce((s, r) => s + (r.courses?.credits ?? 0), 0);
  return { value: totalCr === 0 ? 0 : totalGp / totalCr, n: valid.length };
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const profile = useProfile(true);

  const { data: grades = [] } = useQuery({
    queryKey: ["grades", "mine"],
    queryFn: () => api.get<GradeRow[]>("/api/grades/mine"),
    enabled: !!profile.data,
  });

  const currentGpa = gpa(grades);
  const isVerified = profile.data?.verifiedAt != null;
  const hasGrades = grades.length > 0;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <p className="font-semibold text-primary truncate">
              {profile.data?.programme} · Year {profile.data?.level}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-md">
              UB
            </span>
            <span
              className="bg-accent/10 text-accent font-bold text-sm px-3 py-1.5 rounded-lg tabular-nums"
              title={`Computed across ${currentGpa.n} grade${currentGpa.n === 1 ? "" : "s"}`}
            >
              {currentGpa.value.toFixed(2)} GPA
            </span>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="p-2 text-gray-400 hover:text-danger transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Verification banner */}
        {!isVerified && (
          <div className="bg-accent/5 border border-accent/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-accent shrink-0 mt-0.5" size={20} />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-gray-900">Verify your institutional email</p>
              <p className="text-gray-600 mt-1">
                Until you verify, your grades stay in quarantine and don't affect public aggregates.
              </p>
              <Link
                to="/grades"
                className="inline-block mt-2 text-accent font-semibold text-xs hover:underline"
              >
                Go to verification →
              </Link>
            </div>
          </div>
        )}

        {/* Empty state: setup wizard */}
        {!hasGrades ? (
          <SetupWizard isVerified={isVerified} />
        ) : (
          <div className="space-y-3">
            <DashboardCard
              icon={GraduationCap}
              title="My GPA"
              value={currentGpa.value.toFixed(2)}
              subtitle={`across ${currentGpa.n} grade${currentGpa.n === 1 ? "" : "s"}`}
            />
            <PlaceholderCard
              icon={TrendingUp}
              title="Planned Risk Score"
              body="Build a planned semester load to see your risk score."
              cta={{ to: "/plan", label: "Open planner" }}
            />
            <PlaceholderCard
              icon={ShieldAlert}
              title="Dangerous Combinations"
              body="Check your planned courses for risky co-failure pairs."
              cta={{ to: "/plan", label: "Check my plan" }}
            />
            <PlaceholderCard
              icon={Sparkles}
              title="Trajectory"
              body="Project your GPA over the next 1-4 semesters."
              cta={{ to: "/plan", label: "Project my GPA" }}
            />
            <RecentSubmissions rows={grades.slice(0, 5)} />
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 mt-6 px-4">
        This is statistical guidance, not academic advice. Confirm with your faculty advisor.
      </footer>
    </div>
  );
}

function SetupWizard({ isVerified }: { isVerified: boolean }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <h2 className="font-bold text-lg text-primary">Get started in 3 steps</h2>
      <ol className="space-y-3">
        <Step done index={1} title="Create your profile" />
        <Step done={isVerified} index={2} title="Verify institutional email" hint="@ub.cm" />
        <Step done={false} index={3} title="Submit your first grade" />
      </ol>
      <Link
        to="/grades"
        className="block text-center bg-primary text-white font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
      >
        Submit a grade
      </Link>
    </div>
  );
}

function Step({
  done,
  index,
  title,
  hint,
}: {
  done: boolean;
  index: number;
  title: string;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          done ? "bg-success text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        {done ? <CheckCircle2 size={14} /> : index}
      </div>
      <div>
        <p
          className={`text-sm font-medium ${done ? "text-gray-500 line-through" : "text-gray-900"}`}
        >
          {title}
        </p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    </li>
  );
}

function DashboardCard({
  icon: Icon,
  title,
  value,
  subtitle,
}: {
  icon: typeof GraduationCap;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-4">
      <div className="bg-primary/10 rounded-lg p-3 shrink-0">
        <Icon size={20} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{title}</p>
        <p className="font-bold text-2xl text-primary tabular-nums">{value}</p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function PlaceholderCard({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: typeof GraduationCap;
  title: string;
  body: string;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="bg-gray-100 rounded-lg p-2 shrink-0">
          <Icon size={18} className="text-gray-500" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{body}</p>
          {cta && (
            <Link
              to={cta.to}
              className="inline-block mt-2 text-primary text-xs font-semibold hover:underline"
            >
              {cta.label} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentSubmissions({ rows }: { rows: GradeRow[] }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm text-gray-900">Recent submissions</p>
        <Link to="/grades" className="text-primary text-xs font-semibold hover:underline">
          View all
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{r.courses?.code ?? "—"}</p>
              <p className="text-xs text-gray-500 truncate">{r.courses?.title}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums">{r.grade}</span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  r.status === "approved"
                    ? "bg-success/10 text-success"
                    : r.status === "rejected"
                      ? "bg-danger/10 text-danger"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {r.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Link
        to="/grades"
        className="flex items-center justify-center gap-1 text-primary text-sm font-semibold py-2 hover:underline"
      >
        <Plus size={16} /> Add grade
      </Link>
    </div>
  );
}
