import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin } from "@/server/api-helpers.server";
import { listAudit } from "@/server/audit.server";

export const Route = createFileRoute("/api/audit-log")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
          const pageSize = Math.min(
            Math.max(1, Number(url.searchParams.get("pageSize")) || 50),
            200,
          );
          const result = await listAudit({
            page,
            pageSize,
            from: url.searchParams.get("from"),
            to: url.searchParams.get("to"),
            userId: url.searchParams.get("userId"),
            role: url.searchParams.get("role"),
            section: url.searchParams.get("section"),
            action: url.searchParams.get("action"),
            search: url.searchParams.get("search"),
          });
          return jsonResponse(result, { headers: cacheHeaders(45) });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
