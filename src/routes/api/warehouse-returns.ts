import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

/**
 * Enriched list of returned route points for the warehouse-returns page.
 * Returns one payload with points + related orders/routes/drivers/vehicles/photos
 * so the client doesn't need direct supabase access.
 */
export const Route = createFileRoute("/api/warehouse-returns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const warehouseId = url.searchParams.get("warehouse_id");
        const statusFilter = url.searchParams.get("status") ?? "active";

        let q = auth.client
          .from("route_points")
          .select(
            "id, order_id, route_id, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_status_changed_at, dp_status_changed_by, wh_return_status, wh_return_arrived_at, wh_return_accepted_at, wh_return_accepted_by, wh_return_comment, wh_return_status_changed_at, wh_return_status_changed_by",
          )
          .eq("dp_status", "returned_to_warehouse")
          .order("dp_expected_return_at", { ascending: true, nullsFirst: false });
        if (warehouseId && warehouseId !== "all") {
          q = q.eq("dp_return_warehouse_id", warehouseId);
        }
        if (statusFilter === "active") {
          q = q.in("wh_return_status", ["expected", "arrived", "needs_check"]);
        } else if (statusFilter !== "all") {
          q = q.eq("wh_return_status", statusFilter as never);
        }
        const { data: points, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const orderIds = Array.from(
          new Set((points ?? []).map((p) => p.order_id).filter(Boolean) as string[]),
        );
        const routeIds = Array.from(
          new Set((points ?? []).map((p) => p.route_id).filter(Boolean) as string[]),
        );
        const pointIds = (points ?? []).map((p) => p.id);

        const [ordersRes, routesRes, photosRes] = await Promise.all([
          orderIds.length
            ? auth.client
                .from("orders")
                .select("id, order_number, contact_name, delivery_address")
                .in("id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          routeIds.length
            ? auth.client
                .from("routes")
                .select("id, route_number, driver_name, driver_id, vehicle_id")
                .in("id", routeIds)
            : Promise.resolve({ data: [], error: null }),
          pointIds.length
            ? auth.client
                .from("route_point_photos")
                .select("id, route_point_id, file_url, kind")
                .in("route_point_id", pointIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const driverIds = Array.from(
          new Set(
            (routesRes.data ?? [])
              .map((r: { driver_id: string | null }) => r.driver_id)
              .filter(Boolean) as string[],
          ),
        );
        const vehicleIds = Array.from(
          new Set(
            (routesRes.data ?? [])
              .map((r: { vehicle_id: string | null }) => r.vehicle_id)
              .filter(Boolean) as string[],
          ),
        );

        const [driversRes, vehiclesRes] = await Promise.all([
          driverIds.length
            ? auth.client.from("drivers").select("id,full_name,phone").in("id", driverIds)
            : Promise.resolve({ data: [], error: null }),
          vehicleIds.length
            ? auth.client
                .from("vehicles")
                .select("id, plate_number, brand, model")
                .in("id", vehicleIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        return jsonResponse(
          {
            points: points ?? [],
            orders: ordersRes.data ?? [],
            routes: routesRes.data ?? [],
            drivers: driversRes.data ?? [],
            vehicles: vehiclesRes.data ?? [],
            photos: photosRes.data ?? [],
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
