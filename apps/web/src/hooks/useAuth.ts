import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.ts";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

/**
 * Subscribes to Supabase auth state and returns the current session/user.
 *
 * - `loading` is true until the first session check completes.
 * - On magic-link callback, Supabase auto-detects the URL hash and persists
 *   the session; the `onAuthStateChange` listener fires SIGNED_IN.
 */
export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({
        session,
        user: session?.user ?? null,
        loading: false,
      });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
  };

  return { ...state, signOut };
}
