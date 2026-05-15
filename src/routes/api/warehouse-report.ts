import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

function dayBoundaries(date: string) {
  const start = new Date(date + "T00:00:00");
  const end = new Date(date + "T23:59:59.999");
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export const Route = createFileRoute("/api/warehouse-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const date = url.searchParams.get("date");
        if (!date) return jsonResponse({ error: "date required" }, { status: 400 });
        const { fromIso, toIso } = dayBoundaries(date);

        const [dockRes, retRes, inboundRes] = await Promise.all([
          auth.client.from("warehouse_dock_events").select("*").eq("event_date", date),
          auth.client
            .from("route_points")
            .select(
              "id, route_id, order_id, wh_return_status, wh_return_arrived_at, wh_return_accepted_at, wh_return_accepted_by, wh_return_status_changed_by, wh_return_status_changed_at, wh_return_comment, dp_return_warehouse_id",
            )
            .or(
              `and(wh_return_arrived_at.gte.${fromIso},wh_return_arrived_at.lte.${toIso}),and(wh_return_accepted_at.gte.${fromIso},wh_return_accepted_at.lte.${toIso})`,
            ),
          auth.client
            .from("inbound_shipments")
            .select("*")
            .or(
              `and(arrived_at.gte.${fromIso},arrived_at.lte.${toIso}),and(accepted_at.gte.${fromIso},accepted_at.lte.${toIso}),and(expected_at.gte.${fromIso},expected_at.lte.${toIso})`,
            ),
        ]);

        if (dockRes.error)
          return jsonResponse({ error: dockRes.error.message }, { status: 500 });
        if (retRes.error)
          return jsonResponse({ error: retRes.error.message }, { status: 500 });
        if (inboundRes.error)
          return jsonResponse({ error: inboundRes.error.message }, { status: 500 });

        const orderIds = Array.from(
          new Set(
            (retRes.data ?? [])
              .map((p: { order_id: string | null }) => p.order_id)
              .filter(Boolean) as string[],
          ),
        );
        const ordersRes = orderIds.length
          ? await auth.client.from("orders").select("id, order_number").in("id", orderIds)
          : { data: [] as { id: string; order_number: string }[], error: null };

        return jsonResponse(
          {
            dockEvents: dockRes.data ?? [],
            returnPoints: retRes.data ?? [],
            inbounds: inboundRes.data ?? [],
            returnOrders: ordersRes.data ?? [],
          },
          { headers: cacheHeaders(15) },
        );
      },
    },
  },
});
