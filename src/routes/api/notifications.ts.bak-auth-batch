import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const { limit, offset, url } = parseListParams(request);
        const orderId = url.searchParams.get("order_id");
        const fields =
          url.searchParams.get("fields") ||
          "id, kind, title, body, order_id, payload, is_read, created_at";

        let q = auth.client
          .from("notifications")
          .select(fields, { count: "exact" })
          .order("created_at", { ascending: false });
        if (orderId) q = q.eq("order_id", orderId);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(30) },
        );
      },
    },
  },
});
