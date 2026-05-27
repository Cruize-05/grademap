// Jest globals — set env vars before any module loads.
process.env["SUPABASE_URL"] ??= "https://placeholder.supabase.co";
process.env["SUPABASE_ANON_KEY"] ??= "placeholder-anon";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "placeholder-service";
process.env["NODE_ENV"] ??= "test";
