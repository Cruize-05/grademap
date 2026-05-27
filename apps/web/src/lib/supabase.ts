import { createClient } from "@supabase/supabase-js";

// Vite injects VITE_* env vars at build time. In dev with no .env, fall back to
// a syntactically-valid placeholder so `createClient` doesn't throw at import
// time. Auth features won't work, but the app will at least render so we can
// see other pages and visually verify the UI.
const supabaseUrl =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "https://placeholder.supabase.co";
const supabaseAnonKey =
  (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "placeholder-anon-key";

const usingPlaceholder = supabaseUrl.includes("placeholder.supabase.co");

if (usingPlaceholder && import.meta.env["DEV"]) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars not set — using placeholder. " +
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env to enable magic-link sign-in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const isSupabaseConfigured = !usingPlaceholder;
