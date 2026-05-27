import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const SignIn = lazy(() => import("./pages/SignIn.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Grades = lazy(() => import("./pages/Grades.tsx"));
const Plan = lazy(() => import("./pages/Plan.tsx"));
const CourseDetail = lazy(() => import("./pages/CourseDetail.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-primary font-semibold">Loading…</div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
