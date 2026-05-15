import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/warehouse-schedule")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const date = url.searchParams.get("date");
        const warehouseId = url.searchParams.get("warehouse_id");
        if (!date) return jsonResponse({ error: "date required" }, { status: 400 });

        let q = auth.client
          .from("routes")
          .select(
            "id,route_number,route_date,planned_departure_at,departure_time,status,driver_name,driver_id,vehicle_id,warehouse_id,destination_warehouse_id,comment,request_type",
          )
          .eq("route_date", date)
          .order("planned_departure_at", { ascending: true, nullsFirst: false });
        if (warehouseId && warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
        const { data: routes, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const driverIds = Array.from(
          new Set((routes ?? []).map((r) => r.driver_id).filter(Boolean) as string[]),
        );
        const vehicleIds = Array.from(
          new Set((routes ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[]),
        );
        const destIds = Array.from(
          new Set(
            (routes ?? []).map((r) => r.destination_warehouse_id).filter(Boolean) as string[],
          ),
        );

        const [driversRes, vehiclesRes, destRes] = await Promise.all([
          driverIds.length
            ? auth.client.from("drivers").select("id,full_name").in("id", driverIds)
            : Promise.resolve({ data: [], error: null }),
          vehicleIds.length
            ? auth.client
                .from("vehicles")
                .select("id,plate_number,brand,model")
                .in("id", vehicleIds)
            : Promise.resolve({ data: [], error: null }),
          destIds.length
            ? auth.client.from("warehouses").select("id,name,city").in("id", destIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        return jsonResponse(
          {
            routes: routes ?? [],
            drivers: driversRes.data ?? [],
            vehicles: vehiclesRes.data ?? [],
            destinations: destRes.data ?? [],
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
