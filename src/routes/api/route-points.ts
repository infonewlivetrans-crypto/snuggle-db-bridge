import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

const PointInsert = z.object({
  route_id: z.string().uuid(),
  order_id: z.string().uuid(),
  point_number: z.number().int().min(0),
  status: z.string().max(32).optional(),
});

const BulkInsertSchema = z.object({
  points: z.array(PointInsert).min(1).max(1000),
});

export const Route = createFileRoute("/api/route-points")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        const withOrders = url.searchParams.get("withOrders") === "1";
        const embed = url.searchParams.get("embed");
        if (!routeId) return jsonResponse([], { status: 400, headers: { "X-Error": "route_id required" } });
        const select =
          embed === "delivery"
            ? "id, point_number, order_id, client_window_from, client_window_to, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_amount_received, dp_payment_comment, dp_planned_arrival_at, dp_actual_arrival_at, dp_unload_started_at, dp_unload_finished_at, dp_finished_at, dp_idle_started_at, dp_idle_finished_at, dp_idle_duration_minutes, dp_idle_reason, dp_idle_comment, order:order_id(id, order_number, contact_name, contact_phone, delivery_address, latitude, longitude, comment, payment_type, amount_due, requires_qr, marketplace, cash_received, qr_received)"
            : withOrders
              ? "*, orders(*)"
              : "*";
        const { data, error } = await auth.client
          .from("route_points")
          .select(select)
          .eq("route_id", routeId)
          .order("point_number", { ascending: true });
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? [], { headers: cacheHeaders(20) });
      },

      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = BulkInsertSchema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const { error } = await auth.client.from("route_points").insert(parsed.data.points as never);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
