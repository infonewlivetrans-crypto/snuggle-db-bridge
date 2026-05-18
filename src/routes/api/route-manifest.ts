import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

/**
 * Серверная сборка маршрутного листа для печати.
 * Заменяет прямые browser-вызовы supabase.from("delivery_routes"/"warehouses"/"route_points").
 */
export const Route = createFileRoute("/api/route-manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const deliveryRouteId = url.searchParams.get("delivery_route_id");
        if (!deliveryRouteId) {
          return jsonResponse({ error: "delivery_route_id required" }, { status: 400 });
        }

        const { data: route, error: rErr } = await auth.client
          .from("delivery_routes")
          .select(
            "route_number, route_date, assigned_driver, assigned_vehicle, source_request_id, source_warehouse_id",
          )
          .eq("id", deliveryRouteId)
          .maybeSingle();
        if (rErr) return jsonResponse({ error: rErr.message }, { status: 500 });
        if (!route) return jsonResponse({ error: "not_found" }, { status: 404 });

        const r = route as unknown as {
          route_number: string;
          route_date: string;
          assigned_driver: string | null;
          assigned_vehicle: string | null;
          source_request_id: string;
          source_warehouse_id: string | null;
        };

        let sourceWarehouse: { name: string; city: string | null } | null = null;
        if (r.source_warehouse_id) {
          const { data: wh } = await auth.client
            .from("warehouses")
            .select("name, city")
            .eq("id", r.source_warehouse_id)
            .maybeSingle();
          sourceWarehouse = (wh as { name: string; city: string | null } | null) ?? null;
        }

        const { data: pts, error: pErr } = await auth.client
          .from("route_points")
          .select(
            "point_number, order:order_id(order_number, contact_name, contact_phone, delivery_address, map_link, latitude, longitude, amount_due, payment_type, payment_status, requires_qr, comment)",
          )
          .eq("route_id", r.source_request_id)
          .order("point_number", { ascending: true });
        if (pErr) return jsonResponse({ error: pErr.message }, { status: 500 });

        return jsonResponse(
          {
            route_number: r.route_number,
            route_date: r.route_date,
            driver: r.assigned_driver,
            vehicle: r.assigned_vehicle,
            warehouse: sourceWarehouse
              ? `${sourceWarehouse.name}${sourceWarehouse.city ? `, ${sourceWarehouse.city}` : ""}`
              : null,
            points: pts ?? [],
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
