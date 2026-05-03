import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { adminListUsers } from "@/server/users.server";

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const limit = Math.min(
            Math.max(1, Number(url.searchParams.get("limit")) || 20),
            100,
          );
          const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
          const all = await adminListUsers();
          const rows = all.slice(offset, offset + limit);
          return jsonResponse(
            { rows, total: all.length },
            { headers: cacheHeaders(60) },
          );
        } catch (e) {
          return jsonResponse(
            { error: (e as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});
