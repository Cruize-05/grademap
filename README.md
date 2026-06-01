# GradeMap UB

> Crowd-sourced academic performance intelligence for Cameroonian university students.

GradeMap UB is a secure, anonymised grade repository that applies a rigorous **KDD (Knowledge Discovery in Databases)** pipeline to produce actionable insights: course difficulty rankings, semester risk scores, dangerous course-combination alerts, and GPA trajectory projections.

---

## Architecture

```
[ React 18 + Vite SPA ]  ←─ HTTPS/JSON ─→  [ Node.js + Express API Gateway ]
                                                        │
                              ┌─────────────────────────┴──────────────────────────┐
                              │                                                      │
                    [ Supabase Postgres ]                         [ Python FastAPI mining service ]
                              ▲                                                      │
                              └──────────────────────────────────────────────────────┘
                                             (read-only, service role)
```

| Service        | Tech                         | Port | Deploy   |
| -------------- | ---------------------------- | ---- | -------- |
| Web SPA        | React 18 + Vite 5 + Tailwind | 5173 | Netlify  |
| API Gateway    | Node 20 + Express 4          | 4000 | Render   |
| Mining service | Python 3.11 + FastAPI        | 8000 | Render   |
| Database       | Supabase Postgres 15 + RLS   | 5432 | Supabase |

---

## Quick start (local dev)

### Prerequisites

- Node.js ≥ 20, pnpm ≥ 11
- Python 3.11
- Docker + Docker Compose (for the full stack)

### 1. Clone and install

```bash
git clone https://github.com/your-org/grademap-ub.git
cd grademap-ub
pnpm install
pip install -r apps/mining/requirements-dev.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 3. Start all services

```bash
docker compose up        # boots postgres + api + mining + web
```

Or run each service individually:

```bash
# Terminal 1 — API gateway
pnpm --filter @grademap/api dev

# Terminal 2 — Web SPA
pnpm --filter @grademap/web dev

