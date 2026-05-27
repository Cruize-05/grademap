import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../middleware/auth.js";

export const meRouter = Router();

/** GET /api/me — return the caller's profile (RLS enforces own-row only). */
meRouter.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req
      .supabase!.from("profiles")
      .select("id, institution_id, programme, level, verified_at")
      .eq("id", req.userId)
      .maybeSingle();

    if (error) {
      next(error);
      return;
    }

    if (!data) {
      res.status(404).json({
        error: { code: "PROFILE_NOT_FOUND", message: "Complete onboarding first." },
      });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

const onboardingSchema = z.object({
  institutionCode: z.string().min(2).max(16),
  programme: z.string().min(1).max(120),
  level: z.number().int().min(1).max(7),
});

/** POST /api/me — create or update the caller's profile (used by onboarding). */
meRouter.post("/", async (req, res, next) => {
  try {
    const body = onboardingSchema.parse(req.body);

    // Look up the institution by code using the user's client (institutions is publicly readable).
    const { data: inst, error: instErr } = await req
      .supabase!.from("institutions")
      .select("id")
      .eq("code", body.institutionCode)
      .maybeSingle();

    if (instErr) throw instErr;
    if (!inst) {
      res.status(400).json({
        error: {
          code: "UNKNOWN_INSTITUTION",
          message: `Institution '${body.institutionCode}' not registered.`,
        },
      });
      return;
    }

    const { data, error } = await req
      .supabase!.from("profiles")
      .upsert({
        id: req.userId,
        institution_id: inst.id,
        programme: body.programme,
        level: body.level,
      })
      .select("id, institution_id, programme, level, verified_at")
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/** POST /api/me/verify — confirm the caller's email matches an institutional domain. */
meRouter.post("/verify", async (req, res, next) => {
  try {
    const email = req.userEmail;
    if (!email) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "No email on account." } });
      return;
    }

    const allowedDomain = process.env["ALLOWED_EMAIL_DOMAIN"] ?? "ub.cm";
    if (!email.endsWith(`@${allowedDomain}`)) {
      res.status(422).json({
        error: {
          code: "DOMAIN_MISMATCH",
          message: `Only @${allowedDomain} addresses are accepted for verification.`,
        },
      });
      return;
    }

    // verified_at write is gated by the profiles_own_row_update RLS policy,
    // but the column itself is sensitive — use the admin client so we set the
    // server-determined timestamp, not whatever the client might post.
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", req.userId);

    if (error) throw error;

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});
