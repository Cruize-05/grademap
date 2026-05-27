import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

declare global {
  namespace Express {
    interface Request {
      userId?: string | undefined;
      userEmail?: string | undefined;
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
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token." } });
    return;
  }

  req.userId = data.user.id;
  req.userEmail = data.user.email;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing Bearer token." } });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

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
  next();
}
