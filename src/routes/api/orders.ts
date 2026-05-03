import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

const SELECT = `
  id, order_number, status, payment_status, amount_due, delivery_cost, goods_amount,
  total_weight_kg, total_volume_m3, destination_city, delivery_address,
  contact_name, contact_phone, created_at, updated_at
`;

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const includeRoutes = url.searchParams.get("includeRoutes") === "1";

        let q = auth.client
          .from("orders")
          .select(SELECT, { count: "exact" })
          .order("created_at", { ascending: false });
        if (status && status !== "all") q = q.eq("status", status as never);
        if (search) {
          q = q.or(
            `order_number.ilike.%${search}%,contact_name.ilike.%${search}%,delivery_address.ilike.%${search}%`,
          );
        }

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        let rows: unknown[] = data ?? [];
        if (includeRoutes && rows.length > 0) {
          const ids = (rows as { id: string }[]).map((r) => r.id);
          const { data: pts } = await auth.client
            .from("route_points")
            .select(
              `order_id,
               route:route_id (
                 id, route_number, route_date, driver_name, status, organization, transport_kind,
                 warehouse:warehouse_id ( id, name, city ),
                 carrier:carrier_id ( id, company_name ),
                 driver:driver_id ( id, full_name, phone ),
                 vehicle:vehicle_id ( id, plate_number, brand, model )
               )`,
            )
            .in("order_id", ids);
          const map = new Map<string, unknown>();
          for (const p of pts ?? []) {
            const pp = p as { order_id: string; route: unknown };
            if (pp.order_id && pp.route && !map.has(pp.order_id)) {
              map.set(pp.order_id, pp.route);
            }
          }
          rows = (rows as { id: string }[]).map((r) => ({
            ...r,
            route: map.get(r.id) ?? null,
          }));
        }

        return jsonResponse(
          { rows, total: count ?? 0 },
          { headers: cacheHeaders(60) },
        );
      },
    },
  },
});
