import { Router } from "express";
import { supabase } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.get("/", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, institution_id, programme, level, verified_at")
      .eq("id", req.userId)
      .single();

    if (error) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Profile not found." } });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

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

    await supabase
      .from("profiles")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", req.userId);

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});
