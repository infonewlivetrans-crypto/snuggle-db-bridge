import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-photos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const routePointId = url.searchParams.get("route_point_id");
        const orderId = url.searchParams.get("order_id");
        const preview = url.searchParams.get("preview") === "1";

        const fields = preview
          ? "id, route_point_id, order_id, kind, created_at"
          : "id, route_point_id, order_id, kind, file_url, storage_path, created_at";

        let q = auth.client
          .from("route_point_photos")
          .select(fields)
          .order("created_at", { ascending: true })
          .limit(200);
        if (routePointId) q = q.eq("route_point_id", routePointId);
        if (orderId) q = q.eq("order_id", orderId);

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [] },
          { headers: cacheHeaders(180) },
        );
      },
    },
  },
});
