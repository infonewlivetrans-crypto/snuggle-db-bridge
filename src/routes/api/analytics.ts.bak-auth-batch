import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  requireUser,
} from "@/server/api-helpers.server";

/**
 * Сводная аналитика: количество заказов / маршрутов / точек по статусам.
 * Грузится только при открытии раздела «Отчёты», кеш 2 минуты.
 */
export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        const range = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
          q: T,
          col = "created_at",
        ): T => {
          let qq = q;
          if (from) qq = qq.gte(col, from);
          if (to) qq = qq.lte(col, to);
          return qq;
        };

        try {
          const [ordersRes, routesRes, pointsRes] = await Promise.all([
            range(
              auth.client.from("orders").select("status", { count: "exact" }),
            ),
            range(
              auth.client.from("routes").select("status", { count: "exact" }),
            ),
            range(
              auth.client
                .from("route_points")
                .select("status", { count: "exact" }),
            ),
          ]);

          const groupBy = (rows: { status: string | null }[] | null) => {
            const m: Record<string, number> = {};
            for (const r of rows ?? []) {
              const k = r.status ?? "unknown";
              m[k] = (m[k] ?? 0) + 1;
            }
            return m;
          };

          return jsonResponse(
            {
              orders: { total: ordersRes.count ?? 0, by_status: groupBy(ordersRes.data) },
              routes: { total: routesRes.count ?? 0, by_status: groupBy(routesRes.data) },
              points: { total: pointsRes.count ?? 0, by_status: groupBy(pointsRes.data) },
            },
            { headers: cacheHeaders(120) },
          );
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
