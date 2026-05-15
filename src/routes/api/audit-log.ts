import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAdmin, requireAuth } from "@/server/api-helpers.server";
import { listAudit } from "@/server/audit.server";

export const Route = createFileRoute("/api/audit-log")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // Лёгкий count-only режим — доступен любому авторизованному пользователю
        // (используется на дашборде «Контроль работы» для активности системы).
        if (url.searchParams.get("count_only") === "1") {
          const auth = await requireAuth(request);
          if (auth instanceof Response) return auth;
          const since = url.searchParams.get("since");
          let q = (auth.client as never as { from: (t: string) => any })
            .from("audit_log")
            .select("id", { count: "exact", head: true });
          if (since) q = q.gte("created_at", since);
          const { count, error } = await q;
          if (error) return jsonResponse({ count: 0, error: error.message }, { status: 500 });
          return jsonResponse({ count: count ?? 0 }, { headers: cacheHeaders(30) });
        }

        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
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
          }, auth.client);
          return jsonResponse(result, { headers: cacheHeaders(45) });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
