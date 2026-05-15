import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

/**
 * У delivery_routes нет FK на routes / warehouses, поэтому PostgREST embed
 * (`source_request:source_request_id(...)`, `source_warehouse:source_warehouse_id(...)`)
 * падает с PGRST200 → 500. Делаем select без embed и дозаполняем вторыми запросами.
 */
export const Route = createFileRoute("/api/delivery-routes/$id/detail")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("delivery_routes")
          .select(
            "id, route_number, route_date, status, comment, source_request_id, source_warehouse_id, assigned_driver, assigned_vehicle",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });

        const row = data as Record<string, unknown> & {
          source_request_id?: string | null;
          source_warehouse_id?: string | null;
        };

        const [reqRes, whRes] = await Promise.all([
          row.source_request_id
            ? auth.client
                .from("routes")
                .select("route_number")
                .eq("id", row.source_request_id)
                .maybeSingle()
            : Promise.resolve({ data: null as { route_number: string | null } | null }),
          row.source_warehouse_id
            ? auth.client
                .from("warehouses")
                .select("name, city")
                .eq("id", row.source_warehouse_id)
                .maybeSingle()
            : Promise.resolve({ data: null as { name: string | null; city: string | null } | null }),
        ]);

        return jsonResponse(
          {
            ...row,
            source_request: reqRes.data ?? null,
            source_warehouse: whRes.data ?? null,
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
