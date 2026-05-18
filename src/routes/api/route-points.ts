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
        const routeIdsParam = url.searchParams.get("route_ids") ?? null;
        const orderIdInParam = url.searchParams.get("order_id_in");
        const statusIn = url.searchParams.get("status_in");
        const dpStatus = url.searchParams.get("dp_status");
        const orFilter = url.searchParams.get("or");
        const returnsOnly = url.searchParams.get("returns_only") === "1";
        const createdToday = url.searchParams.get("created_today") === "1";
        const fieldsParam = url.searchParams.get("fields");
        const withOrders = url.searchParams.get("withOrders") === "1";
        const embed = url.searchParams.get("embed");

        // route_id может быть csv (in-фильтр)
        const idsList: string[] = (() => {
          const raw = routeIdsParam ?? routeId ?? "";
          return raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        })();
        const orderIds: string[] = (orderIdInParam ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        // Допускаем запрос без route_id, если есть order_id_in / created_today
        if (idsList.length === 0 && orderIds.length === 0 && !createdToday)
          return jsonResponse([], { status: 400, headers: { "X-Error": "route_id or order_id_in or created_today required" } });

        const select =
          fieldsParam && fieldsParam.trim().length > 0
            ? fieldsParam
            : embed === "delivery"
              ? "id, point_number, order_id, client_window_from, client_window_to, dp_status, dp_undelivered_reason, dp_return_warehouse_id, dp_return_comment, dp_expected_return_at, dp_amount_received, dp_payment_comment, dp_planned_arrival_at, dp_actual_arrival_at, dp_unload_started_at, dp_unload_finished_at, dp_finished_at, dp_idle_started_at, dp_idle_finished_at, dp_idle_duration_minutes, dp_idle_reason, dp_idle_comment, order:order_id(id, order_number, contact_name, contact_phone, delivery_address, latitude, longitude, comment, payment_type, amount_due, requires_qr, marketplace, cash_received, qr_received)"
              : withOrders
                ? "*, orders(*)"
                : "*";

        let q = auth.client.from("route_points").select(select);
        if (idsList.length === 1) q = q.eq("route_id", idsList[0]!);
        else if (idsList.length > 1) q = q.in("route_id", idsList);
        if (orderIds.length > 0) q = q.in("order_id", orderIds);
        if (statusIn) {
          const arr = statusIn.split(",").map((s) => s.trim()).filter(Boolean);
          if (arr.length > 0) q = q.in("status", arr as never);
        }
        if (dpStatus) q = q.eq("dp_status", dpStatus as never);
        if (orFilter) q = q.or(orFilter);
        if (returnsOnly)
          q = q.or("status.eq.returned_to_warehouse,dp_status.eq.return_to_warehouse");
        if (createdToday) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          q = q.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
        }
        q = q.order("point_number", { ascending: true }).limit(2000);
        const { data, error } = await q;
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

      DELETE: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        const orderId = url.searchParams.get("order_id");
        if (!routeId || !orderId)
          return jsonResponse({ error: "route_id и order_id обязательны" }, { status: 400 });
        const { error } = await auth.client
          .from("route_points")
          .delete()
          .eq("route_id", routeId)
          .eq("order_id", orderId);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
