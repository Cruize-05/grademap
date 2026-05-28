// Jest globals — set env vars before any module loads.
// Must be .cjs: ts-jest/ESM preset emits `export {}` in .ts files, which
// breaks Jest's setupFiles runner (expects CommonJS).
process.env["SUPABASE_URL"] ??= "https://placeholder.supabase.co";
process.env["SUPABASE_ANON_KEY"] ??= "placeholder-anon";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "placeholder-service";
process.env["NODE_ENV"] ??= "test";
