import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/order-return-info")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const orderId = url.searchParams.get("order_id");
        if (!orderId) return jsonResponse({ error: "order_id required" }, { status: 400 });

        const { data: point, error: ptErr } = await auth.client
          .from("route_points")
          .select(
            "id, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_status_changed_at, route_id",
          )
          .eq("order_id", orderId)
          .eq("dp_status", "returned_to_warehouse")
          .order("dp_status_changed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ptErr) return jsonResponse({ error: ptErr.message }, { status: 500 });
        if (!point) return jsonResponse({ point: null }, { headers: cacheHeaders(15) });

        const p = point as Record<string, unknown> & {
          id: string;
          route_id: string;
          dp_return_warehouse_id: string | null;
        };

        const [routeRes, whRes, photosRes] = await Promise.all([
          auth.client
            .from("routes")
            .select("driver_name, driver_id, vehicle_id")
            .eq("id", p.route_id)
            .maybeSingle(),
          p.dp_return_warehouse_id
            ? auth.client
                .from("warehouses")
                .select("name")
                .eq("id", p.dp_return_warehouse_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          auth.client
            .from("route_point_photos")
            .select("id, file_url, kind")
            .eq("route_point_id", p.id)
            .eq("kind", "problem"),
        ]);

        const route = (routeRes as { data: { driver_name: string | null; driver_id: string | null; vehicle_id: string | null } | null }).data;
        let driverFull: string | null = null;
        let vehicle: { plate_number: string | null; brand: string | null; model: string | null } | null = null;
        if (route?.driver_id) {
          const { data } = await auth.client
            .from("drivers")
            .select("full_name")
            .eq("id", route.driver_id)
            .maybeSingle();
          driverFull = (data as { full_name: string | null } | null)?.full_name ?? null;
        }
        if (route?.vehicle_id) {
          const { data } = await auth.client
            .from("vehicles")
            .select("plate_number, brand, model")
            .eq("id", route.vehicle_id)
            .maybeSingle();
          vehicle = (data as typeof vehicle) ?? null;
        }

        return jsonResponse(
          {
            point: {
              ...p,
              driver_full_name: driverFull,
              driver_name: route?.driver_name ?? null,
              vehicle,
              warehouse_name: (whRes.data as { name: string | null } | null)?.name ?? null,
            },
            photos: (photosRes.data ?? []) as Array<{ id: string; file_url: string; kind: string }>,
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
