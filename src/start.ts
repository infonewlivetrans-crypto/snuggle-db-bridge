import { createStart, createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

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
  functionMiddleware: [supabaseAuthHeader],
}));
