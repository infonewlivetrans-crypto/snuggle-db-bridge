import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/trips — read-only view of production `delivery_routes`
// filtered by current carrier. No new business logic, no writes.
// Не дублирует водительский контур и Яндекс-маршрут — только список.

export const Route = createFileRoute("/api/carrier/trips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

        const { data, error } = await ctx.admin
          .from("delivery_routes")
          .select(
            "id, route_number, route_date, status, current_stage, " +
              "assigned_driver, assigned_vehicle, driver_id, " +
              "arrived_loading_at, loaded_at, departed_at, finished_at, " +
              "last_driver_location_at, created_at, " +
              "driver:drivers(id, full_name, phone)",
          )
          .eq("carrier_id", ctx.carrierId)
          .order("route_date", { ascending: false })
          .limit(200);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: data?.length ?? 0 });
      },
    },
  },
});
