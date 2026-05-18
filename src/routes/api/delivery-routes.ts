import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

const Schema = z.object({
  route_number: z.string().max(64).optional(),
  route_date: z.string().min(1).max(32),
  assigned_driver: z.string().max(255).nullable().optional(),
  assigned_vehicle: z.string().max(255).nullable().optional(),
  driver_id: z.string().uuid().nullable().optional(),
  carrier_id: z.string().uuid().nullable().optional(),
  source_request_id: z.string().uuid(),
  source_warehouse_id: z.string().uuid().nullable().optional(),
  status: z.string().max(32).optional(),
  comment: z.string().max(2000).nullable().optional(),
});

/**
 * У `delivery_routes.source_request_id` и `source_warehouse_id` нет FK в БД,
 * поэтому PostgREST embedded select (`source_request:source_request_id(...)`,
 * `source_warehouse:source_warehouse_id(...)`) валится с PGRST200 → 500.
 * Срезаем такие embed'ы из клиентского `fields=` и дозаполняем сервером.
 */
const EMBED_RE =
  /,\s*(?:source_request|source_warehouse)\s*:\s*(?:source_request_id|source_warehouse_id)\s*\([^)]*\)/g;

function stripBrokenEmbeds(fields: string): string {
  return fields.replace(EMBED_RE, "");
}

export const Route = createFileRoute("/api/delivery-routes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, url } = parseListParams(request);
        const rawFields = url.searchParams.get("fields") || "*";
        const fields = stripBrokenEmbeds(rawFields);
        // Гарантируем наличие FK-колонок для последующего join'а.
        const ensured = `${fields}, source_request_id, source_warehouse_id`;
        const dateFrom = url.searchParams.get("route_date_gte");
        const dateTo = url.searchParams.get("route_date_lte");
        const routeDate = url.searchParams.get("route_date");
        const status = url.searchParams.get("status");
        const carrierId = url.searchParams.get("carrier_id");
        const order = url.searchParams.get("order") ?? "route_date.desc";
        const [orderCol, orderDirRaw] = order.split(".");
        const ascending = (orderDirRaw ?? "desc").toLowerCase() !== "desc";

        let q = auth.client
          .from("delivery_routes")
          .select(ensured, { count: "exact" });
        if (routeDate) q = q.eq("route_date", routeDate);
        if (dateFrom) q = q.gte("route_date", dateFrom);
        if (dateTo) q = q.lte("route_date", dateTo);
        if (status) {
          const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
          if (statuses.length > 1) q = q.in("status", statuses as never[]);
          else if (statuses.length === 1) q = q.eq("status", statuses[0] as never);
        }
        if (carrierId) q = q.eq("carrier_id", carrierId);
        q = q.order(orderCol || "route_date", { ascending });

        const useLimit = Math.min(Math.max(limit, 1), 500);
        const { data, error, count } = await q.range(offset, offset + useLimit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const rows = ((data ?? []) as unknown) as Array<Record<string, unknown>>;
        // Сбор distinct id для дозаполнения.
        const reqIds = Array.from(
          new Set(
            rows
              .map((r) => r.source_request_id)
              .filter((v): v is string => typeof v === "string" && v.length > 0),
          ),
        );
        const whIds = Array.from(
          new Set(
            rows
              .map((r) => r.source_warehouse_id)
              .filter((v): v is string => typeof v === "string" && v.length > 0),
          ),
        );

        const [reqRes, whRes] = await Promise.all([
          reqIds.length > 0
            ? auth.client.from("routes").select("id, route_number").in("id", reqIds)
            : Promise.resolve({ data: [] as Array<{ id: string; route_number: string | null }> }),
          whIds.length > 0
            ? auth.client.from("warehouses").select("id, name, city").in("id", whIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; city: string | null }> }),
        ]);

        const reqMap = new Map<string, { route_number: string | null }>();
        for (const r of (reqRes.data ?? []) as Array<{ id: string; route_number: string | null }>) {
          reqMap.set(r.id, { route_number: r.route_number });
        }
        const whMap = new Map<string, { name: string | null; city: string | null }>();
        for (const w of (whRes.data ?? []) as Array<{ id: string; name: string | null; city: string | null }>) {
          whMap.set(w.id, { name: w.name, city: w.city });
        }

        const enriched = rows.map((r) => ({
          ...r,
          source_request:
            typeof r.source_request_id === "string" ? reqMap.get(r.source_request_id) ?? null : null,
          source_warehouse:
            typeof r.source_warehouse_id === "string" ? whMap.get(r.source_warehouse_id) ?? null : null,
        }));

        return jsonResponse(
          { rows: enriched, total: count ?? 0 },
          { headers: cacheHeaders(20) },
        );
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { data, error } = await auth.client
          .from("delivery_routes")
          .insert(parsed.data as never)
          .select("id")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
    },
  },
});
