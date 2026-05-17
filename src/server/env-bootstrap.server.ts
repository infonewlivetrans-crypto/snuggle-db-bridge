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
  // PUBLISHABLE_KEY и ANON_KEY — это один и тот же ключ под разными именами.
  // PM2/Node-окружение в проде часто выставляет SUPABASE_ANON_KEY; код читает
  // SUPABASE_PUBLISHABLE_KEY — нормализуем оба направления, плюс VITE_*-фоллбек.
  const publishable =
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_ANON_KEY;
  if (publishable) {
    if (!env.SUPABASE_PUBLISHABLE_KEY) env.SUPABASE_PUBLISHABLE_KEY = publishable;
    if (!env.SUPABASE_ANON_KEY) env.SUPABASE_ANON_KEY = publishable;
  }
}

export {};
