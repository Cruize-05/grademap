/**
 * Grade submission endpoint tests.
 *
 * These tests exercise the gateway's auth layer and request-body validation
 * without needing a real Supabase or Postgres connection. The server-side
 * institution / grade-alphabet validation is covered by the RLS integration
 * test (rls-test.ts) which runs against a local Postgres instance.
 */

import express, { type Express } from "express";
import request from "supertest";
import { requireAuth } from "../src/middleware/auth.js";
import { gradesRouter } from "../src/routes/grades.js";

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/grades", requireAuth, gradesRouter);
  return app;
}

describe("POST /api/grades", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const app = buildTestApp();
    const res = await request(app).post("/api/grades").send({
      courseId: "00000000-0000-0000-0000-000000000001",
      semester: 1,
      academicYear: 2024,
      grade: "A",
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("DELETE /api/grades/:id", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const app = buildTestApp();
    const res = await request(app).delete("/api/grades/00000000-0000-0000-0000-000000000001");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /api/grades/mine", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/api/grades/mine");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
