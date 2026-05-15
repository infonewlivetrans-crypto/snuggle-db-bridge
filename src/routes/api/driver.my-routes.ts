import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/driver/my-routes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ["admin", "driver"]);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        const { data: driverRow } = await sb
          .from("drivers")
          .select("id")
          .eq("user_id", auth.userId)
          .maybeSingle();

        const driverId = (driverRow as { id: string } | null)?.id ?? null;
        if (!driverId) return jsonResponse({ rows: [], pointsCounts: {} });

        const { data: rows, error } = await sb
          .from("delivery_routes")
          .select(
            "id, route_number, route_date, status, assigned_driver, assigned_vehicle, source_request_id",
          )
          .eq("driver_id", driverId)
          .in("status", ["issued", "in_progress", "completed"])
          .order("route_date", { ascending: false })
          .limit(100);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const routes = (rows ?? []) as Array<{ source_request_id: string }>;
        const ids = routes.map((r) => r.source_request_id);
        const pointsCounts: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: pts } = await sb
            .from("route_points")
            .select("route_id")
            .in("route_id", ids);
          for (const r of (pts ?? []) as Array<{ route_id: string }>) {
            pointsCounts[r.route_id] = (pointsCounts[r.route_id] ?? 0) + 1;
          }
        }
        return jsonResponse({ rows: routes, pointsCounts });
      },
    },
  },
});
