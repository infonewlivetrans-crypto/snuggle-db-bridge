import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

const SELECT =
  "id, route_number, request_type, status, request_status, route_date, departure_time, request_priority, warehouse_id, destination_warehouse_id, carrier_id, driver_id, vehicle_id, points_count, total_weight_kg, total_volume_m3, delivery_cost, carrier_cost, carrier_payment_status";

export const Route = createFileRoute("/api/transport-requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const type = url.searchParams.get("type");

        let q = auth.client
          .from("routes")
          .select(SELECT, { count: "exact" })
          .order("route_date", { ascending: false });

        if (status && status !== "all") q = q.eq("status", status as never);
        if (type && type !== "all") q = q.eq("request_type", type as never);
        if (search) q = q.ilike("route_number", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const rows = ((data ?? []) as unknown) as Array<Record<string, unknown>>;
        const whIds = Array.from(new Set(rows.flatMap((r) => [r.warehouse_id, r.destination_warehouse_id]).filter((v): v is string => typeof v === "string" && v.length > 0)));
        const carrierIds = Array.from(new Set(rows.map((r) => r.carrier_id).filter((v): v is string => typeof v === "string" && v.length > 0)));
        const driverIds = Array.from(new Set(rows.map((r) => r.driver_id).filter((v): v is string => typeof v === "string" && v.length > 0)));
        const vehicleIds = Array.from(new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => typeof v === "string" && v.length > 0)));

        const [whRes, carrierRes, driverRes, vehicleRes] = await Promise.all([
          whIds.length > 0 ? auth.client.from("warehouses").select("id, name, address").in("id", whIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; address: string | null }> }),
          carrierIds.length > 0 ? auth.client.from("carriers").select("id, company_name").in("id", carrierIds) : Promise.resolve({ data: [] as Array<{ id: string; company_name: string | null }> }),
          driverIds.length > 0 ? auth.client.from("drivers").select("id, full_name, phone").in("id", driverIds) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> }),
          vehicleIds.length > 0 ? auth.client.from("vehicles").select("id, plate_number, brand, model").in("id", vehicleIds) : Promise.resolve({ data: [] as Array<{ id: string; plate_number: string | null; brand: string | null; model: string | null }> }),
        ]);

        const whMap = new Map((whRes.data ?? []).map((w) => [w.id, { name: w.name, address: w.address }]));
        const carrierMap = new Map((carrierRes.data ?? []).map((c) => [c.id, { company_name: c.company_name }]));
        const driverMap = new Map((driverRes.data ?? []).map((d) => [d.id, { full_name: d.full_name, phone: d.phone }]));
        const vehicleMap = new Map((vehicleRes.data ?? []).map((v) => [v.id, { plate_number: v.plate_number, brand: v.brand, model: v.model }]));
        const enriched = rows.map((r) => ({
          ...r,
          warehouses: typeof r.warehouse_id === "string" ? whMap.get(r.warehouse_id) ?? null : null,
          destination: typeof r.destination_warehouse_id === "string" ? whMap.get(r.destination_warehouse_id) ?? null : null,
          carrier: typeof r.carrier_id === "string" ? carrierMap.get(r.carrier_id) ?? null : null,
          driver: typeof r.driver_id === "string" ? driverMap.get(r.driver_id) ?? null : null,
          vehicle: typeof r.vehicle_id === "string" ? vehicleMap.get(r.vehicle_id) ?? null : null,
        }));

        return jsonResponse(
          { rows: enriched, total: count ?? 0 },
          { headers: cacheHeaders(60) },
        );
      },
    },
  },
});
