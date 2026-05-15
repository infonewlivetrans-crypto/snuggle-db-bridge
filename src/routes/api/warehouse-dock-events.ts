import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/warehouse-dock-events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const date = url.searchParams.get("event_date");
        const routeIdsParam = url.searchParams.get("delivery_route_ids");
        const routeId = url.searchParams.get("delivery_route_id");

        let q = (auth.client as never as { from: (t: string) => any }).from("warehouse_dock_events").select("*");
        if (date) q = q.eq("event_date", date);
        if (routeId) q = q.eq("delivery_route_id", routeId);
        if (routeIdsParam) {
          const ids = routeIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
          if (ids.length > 0) q = q.in("delivery_route_id", ids);
        }
        q = q.order("created_at", { ascending: true });
        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? [], { headers: cacheHeaders(10) });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) return jsonResponse({ error: "bad_body" }, { status: 400 });
        const { data, error } = await (auth.client as never as { from: (t: string) => any })
          .from("warehouse_dock_events")
          .insert(body)
          .select("*")
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 400 });
        return jsonResponse({ row: data });
      },
    },
  },
});
