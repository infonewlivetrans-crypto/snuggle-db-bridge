import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/trips — read-only view of production `delivery_routes`
// filtered by current carrier.

export const Route = createFileRoute("/api/carrier/trips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) {
          return jsonResponse({
            ok: false,
            reason: "no_carrier_linked",
            rows: [],
            total: 0,
          });
        }

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
        if (error)
          return jsonResponse(
            { ok: false, error: error.message, rows: [], total: 0 },
            { status: 200 },
          );
        return jsonResponse({
          ok: true,
          rows: data ?? [],
          total: data?.length ?? 0,
        });
      },
    },
  },
});
