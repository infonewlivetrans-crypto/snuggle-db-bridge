import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  nearestNeighbourWithTimeWindows,
  applyRoutePointsOrder,
  type TwOptimizePoint,
} from "@/server/route-optimize.server";

export const Route = createFileRoute("/api/routes/$id/optimize")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["admin", "logist", "manager"]);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const routeId = params.id;

        const { data: route, error: rErr } = await sb
          .from("routes")
          .select(
            "id, route_date, planned_departure_at, warehouse_id, avg_speed_kmh, default_service_minutes",
          )
          .eq("id", routeId)
          .maybeSingle();
        if (rErr) return jsonResponse({ error: rErr.message }, { status: 500 });
        if (!route) return jsonResponse({ error: "not_found" }, { status: 404 });

        const r = route as {
          id: string;
          route_date: string | null;
          planned_departure_at: string | null;
          warehouse_id: string | null;
          avg_speed_kmh: number | null;
          default_service_minutes: number | null;
        };

        const { data: ptsRaw, error: pErr } = await sb
          .from("route_points")
          .select(
            "id, point_number, client_window_from, client_window_to, service_minutes, order:order_id(latitude, longitude)",
          )
          .eq("route_id", routeId)
          .order("point_number", { ascending: true });
        if (pErr) return jsonResponse({ error: pErr.message }, { status: 500 });

        const rows = (ptsRaw ?? []) as unknown as Array<{
          id: string;
          client_window_from: string | null;
          client_window_to: string | null;
          service_minutes: number | null;
          order: { latitude: number | null; longitude: number | null } | null;
        }>;

        if (rows.length === 0) {
          return jsonResponse({
            success: true,
            optimizedCount: 0,
            skippedNoCoords: 0,
            warnings: [],
          });
        }

        const defaultService = Number(r.default_service_minutes ?? 15);
        const points: TwOptimizePoint[] = rows.map((row) => ({
          id: row.id,
          lat: row.order?.latitude ?? null,
          lng: row.order?.longitude ?? null,
          windowFromMs: row.client_window_from ? Date.parse(row.client_window_from) : null,
          windowToMs: row.client_window_to ? Date.parse(row.client_window_to) : null,
          serviceMinutes: Number(row.service_minutes ?? defaultService),
        }));

        // Стартовая точка — координаты склада, если есть.
        let start: { lat: number; lng: number } | null = null;
        if (r.warehouse_id) {
          const { data: wh } = await sb
            .from("warehouses")
            .select("latitude, longitude")
            .eq("id", r.warehouse_id)
            .maybeSingle();
          const w = wh as { latitude: number | null; longitude: number | null } | null;
          if (w && typeof w.latitude === "number" && typeof w.longitude === "number") {
            start = { lat: w.latitude, lng: w.longitude };
          }
        }

        // Начальное время отправления.
        let startTimeMs: number;
        if (r.planned_departure_at) {
          startTimeMs = Date.parse(r.planned_departure_at);
        } else if (r.route_date) {
          startTimeMs = Date.parse(`${r.route_date}T09:00:00`);
        } else {
          startTimeMs = Date.now();
        }
        if (!Number.isFinite(startTimeMs)) startTimeMs = Date.now();

        const result = nearestNeighbourWithTimeWindows({
          points,
          start,
          startTimeMs,
          avgSpeedKmh: Number(r.avg_speed_kmh ?? 40),
          defaultServiceMinutes: defaultService,
        });

        await applyRoutePointsOrder(sb, result.ordered);

        // Отметим в routes, что порядок был изменён.
        try {
          const { data: prof } = await sb
            .from("profiles")
            .select("full_name")
            .eq("user_id", auth.userId)
            .maybeSingle();
          const who =
            (prof as { full_name?: string | null } | null)?.full_name ?? "Оптимизация";
          await sb
            .from("routes")
            .update({
              points_order_changed_at: new Date().toISOString(),
              points_order_changed_by: who,
            } as never)
            .eq("id", routeId);
        } catch {
          // best-effort
        }

        const warnings = [...result.warnings];
        if (result.skippedNoCoords > 0) {
          warnings.unshift(
            `${result.skippedNoCoords} точек без координат — оставлены в конце`,
          );
        }

        return jsonResponse({
          success: true,
          optimizedCount: result.ordered.length - result.skippedNoCoords,
          skippedNoCoords: result.skippedNoCoords,
          warnings,
        });
      },
    },
  },
});
