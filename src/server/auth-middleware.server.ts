// Cookie-or-Bearer middleware. Проверяет httpOnly cookie сессию;
// fallback на Bearer-заголовок (legacy).
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSessionUser } from "./auth-cookies.server";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

function unauth(): never {
  throw new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export const requireCookieAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    // 1) cookie-сессия
    const session = await getSessionUser();
    if (session) {
      return next({
        context: {
          supabase: session.client,
          userId: session.userId,
          claims: undefined as unknown,
        },
      });
    }

    // 2) Legacy Bearer
    const req = getRequest();
    const auth = req?.headers?.get("authorization");
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      if (token) {
        const client = createClient<Database>(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        );
        const { data, error } = await client.auth.getClaims(token);
        if (!error && data?.claims?.sub) {
          return next({
            context: {
              supabase: client,
              userId: data.claims.sub as string,
              claims: data.claims,
            },
          });
        }
      }
    }

    unauth();
  },
);
