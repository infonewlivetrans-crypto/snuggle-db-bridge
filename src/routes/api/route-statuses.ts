import {
  createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  requireAuth,
} from "@/server/api-helpers.server";

/**
 * Лёгкий endpoint статуса конкретного маршрута — без перезагрузки списка.
 */
export const Route = createFileRoute("/api/route-statuses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        if (!routeId)
          return jsonResponse({ error: "route_id required" }, { status: 400 });

        const { data, error } = await auth.client
          .from("routes")
          .select("id, status, updated_at")
          .eq("id", routeId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { route: data ?? null },
          { headers: cacheHeaders(30) },
        );
      },
    },
  },
});
