// Server-side env normalization.
//
// Reason: src/integrations/supabase/client.server.ts is auto-generated and
// reads STRICTLY process.env.SUPABASE_URL / process.env.SUPABASE_SERVICE_ROLE_KEY
// without a VITE_* fallback. In some runtimes (PM2 / self-hosted Node) the
// host process exposes VITE_SUPABASE_URL but not the un-prefixed SUPABASE_URL,
// which makes supabaseAdmin throw "Missing Supabase server environment variables"
// even though SUPABASE_SERVICE_ROLE_KEY is set.
//
// This module mirrors VITE_* fallbacks into the un-prefixed names so that the
// auto-generated lazy proxy can construct the admin client successfully.
//
// Imported once from src/start.ts so it runs before any server function fires.
// Pure side effect, no exports.

if (typeof process !== "undefined" && process.env) {
  const env = process.env as Record<string, string | undefined>;
  if (!env.SUPABASE_URL && env.VITE_SUPABASE_URL) {
    env.SUPABASE_URL = env.VITE_SUPABASE_URL;
  }
  if (!env.SUPABASE_PUBLISHABLE_KEY && env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    env.SUPABASE_PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
}

export {};