# Terminal 3 — Mining service
cd apps/mining && uvicorn app.main:app --reload --port 8000
```

### 4. Seed the database (dev only)

```bash
pnpm seed
```

This applies all migrations, seeds the UB course catalogue, and (in development) loads synthetic grade data.

---

## Environment variables

See `.env.example` for the full list. Critical variables:

| Variable                    | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL                                           |
| `SUPABASE_ANON_KEY`         | Public anon key (frontend)                                     |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (gateway + mining)                            |
| `MINING_SHARED_SECRET`      | Shared secret between gateway and mining                       |
| `K_ANONYMITY_THRESHOLD`     | Min students before aggregate is exposed (default: **10**)     |
| `ALLOWED_EMAIL_DOMAIN`      | Institutional email domain for verification (default: `ub.cm`) |

---

## How insights are computed

### 1. KDD Pipeline (`apps/mining/app/pipeline/`)

The mining service follows the canonical 5-step KDD process:

| Step              | Module              | What it does                                                        |
| ----------------- | ------------------- | ------------------------------------------------------------------- |
| 1. Selection      | `selection.py`      | Reads `v_anonymized_grades` (no profile_id) into a DataFrame        |
| 2. Preprocessing  | `preprocessing.py`  | Drops nulls, clamps grade_point to [0, 5], deduplicates             |
| 3. Transformation | `transformation.py` | Derives `passed` flag, builds course cohorts and semester baskets   |
| 4. Mining         | `mining.py`         | Runs difficulty index, association rules, and trajectory regression |
| 5. Evaluation     | `evaluation.py`     | Writes metrics JSON to `mining_runs.notes`                          |

### 2. Difficulty Index

Per course, we compute a **Bayesian-blended pass rate**:

```
blended_pass_rate = (n × pass_rate + m × prior) / (n + m)
difficulty_score  = 1 − blended_pass_rate
```

where `m = K_ANONYMITY_THRESHOLD` and `prior` is the global mean pass rate across all courses with sufficient data. This prevents courses with tiny cohorts from appearing extremely hard or easy.

### 3. Association Rules (Dangerous Combinations)

We use `mlxtend.frequent_patterns.apriori` with:

- `min_support = 0.05` — a pair must appear in ≥5% of student-semester baskets
- `min_threshold = 1.2` on `lift` — pairs must co-occur more than chance would predict

Only pairwise rules (antecedent size = 1, consequent size = 1) taken in the **same semester** and with `n_students ≥ K_ANONYMITY_THRESHOLD` are retained.

### 4. GPA Trajectory

One `sklearn.linear_model.RidgeCV` model is trained per institution on:

- Features: `[cumulative_mean_grade_point, cumulative_n_courses]`
- Target: `next_semester_GPA`

Cross-validated alpha selection (5-fold) prevents overfitting on small cohorts. Models are persisted with `joblib`.

### 5. k-Anonymity Enforcement

**k = 10** (configurable via `K_ANONYMITY_THRESHOLD`). Every aggregated endpoint checks `n_students ≥ k` before returning data. If the cohort is too small, the API returns:

```json
{ "insufficientData": true, "threshold": 10 }
```

This check occurs at **both** the mining service and the API gateway (defence in depth).

---

## Privacy & Security

- **Row-Level Security** is the authoritative access control layer. The API gateway is a thin proxy — it does not own security.
- **No profile_id** is ever exposed to the mining service. The `v_anonymized_grades` view strips it.
- **Institutional email verification** (`@ub.cm`) is required before grade submissions enter the `approved` state.
- **Admin audit log** records every approve/reject action with actor, target, and timestamp.
- **Synthetic data** (in `db/seed/synthetic_grades.sql`) is loaded only in `development` / CI environments. It is never applied to production.

---

## CI/CD

| Workflow        | Triggers                            | Steps                                  |
| --------------- | ----------------------------------- | -------------------------------------- |
| `ci-web.yml`    | PR + push to main (web/ changes)    | lint → typecheck → test → build        |
| `ci-api.yml`    | PR + push to main (api/ changes)    | lint → typecheck → test → build        |
| `ci-mining.yml` | PR + push to main (mining/ changes) | ruff → mypy → pytest                   |
| `deploy.yml`    | push to main                        | triggers Netlify + Render deploy hooks |

### Deployment secrets

`deploy.yml` triggers each provider's deploy hook. Configure these as **GitHub
Actions repository secrets** (Settings → Secrets and variables → Actions). Until
they are set, each deploy job logs a skip and the workflow stays green.

| Secret                      | Used by       | Where to get it                             |
| --------------------------- | ------------- | ------------------------------------------- |
| `NETLIFY_DEPLOY_HOOK`       | deploy-web    | Netlify site → Build & deploy → Build hooks |
| `RENDER_API_DEPLOY_HOOK`    | deploy-api    | Render service → Settings → Deploy Hook     |
| `RENDER_MINING_DEPLOY_HOOK` | deploy-mining | Render service → Settings → Deploy Hook     |

### Runtime environment per host

Set these in each provider's dashboard (not in the repo):

| Host            | Variables                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Netlify (web)   | `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                                                                                           |
| Render (api)    | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MINING_BASE_URL`, `MINING_SHARED_SECRET`, `CORS_ALLOWED_ORIGINS`, `K_ANONYMITY_THRESHOLD` |
| Render (mining) | `DATABASE_URL`, `MINING_SHARED_SECRET`, `K_ANONYMITY_THRESHOLD`                                                                                              |
| Supabase        | run `db/migrations/*.sql` in order; seed the course catalogue (no synthetic data in production)                                                              |

> Cloud provisioning (Supabase project, Render services, Netlify site) requires
> external accounts and is performed manually outside this repo.

---

## Testing

Each service has its own suite. From the repo root:

| Command                                  | Service | Covers                                                                 |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `pnpm --filter @grademap/web test`       | Web     | Vitest — the bulk-paste CSV parser (`bulkGrades`) and its validations  |
| `pnpm --filter @grademap/api test`       | API     | Jest — auth gating, grade-route validation, and the k-anonymity filter |
| `pnpm --filter @grademap/api rls:test`   | API     | RLS isolation against a **live Postgres** (`DATABASE_URL` required)    |
| `cd apps/mining && .venv/Scripts/pytest` | Mining  | Pipeline transforms, difficulty index, association rules, trajectory   |

Lint, typecheck, and build mirror CI:

```bash
pnpm --filter @grademap/web  lint && pnpm --filter @grademap/web  typecheck
pnpm --filter @grademap/api  lint && pnpm --filter @grademap/api  typecheck
cd apps/mining && ruff check . && mypy app
```

The unit suites (vitest, jest) run with **no external services** — they stub the
Supabase/mining boundaries. Only `rls:test` needs a real Postgres; point
`DATABASE_URL` at the local instance and run `pnpm seed` first.

---

## Build plan status

- [x] **Phase 0** — Bootstrap (monorepo, configs, all services start + respond to `/health`)
- [x] Phase 1 — Database (migrations, RLS policies, seed)
- [x] Phase 2 — Auth & Profiles
- [x] Phase 3 — Grade Submission
- [x] Phase 4 — Mining Pipeline
- [x] Phase 5 — Insight Endpoints
- [x] Phase 6 — Dashboard & Planner UI
- [x] Phase 7 — Admin Console
- [x] Phase 8 — PDF Export
- [x] Phase 9 — CI/CD & Deploy (workflows green locally; cloud provisioning deferred)
- [x] Phase 10 — Quality & Docs (first web/api unit suites; Testing docs)

---

## Ethical disclaimer

> This platform provides statistical guidance based on historical anonymised data. It is **not** academic advice. Always confirm course selection with your faculty advisor.

Last bootstrapped: 2026-05-27
