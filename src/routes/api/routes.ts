import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

function stripBrokenEmbeds(fields: string): { fields: string; wantsRoutePoints: boolean } {
  const wantsRoutePoints = /(?:^|,)\s*route_points\s*\(/.test(fields);
  const clean = fields
    .replace(/,\s*destination\s*:\s*destination_warehouse_id\s*\([^)]*\)/g, "")
    .replace(/\s*,?\s*route_points\s*\([^)]*\)/g, "")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .trim();
  return { fields: clean || "*", wantsRoutePoints };
}

function ensureColumn(fields: string, column: string): string {
  if (fields === "*" || new RegExp(`(^|[,\\s])${column}([,\\s]|$)`).test(fields)) return fields;
  return `${fields}, ${column}`;
}

const CreateRouteSchema = z.object({
  route_number: z.string().min(1).max(64).optional(),
  route_date: z.string().min(1).max(32),
  driver_name: z.string().max(255).nullable().optional(),
  driver_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  destination_warehouse_id: z.string().uuid().nullable().optional(),
  request_type: z.string().max(32).optional(),
  required_body_type: z.string().max(32).nullable().optional(),
  required_capacity_kg: z.number().nullable().optional(),
  required_volume_m3: z.number().nullable().optional(),
  planned_departure_at: z.string().nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  status: z.string().max(32).optional(),
  total_weight_kg: z.number().optional(),
  total_volume_m3: z.number().optional(),
  points_count: z.number().optional(),
  /** Сгенерировать route_number на сервере, если route_number не задан. */
  generate_number: z.boolean().optional(),
});

export const Route = createFileRoute("/api/routes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, search, url } = parseListParams(request);
        const status = url.searchParams.get("status");
        const activeOnly = url.searchParams.get("activeOnly") === "1";
        const idsParam = url.searchParams.get("ids");
        const routeDate = url.searchParams.get("route_date");
        const rawFields = url.searchParams.get("fields") || "*";
        // У routes/route_points и routes.destination_warehouse_id нет FK →
        // embedded select валится PGRST200. Читаем routes отдельно и
        // дозаполняем зависимые данные отдельными запросами.
        const parsedFields = stripBrokenEmbeds(rawFields);
        const wantsRoutePoints = parsedFields.wantsRoutePoints || !url.searchParams.has("fields");
        let ensured = ensureColumn(parsedFields.fields, "destination_warehouse_id");
        if (wantsRoutePoints) ensured = ensureColumn(ensured, "id");

        let q = auth.client
          .from("routes")
          .select(ensured, { count: "exact" })
          .order("route_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (idsParam) {
          const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
          if (ids.length === 0) return jsonResponse([], { headers: { "X-Total-Count": "0" } });
          q = q.in("id", ids);
        }
        if (routeDate) q = q.eq("route_date", routeDate);
        if (activeOnly) q = q.in("status", ["planned", "in_progress"]);
        else if (status && status !== "all") q = q.eq("status", status as never);
        if (search) q = q.ilike("route_number", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        const rows = (Array.isArray(data) ? (data as unknown as Array<Record<string, unknown>>) : []);
        const routeIds = rows
          .map((r) => r.id)
          .filter((v): v is string => typeof v === "string" && v.length > 0);
        const destIds = Array.from(
          new Set(
            rows
              .map((r) => r.destination_warehouse_id)
              .filter((v): v is string => typeof v === "string" && v.length > 0),
          ),
        );
        const [destRes, pointsRes] = await Promise.all([
          destIds.length > 0
            ? auth.client.from("warehouses").select("id, name, city").in("id", destIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; city: string | null }> }),
          wantsRoutePoints && routeIds.length > 0
            ? auth.client.from("route_points").select("route_id, eta_at, eta_risk").in("route_id", routeIds)
            : Promise.resolve({ data: [] as Array<{ route_id: string; eta_at: string | null; eta_risk: string | null }> }),
        ]);
        const destMap = new Map<string, { name: string | null; city: string | null }>();
        for (const w of (destRes.data ?? []) as Array<{ id: string; name: string | null; city: string | null }>) {
          destMap.set(w.id, { name: w.name, city: w.city });
        }
        const pointsMap = new Map<string, Array<{ eta_at: string | null; eta_risk: string | null }>>();
        for (const p of (pointsRes.data ?? []) as Array<{ route_id: string; eta_at: string | null; eta_risk: string | null }>) {
          const arr = pointsMap.get(p.route_id) ?? [];
          arr.push({ eta_at: p.eta_at, eta_risk: p.eta_risk });
          pointsMap.set(p.route_id, arr);
        }
        const enriched = rows.map((r) => ({
          ...r,
          destination:
            typeof r.destination_warehouse_id === "string"
              ? destMap.get(r.destination_warehouse_id) ?? null
              : null,
          ...(wantsRoutePoints && typeof r.id === "string" ? { route_points: pointsMap.get(r.id) ?? [] } : {}),
        }));
        return jsonResponse(enriched, {
          headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? enriched.length) },
        });
      },

      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = CreateRouteSchema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { generate_number, ...payload } = parsed.data;

        let routeNumber = payload.route_number;
        if (!routeNumber || generate_number) {
          const { data: num, error: numErr } = await auth.client.rpc("generate_route_number");
          if (numErr) return jsonResponse({ error: numErr.message }, { status: 500 });
          routeNumber = num as string;
        }

        const insertData = { ...payload, route_number: routeNumber } as Record<string, unknown>;
        const { data, error } = await auth.client
          .from("routes")
          .insert(insertData as never)
          .select("id, route_number")
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
    },
  },
});
