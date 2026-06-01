import type { Request, Response, NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"] ?? "";
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

/**
 * Service-role client — bypasses RLS. Use ONLY for:
 *   - JWT verification (supabase.auth.getUser)
 *   - mining-service operations (writing cache tables)
 *   - admin actions that have been authorised at the gateway layer
 *
 * NEVER use this for "give me the caller's data" queries; that would bypass
 * RLS and defeat the security model.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Per-request Supabase client built with the caller's JWT. Queries through
 * this client are subject to RLS — the database enforces who can see what.
 */
export function supabaseAsUser(token: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation requires namespace merging
  namespace Express {
    interface Request {
      userId?: string | undefined;
      userEmail?: string | undefined;
      userToken?: string | undefined;
      supabase?: SupabaseClient | undefined;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token." } });
    return;
  }

  req.userId = data.user.id;
  req.userEmail = data.user.email;
  req.userToken = token;
  req.supabase = supabaseAsUser(token);
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token." } });
    return;
  }

  const role = data.user.app_metadata?.["role"];
  if (role !== "admin") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin access required." } });
    return;
  }

  req.userId = data.user.id;
  req.userEmail = data.user.email;
  req.userToken = token;
  // Admin uses service role for cross-user reads (needed for the quarantine queue)
  req.supabase = supabaseAdmin;
  next();
}
