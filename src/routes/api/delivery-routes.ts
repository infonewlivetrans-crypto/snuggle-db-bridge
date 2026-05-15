import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAuth,
} from "@/server/api-helpers.server";

const Schema = z.object({
  route_number: z.string().min(1).max(64),
  route_date: z.string().min(1).max(32),
  assigned_driver: z.string().max(255).nullable().optional(),
  assigned_vehicle: z.string().max(255).nullable().optional(),
  source_request_id: z.string().uuid(),
  status: z.string().max(32).optional(),
  comment: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute("/api/delivery-routes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const { limit, offset, url } = parseListParams(request);
        const fields =
          url.searchParams.get("fields") || "*";
        const dateFrom = url.searchParams.get("route_date_gte");
        const dateTo = url.searchParams.get("route_date_lte");
        const status = url.searchParams.get("status");
        const carrierId = url.searchParams.get("carrier_id");
        const order = url.searchParams.get("order") ?? "route_date.desc";
        const [orderCol, orderDirRaw] = order.split(".");
        const ascending = (orderDirRaw ?? "desc").toLowerCase() !== "desc";

        let q = auth.client
          .from("delivery_routes")
          .select(fields, { count: "exact" });
        if (dateFrom) q = q.gte("route_date", dateFrom);
        if (dateTo) q = q.lte("route_date", dateTo);
        if (status) q = q.eq("status", status as never);
        if (carrierId) q = q.eq("carrier_id", carrierId);
        q = q.order(orderCol || "route_date", { ascending });

        // Большой limit для списков-фильтраций (страницы директора и т.п.)
        const useLimit = Math.min(Math.max(limit, 1), 500);
        const { data, error, count } = await q.range(offset, offset + useLimit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
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
