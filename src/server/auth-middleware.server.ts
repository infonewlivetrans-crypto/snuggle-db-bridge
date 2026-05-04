// Cookie-based middleware для server functions.
// Заменяет requireSupabaseAuth (Bearer) — теперь токены живут только в httpOnly cookies.
import { createMiddleware } from "@tanstack/react-start";
import { getSessionUser } from "./auth-cookies.server";

export const requireCookieAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const session = await getSessionUser();
    if (!session) {
      throw new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return next({
      context: {
        supabase: session.client,
        userId: session.userId,
      },
    });
  },
);
