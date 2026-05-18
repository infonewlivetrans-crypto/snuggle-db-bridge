import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

/**
 * Список зафиксированных проблем системы. Используется на экранах
 * "Пилотный запуск" и "Список ошибок". Только чтение.
 *
 * GET /api/system-issues?status_neq=done&limit=20
 */
export const Route = createFileRoute("/api/system-issues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const statusNeq = url.searchParams.get("status_neq");
        const status = url.searchParams.get("status");
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

        let q = auth.client
          .from("system_issues" as never)
          .select("id, title, severity, status, role, location, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (statusNeq) q = q.neq("status", statusNeq as never);
        if (status) q = q.eq("status", status as never);

        const { data, error } = await q;
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? [], { headers: cacheHeaders(20) });
      },
    },
  },
});
