/**
 * Auth middleware test.
 *
 * Verifies the gateway rejects requests that lack a Bearer token, which is the
 * single most important security property of the auth layer. The full
 * end-to-end "user A cannot read user B" test lives in apps/api/src/scripts/rls-test.ts
 * and runs directly against Postgres with set_config + SET ROLE.
 */

import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import { requireAuth } from "../src/middleware/auth.js";

function buildTestApp(): Express {
  const app = express();
  app.get("/protected", requireAuth, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireAuth middleware", () => {
  it("returns 401 with UNAUTHORIZED code when no Authorization header is set", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.error.message).toMatch(/Bearer/);
  });

  it("returns 401 when the header lacks the Bearer prefix", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/protected").set("Authorization", "just-a-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
