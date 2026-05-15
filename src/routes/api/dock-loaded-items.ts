import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  requireAuth,
} from "@/server/api-helpers.server";
import { insertHandler } from "@/server/table-crud.server";

export const Route = createFileRoute("/api/dock-loaded-items")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const deliveryRouteId = url.searchParams.get("delivery_route_id");
        if (!deliveryRouteId) {
          return jsonResponse(
            { error: "delivery_route_id required" },
            { status: 400 },
          );
        }
        const { data, error } = await auth.client
          .from("dock_loaded_items")
          .select("id, product_id, nomenclature, qty_loaded")
          .eq("delivery_route_id", deliveryRouteId);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [] },
          { headers: cacheHeaders(10) },
        );
      },
      POST: insertHandler("dock_loaded_items"),
    },
  },
});
