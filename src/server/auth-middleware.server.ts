// Cookie-or-Bearer middleware. Проверяет httpOnly cookie сессию;
// fallback на Bearer-заголовок (legacy).
import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getCookie } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSessionUser, ACCESS_COOKIE } from "./auth-cookies.server";

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

function makeClientFor(token: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const requireCookieAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    let token: string | null = null;

    // 1) cookie-сессия (с авто-refresh внутри getSessionUser)
    const session = await getSessionUser();
    if (session) {
      token = getCookie(ACCESS_COOKIE) ?? null;
    } else {
      // 2) Legacy Bearer
      const req = getRequest();
      const authHeader = req?.headers?.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const t = authHeader.slice(7).trim();
        if (t) token = t;
      }
    }

    if (!token) unauth();

    const client = makeClientFor(token);
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims?.sub) unauth();

    return next({
      context: {
        supabase: client,
        userId: data.claims.sub as string,
        claims: data.claims,
      },
    });
  },
);
