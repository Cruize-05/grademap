import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import type { Profile } from "@grademap/shared";

interface ApiProfile {
  id: string;
  institution_id: string;
  programme: string;
  level: number;
  verified_at: string | null;
}

/**
 * Loads the caller's profile from /api/me. Returns:
 *   - data:    Profile | null   (null until session resolves)
 *   - missing: true             (404 from /api/me — needs onboarding)
 *   - error:   any other failure
 */
export function useProfile(enabled: boolean): {
  data: Profile | undefined;
  missing: boolean;
  loading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      try {
        const raw = await api.get<ApiProfile>("/api/me");
        return {
          id: raw.id,
          institutionId: raw.institution_id,
          programme: raw.programme,
          level: raw.level,
          verifiedAt: raw.verified_at,
        } satisfies Profile;
      } catch (err) {
        if ((err as Error).message.includes("Complete onboarding")) {
          return null; // sentinel: profile missing
        }
        throw err;
      }
    },
    enabled,
    retry: false,
  });

  return {
    data: query.data ?? undefined,
    missing: query.data === null,
    loading: query.isLoading,
    error: query.error,
  };
}
