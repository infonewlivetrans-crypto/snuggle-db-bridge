import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  requireAuth,
} from "@/server/api-helpers.server";

// GET /api/workspace/summary?role=driver|manager|logist|director&date=YYYY-MM-DD
// Возвращает агрегированные показатели для конкретной роли.
export const Route = createFileRoute("/api/workspace/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const role = url.searchParams.get("role") ?? "manager";
        const date =
          url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
        const sb = auth.client;

        if (role === "driver") {
          const { data: routes } = await sb
            .from("delivery_routes")
            .select(
              "id, route_number, route_date, status, assigned_driver, assigned_vehicle",
            )
            .in("status", ["issued", "in_progress"])
            .order("route_date", { ascending: false })
            .limit(20);
          const list = (routes ?? []) as Array<{
            id: string;
            route_number: string;
            route_date: string;
            status: string;
            assigned_driver: string | null;
            assigned_vehicle: string | null;
          }>;
          const active = list.find((r) => r.status === "in_progress") ?? null;
          let pendingPoints = 0;
          if (active) {
            const { count } = await sb
              .from("route_points")
              .select("id", { count: "exact", head: true })
              .eq("route_id", active.id)
              .eq("dp_status", "waiting");
            pendingPoints = count ?? 0;
          }
          return jsonResponse(
            { list, active, pendingPoints },
            { headers: cacheHeaders(15) },
          );
        }

        if (role === "manager") {
          const [notif, qrOrders, routePoints] = await Promise.all([
            sb
              .from("notifications")
              .select("id, kind", { count: "exact" })
              .eq("is_read", false)
              .limit(200),
            sb
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("requires_qr", true),
            sb
              .from("route_points")
              .select(
                "id, dp_amount_received, order:orders(amount_due, payment_type)",
              )
              .eq("dp_status", "delivered")
              .limit(200),
          ]);
          const notifications = (notif.data ?? []) as Array<{ kind: string }>;
          const newNotifs = notifications.length;
          const returns = notifications.filter(
            (n) => n.kind === "return_to_warehouse",
          ).length;
          let mismatch = 0;
          for (const p of (routePoints.data ?? []) as Array<{
            dp_amount_received: number | null;
            order: { amount_due: number | null; payment_type: string | null } | null;
          }>) {
            const due = Number(p.order?.amount_due ?? 0);
            const recv = Number(p.dp_amount_received ?? 0);
            const ptype = p.order?.payment_type;
            if (ptype === "cash" && Math.abs(due - recv) > 0.01) mismatch += 1;
          }
          return jsonResponse(
            {
              newNotifs,
              qrOrders: qrOrders.count ?? 0,
              mismatch,
              returns,
              problems: 0,
            },
            { headers: cacheHeaders(30) },
          );
        }

        if (role === "logist") {
          const [routesToday, inProgress, completed] = await Promise.all([
            sb
              .from("delivery_routes")
              .select("id", { count: "exact", head: true })
              .eq("route_date", date),
            sb
              .from("delivery_routes")
              .select("id", { count: "exact", head: true })
              .eq("status", "in_progress"),
            sb
              .from("delivery_routes")
              .select("id", { count: "exact", head: true })
              .eq("status", "completed")
              .eq("route_date", date),
          ]);
          return jsonResponse(
            {
              today: routesToday.count ?? 0,
              inProgress: inProgress.count ?? 0,
              completed: completed.count ?? 0,
              problems: 0,
            },
            { headers: cacheHeaders(30) },
          );
        }

        if (role === "director") {
          const since = new Date();
          since.setDate(since.getDate() - 30);
          const sinceStr = since.toISOString().slice(0, 10);
          const { data: points } = await sb
            .from("route_points")
            .select(
              "dp_status, dp_amount_received, order:orders(amount_due, payment_type), route:delivery_routes!inner(route_date)",
            )
            .gte("route.route_date", sinceStr)
            .limit(5000);
          let due = 0;
          let recv = 0;
          let returns = 0;
          let problems = 0;
          for (const p of (points ?? []) as Array<{
            dp_status: string | null;
            dp_amount_received: number | null;
            order: { amount_due: number | null; payment_type: string | null } | null;
          }>) {
            const ptype = p.order?.payment_type;
            const d = Number(p.order?.amount_due ?? 0);
            const r = Number(p.dp_amount_received ?? 0);
            if (p.dp_status === "delivered") {
              due += d;
              if (ptype === "cash") recv += r;
            }
            if (p.dp_status === "returned_to_warehouse") returns += 1;
            if (p.dp_status === "not_delivered") problems += 1;
          }
          return jsonResponse(
            { due, recv, returns, problems },
            { headers: cacheHeaders(120) },
          );
        }

        return jsonResponse({ error: "unknown role" }, { status: 400 });
      },
    },
  },
});
