import { createStart, createMiddleware, createIsomorphicFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Server-only env normalization. Mirrors VITE_SUPABASE_URL -> SUPABASE_URL and
// PUBLISHABLE/ANON variants so the auto-generated supabaseAdmin lazy proxy
// (which reads strictly process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
// can construct successfully under PM2/self-hosted Node.
//
// Implemented via createIsomorphicFn so the server impl is stripped from the
// client bundle at build time (no top-level import of *.server.ts from a
// client-reachable entry — import-protection stays intact).
const bootstrapServerEnv = createIsomorphicFn()
  .client(() => {})
  .server(() => {
    if (typeof process === "undefined" || !process.env) return;
    const env = process.env as Record<string, string | undefined>;
    if (!env.SUPABASE_URL && env.VITE_SUPABASE_URL) {
      env.SUPABASE_URL = env.VITE_SUPABASE_URL;
    }
    const publishable =
      env.SUPABASE_PUBLISHABLE_KEY ??
      env.SUPABASE_ANON_KEY ??
      env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      env.VITE_SUPABASE_ANON_KEY;
    if (publishable) {
      if (!env.SUPABASE_PUBLISHABLE_KEY) env.SUPABASE_PUBLISHABLE_KEY = publishable;
      if (!env.SUPABASE_ANON_KEY) env.SUPABASE_ANON_KEY = publishable;
    }
  });
bootstrapServerEnv();

// Inject Supabase access token into every server function call so that
// `requireSupabaseAuth` middleware can authenticate the request.
const supabaseAuthHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers = { Authorization: `Bearer ${token}` };
      } catch {
        // ignore — request will fail with 401 in protected middleware
      }
    }
    return next({ headers });
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, supabaseAuthHeader],
}));
