import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

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

        let q = auth.client
          .from("routes")
          .select("*, route_points(eta_at, eta_risk)", { count: "exact" })
          .order("route_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (activeOnly) q = q.in("status", ["planned", "in_progress"]);
        else if (status && status !== "all") q = q.eq("status", status as never);
        if (search) q = q.ilike("route_number", `%${search}%`);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        const rows = Array.isArray(data) ? data : [];
        return jsonResponse(rows, {
          headers: { ...cacheHeaders(60), "X-Total-Count": String(count ?? rows.length) },
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
