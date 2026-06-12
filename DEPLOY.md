# Deploying GradeMap UB — Railway + Supabase

The platform runs as **three Railway services** (web, api, mining) built from
this monorepo, plus a **Supabase project** providing Postgres, Auth, and RLS.

```
[ web (nginx, public) ] ──→ [ api (Express, public) ] ──→ [ mining (FastAPI, PRIVATE) ]
                                      │                            │
                                      ▼                            ▼
                              [ Supabase: Auth + Postgres 15 + RLS ]
```

---

## 1. Supabase (do this first)

1. Create a project at https://supabase.com → note down from **Settings**:
   - `Project URL` → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret — server-side only)
   - **Database → Connection string (URI)** → `DATABASE_URL`
     (use the _Session pooler_ string; SQLAlchemy/psycopg2 and node-pg both work with it)

2. **Run the migrations.** Either paste `db/migrations/*.sql` (in order, 000→011)
   into the Supabase SQL editor, or run the migration runner locally against
   the cloud database:

   ```bash
   DATABASE_URL="postgresql://...supabase.../postgres" pnpm --filter @grademap/api migrate
   ```

   `000_local_auth_shim.sql` is a guarded no-op on Supabase (the `auth` schema
   already exists). The runner records applied files in `_migrations`, so
   re-running is safe.

3. **Seed the course catalogue** (`db/seed/courses.sql`) via the SQL editor.
   ⚠️ Do **NOT** load `db/seed/synthetic_grades.sql` in production — synthetic
   data is for dev/CI only.

4. **Auth settings** (Authentication → URL Configuration): after step 2 below
   you will add the web service's public URL as the _Site URL_ and a redirect URL.

---

## 2. Railway

Create one Railway project, then add **three services**, each pointing at this
same GitHub repo. For every service set **Root Directory = repo root** (leave
empty) and set the **config file path** under _Settings → Config-as-code_:

| Service | Config file           | Networking                                  |
| ------- | --------------------- | ------------------------------------------- |
| api     | `railway.api.json`    | Generate a **public domain**                |
| mining  | `railway.mining.json` | **No public domain** — private network only |
| web     | `railway.web.json`    | Generate a **public domain**                |

The config files select the right Dockerfile, healthcheck, and watch paths
(so a web-only commit doesn't rebuild the mining service).

### Service variables

**api** (Variables tab):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
MINING_BASE_URL=http://mining.railway.internal:8000
MINING_SHARED_SECRET=<generate a long random string>
CORS_ALLOWED_ORIGINS=https://<web public domain>
K_ANONYMITY_THRESHOLD=10
ALLOWED_EMAIL_DOMAIN=ub.cm
NODE_ENV=production
```

**mining**:

```
DATABASE_URL=<Supabase connection string>
MINING_SHARED_SECRET=<same value as api>
K_ANONYMITY_THRESHOLD=10
PORT=8000
```

> `PORT=8000` is pinned so the api can reach it at
> `mining.railway.internal:8000` over Railway's private network. The mining
> service binds `::` (IPv6) — required for private networking. Keeping mining
> private means the KDD endpoints are not reachable from the internet at all.

**web** (baked into the bundle at **build** time — set these _before_ the first build):

```
VITE_API_BASE_URL=https://<api public domain>
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

> Railway exposes service variables to Dockerfile builds as build args
> (the web Dockerfile declares the matching `ARG`s). If you change them later,
> trigger a **redeploy** so the bundle is rebuilt.

### Deployment order

1. Deploy **mining** and **api** first (api's healthcheck `/api/health` must go green).
2. Copy the api's public domain into the web service's `VITE_API_BASE_URL`, deploy **web**.
3. Copy the web's public domain into:
   - api's `CORS_ALLOWED_ORIGINS`
   - Supabase **Auth → URL Configuration → Site URL** (and Redirect URLs)
4. Redeploy the api (so CORS picks up the web domain).

### Admin user

Promote an account to admin by setting its JWT claim in Supabase
(SQL editor):

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
WHERE email = 'you@ub.cm';
```

### Running the pipeline

Sign in as the admin → Admin console → **Run now** (or
`POST /api/admin/mining/run`). The first run populates the difficulty cache
and trains the trajectory models.

---

## 3. Continuous deployment

Railway auto-deploys on every push to `main` (per-service `watchPatterns`
limit rebuilds to the service whose files changed). The GitHub Actions
workflows (`ci-web`, `ci-api`, `ci-mining`) remain as the test gate — protect
`main` with required checks so broken code never reaches Railway.

## 4. Smoke test checklist

- `https://<api domain>/api/health` → `{"status":"ok",...}`
- Web loads, magic-link sign-in works (check Supabase Auth → Users)
- Submit a grade → appears in Admin quarantine → approve
- Admin → Run pipeline → dashboard shows insights (with n ≥ 10 cohorts)
- `GET /api/grades/report` downloads the PDF
