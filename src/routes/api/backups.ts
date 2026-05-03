import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { listBackups } from "@/server/backups.server";

export const Route = createFileRoute("/api/backups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const limit = Math.min(
            Math.max(1, Number(url.searchParams.get("limit")) || 50),
            200,
          );
          const rows = await listBackups(limit);
          return jsonResponse(
            { rows, total: rows.length },
            { headers: cacheHeaders(60) },
          );
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
