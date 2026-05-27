import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.ts";
import { useProfile } from "../hooks/useProfile.ts";

interface Props {
  children: ReactNode;
  /** When true, the route is reachable without a completed profile. */
  allowIncompleteProfile?: boolean;
}

export function ProtectedRoute({ children, allowIncompleteProfile }: Props): JSX.Element {
  const { session, loading } = useAuth();
  const location = useLocation();
  const profile = useProfile(!!session);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  if (profile.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        Loading profile…
      </div>
    );
  }

  if (profile.missing && !allowIncompleteProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
