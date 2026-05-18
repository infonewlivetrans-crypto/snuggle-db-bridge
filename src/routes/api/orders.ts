import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

const SELECT = `
  id, order_number, onec_order_number, status, payment_status, payment_type, requires_qr,
  amount_due, delivery_cost, goods_amount,
  total_weight_kg, total_volume_m3, destination_city, delivery_address, delivery_zone,
  contact_name, contact_phone, created_at, updated_at, client_id, source,
  manager_comment, recipient_contact_time, recipient_work_hours,
  recipient_delivery_comment, recipient_access_comment, recipient_extra_note
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
  goods_amount: z.number().nullable().optional(),
  delivery_cost: z.number().nullable().optional(),
  status: z.string().max(32).optional(),
  source: z.string().max(32).optional(),
  client_id: z.string().uuid().nullable().optional(),
  marketplace: z.string().max(64).nullable().optional(),
  client_works_weekends: z.boolean().nullable().optional(),
  delivery_window_from: z.string().nullable().optional(),
  delivery_window_to: z.string().nullable().optional(),
  goods: z.string().max(4000).nullable().optional(),
});

export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const includeRoutes = url.searchParams.get("includeRoutes") === "1";
        const createdToday = url.searchParams.get("created_today") === "1";
        const idsParam = url.searchParams.get("ids");

        let q = auth.client
          .from("orders")
          .select(SELECT, { count: "exact" })
          .order("created_at", { ascending: false });
        if (idsParam) {
          const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
          if (ids.length === 0) return jsonResponse([], { headers: { "X-Total-Count": "0" } });
          q = q.in("id", ids);
        }
        if (createdToday) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          q = q.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
        }
        if (status && status !== "all") q = q.eq("status", status as never);
        if (search) {
          q = q.or(
            `order_number.ilike.%${search}%,contact_name.ilike.%${search}%,delivery_address.ilike.%${search}%`,
          );
        }

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) {
          console.error("/api/orders GET error:", error.message);
          return jsonResponse([], { headers: { "X-Total-Count": "0", "X-Error": error.message } });
        }

        let rows: unknown[] = Array.isArray(data) ? data : [];
        if (includeRoutes && rows.length > 0) {
          const ids = (rows as { id: string }[]).map((r) => r.id).filter(Boolean);
          if (ids.length > 0) {
            // Avoid PostgREST embedded joins (route_points -> routes -> warehouses/...)
            // because the schema cache for those relationships has been unreliable in
            // production (PGRST200). Resolve everything via plain selects + server-side merge.
            const { data: pts, error: ptsErr } = await auth.client
              .from("route_points")
              .select("order_id, route_id")
              .in("order_id", ids);
            if (ptsErr) {
              console.error("/api/orders includeRoutes route_points error:", ptsErr.message);
            }
            const orderToRouteId = new Map<string, string>();
            const routeIdSet = new Set<string>();
            for (const p of (pts ?? []) as Array<{ order_id: string | null; route_id: string | null }>) {
              if (p?.order_id && p.route_id && !orderToRouteId.has(p.order_id)) {
                orderToRouteId.set(p.order_id, p.route_id);
                routeIdSet.add(p.route_id);
              }
            }
            const routeIds = Array.from(routeIdSet);
            const routesRes = routeIds.length > 0
              ? await auth.client
                  .from("routes")
                  .select(
                    "id, route_number, route_date, driver_name, status, organization, transport_kind, warehouse_id, carrier_id, driver_id, vehicle_id",
                  )
                  .in("id", routeIds)
              : { data: [] as Array<Record<string, unknown>>, error: null };
            if (routesRes.error) {
              console.error("/api/orders includeRoutes routes error:", routesRes.error.message);
            }
            const routesArr = (routesRes.data ?? []) as Array<{
              id: string;
              warehouse_id: string | null;
              carrier_id: string | null;
              driver_id: string | null;
              vehicle_id: string | null;
              [k: string]: unknown;
            }>;
            const warehouseIds = Array.from(new Set(routesArr.map((r) => r.warehouse_id).filter((v): v is string => !!v)));
            const carrierIds = Array.from(new Set(routesArr.map((r) => r.carrier_id).filter((v): v is string => !!v)));
            const driverIds = Array.from(new Set(routesArr.map((r) => r.driver_id).filter((v): v is string => !!v)));
            const vehicleIds = Array.from(new Set(routesArr.map((r) => r.vehicle_id).filter((v): v is string => !!v)));
            const [whRes, carRes, drvRes, vehRes] = await Promise.all([
              warehouseIds.length
                ? auth.client.from("warehouses").select("id, name, city").in("id", warehouseIds)
                : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; city: string | null }>, error: null }),
              carrierIds.length
                ? auth.client.from("carriers").select("id, company_name").in("id", carrierIds)
                : Promise.resolve({ data: [] as Array<{ id: string; company_name: string | null }>, error: null }),
              driverIds.length
                ? auth.client.from("drivers").select("id, full_name, phone").in("id", driverIds)
                : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; phone: string | null }>, error: null }),
              vehicleIds.length
                ? auth.client.from("vehicles").select("id, plate_number, brand, model").in("id", vehicleIds)
                : Promise.resolve({ data: [] as Array<{ id: string; plate_number: string | null; brand: string | null; model: string | null }>, error: null }),
            ]);
            const whMap = new Map((whRes.data ?? []).map((w) => [w.id, w]));
            const carMap = new Map((carRes.data ?? []).map((c) => [c.id, c]));
            const drvMap = new Map((drvRes.data ?? []).map((d) => [d.id, d]));
            const vehMap = new Map((vehRes.data ?? []).map((v) => [v.id, v]));
            const routeMap = new Map<string, unknown>();
            for (const r of routesArr) {
              routeMap.set(r.id, {
                ...r,
                warehouse: r.warehouse_id ? whMap.get(r.warehouse_id) ?? null : null,
                carrier: r.carrier_id ? carMap.get(r.carrier_id) ?? null : null,
                driver: r.driver_id ? drvMap.get(r.driver_id) ?? null : null,
                vehicle: r.vehicle_id ? vehMap.get(r.vehicle_id) ?? null : null,
              });
            }
            rows = (rows as { id: string }[]).map((r) => {
              const rid = orderToRouteId.get(r.id);
              return { ...r, route: rid ? routeMap.get(rid) ?? null : null };
            });
          } else {
            rows = (rows as { id: string }[]).map((r) => ({ ...r, route: null }));
          }
        }

        return jsonResponse(rows, {
          headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? rows.length) },
        });
        } catch (e) {
          console.error("/api/orders GET unhandled:", e);
          return jsonResponse([], { headers: { "X-Total-Count": "0", "X-Error": "unhandled" } });
        }
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
