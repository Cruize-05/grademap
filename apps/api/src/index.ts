import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import pino from "pino";

import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { coursesRouter } from "./routes/courses.js";
import { gradesRouter } from "./routes/grades.js";
import { insightsRouter } from "./routes/insights.js";
import { adminRouter } from "./routes/admin.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/auth.js";

const isDev = process.env["NODE_ENV"] !== "production";
export const logger = isDev
  ? pino({ transport: { target: "pino-pretty", options: { colorize: true } } })
  : pino();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (process.env["CORS_ALLOWED_ORIGINS"] ?? "http://localhost:5173").split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.use("/api/health", healthRouter);
app.use("/api/me", requireAuth, meRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/grades", requireAuth, gradesRouter);
app.use("/api", requireAuth, insightsRouter);
app.use("/api/admin", requireAuth, adminRouter);

app.use(errorHandler);

const port = Number(process.env["PORT"] ?? 4000);
app.listen(port, () => {
  logger.info({ port }, "GradeMap API gateway started");
});

export { app };
