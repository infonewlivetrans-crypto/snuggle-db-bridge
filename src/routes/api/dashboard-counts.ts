import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

/**
 * Сводные счётчики для экранов "Первый запуск" и "Пилотный запуск".
 * Возвращает только агрегаты — никаких PII.
 *
 * GET /api/dashboard-counts?include=routes,driverLink,photos,qr,cash,managerReport,completedRoutes,returns,notifications,issues,testRoutes
 */
export const Route = createFileRoute("/api/dashboard-counts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        const url = new URL(request.url);
        const includeParam = (url.searchParams.get("include") ?? "all").toLowerCase();
        const want = (key: string) =>
          includeParam === "all" || includeParam.split(",").map((s) => s.trim()).includes(key);

        const counts: Record<string, number> = {};

        async function count(
          table: string,
          builder?: (q: ReturnType<typeof sb.from> extends infer T ? T : never) => unknown,
        ): Promise<number> {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = sb.from(table as never).select("id", { count: "exact", head: true });
          if (builder) q = builder(q);
          const { count: c } = await q;
          return c ?? 0;
        }

        const tasks: Array<Promise<void>> = [];
        if (want("routes")) tasks.push(count("delivery_routes").then((n) => { counts.routes = n; }));
        if (want("driverLink"))
          tasks.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            count("delivery_routes", (q: any) => q.not("driver_access_token", "is", null)).then((n) => {
              counts.driverLink = n;
            }),
          );
        if (want("photos")) tasks.push(count("route_point_photos").then((n) => { counts.photos = n; }));
        if (want("qr"))
          tasks.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            count("route_point_photos", (q: any) => q.eq("kind", "qr")).then((n) => { counts.qr = n; }),
          );
        if (want("cash"))
          tasks.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            count("route_points", (q: any) => q.gt("dp_amount_received", 0)).then((n) => {
              counts.cash = n;
            }),
          );
        if (want("managerReport"))
          tasks.push(count("delivery_reports").then((n) => { counts.managerReport = n; }));
        if (want("completedRoutes"))
          tasks.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            count("delivery_routes", (q: any) => q.eq("status", "completed")).then((n) => {
              counts.completedRoutes = n;
            }),
          );
        if (want("returns"))
          tasks.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            count("route_points", (q: any) => q.eq("status", "returned_to_warehouse")).then((n) => {
              counts.returns = n;
            }),
          );
        if (want("notifications"))
          tasks.push(count("notifications").then((n) => { counts.notifications = n; }));

        await Promise.all(tasks);

        return jsonResponse({ counts }, { headers: cacheHeaders(10) });
      },
    },
  },
});
