import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import { clearSessionCookies } from "@/server/auth-cookies.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        clearSessionCookies();
        return jsonResponse({ ok: true });
      },
    },
  },
});
