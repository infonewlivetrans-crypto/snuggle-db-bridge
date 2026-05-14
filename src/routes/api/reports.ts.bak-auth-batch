import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  requireUser,
} from "@/server/api-helpers.server";

/**
 * Список отчётов о доставке за период. Не загружается на старте —
 * только при открытии раздела «Отчёты».
 */
export const Route = createFileRoute("/api/reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get("limit")) || 100),
          500,
        );
        const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

        let q = auth.client
          .from("delivery_reports")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false });
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(120) },
        );
      },
    },
  },
});
