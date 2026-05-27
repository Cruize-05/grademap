import { Link } from "react-router-dom";
import { GraduationCap, BarChart2, ShieldCheck } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="text-primary font-bold text-lg tracking-tight">GradeMap UB</span>
        <Link
          to="/sign-in"
          className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 px-4 py-10 max-w-lg mx-auto space-y-10">
        <section className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-primary leading-tight">
            Make smarter academic decisions.
          </h1>
          <p className="text-gray-600 text-base">
            GradeMap UB turns anonymised grade data from your peers into actionable insights —
            course difficulty, risk scores, and GPA projections.
          </p>
          <Link
            to="/sign-in"
            className="inline-block mt-4 bg-accent text-white font-bold px-6 py-3 rounded-xl text-base hover:bg-accent/90 transition-colors"
          >
            Get started free
          </Link>
        </section>

        <section className="space-y-4">
          {[
            {
              icon: BarChart2,
              title: "Course Difficulty Index",
              body: "See real pass rates and GPA impact before you register.",
            },
            {
              icon: ShieldCheck,
              title: "Dangerous Combo Alerts",
              body: "Detect risky course pairs before they derail your semester.",
            },
            {
              icon: GraduationCap,
              title: "GPA Trajectory",
              body: "Project your GPA over the next 4 semesters based on your plan.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-white rounded-xl border border-border p-4 flex gap-4 items-start"
            >
              <div className="shrink-0 bg-primary/10 rounded-lg p-2">
                <Icon size={20} className="text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{body}</p>
              </div>
            </div>
          ))}
        </section>

        <p className="text-xs text-center text-gray-400">
          Data is anonymised. Only verified institutional emails (@ub.cm) are accepted. All
          aggregates require at least 10 students.
        </p>
      </main>
    </div>
  );
}
