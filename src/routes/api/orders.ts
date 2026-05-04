import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

const SELECT = `
  id, order_number, status, payment_status, amount_due, delivery_cost, goods_amount,
  total_weight_kg, total_volume_m3, destination_city, delivery_address,
  contact_name, contact_phone, created_at, updated_at
`;

const CreateOrderSchema = z.object({
  order_number: z.string().min(1).max(255),
  delivery_address: z.string().max(2000).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  map_link: z.string().max(2000).nullable().optional(),
  landmarks: z.string().max(2000).nullable().optional(),
  access_instructions: z.string().max(2000).nullable().optional(),
  contact_name: z.string().max(255).nullable().optional(),
  contact_phone: z.string().max(64).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  payment_type: z.string().max(32).optional(),
  payment_status: z.string().max(32).optional(),
  requires_qr: z.boolean().optional(),
  delivery_photo_url: z.string().nullable().optional(),
  total_weight_kg: z.number().nullable().optional(),
  total_volume_m3: z.number().nullable().optional(),
  items_count: z.number().nullable().optional(),
  amount_due: z.number().nullable().optional(),
  status: z.string().max(32).optional(),
  source: z.string().max(32).optional(),
});

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

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
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });

        let rows: unknown[] = Array.isArray(data) ? data : [];
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

        return jsonResponse(rows, {
          headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? rows.length) },
        });
      },

      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = CreateOrderSchema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { data, error } = await auth.client
          .from("orders")
          .insert(parsed.data as never)
          .select("id")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ id: (data as { id: string }).id });
      },
    },
  },
});
