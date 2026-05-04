import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/route-point-photos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const ids = (url.searchParams.get("point_ids") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length === 0) return jsonResponse([], { headers: cacheHeaders(10) });
        const { data, error } = await auth.client
          .from("route_point_photos")
          .select("route_point_id, kind")
          .in("route_point_id", ids);
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        return jsonResponse(data ?? [], { headers: cacheHeaders(10) });
      },
    },
  },
});
