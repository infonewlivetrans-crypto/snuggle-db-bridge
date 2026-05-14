import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/delivery-routes/$id/driver-geo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { data, error } = await auth.client
          .from("delivery_routes")
          .select("last_driver_lat, last_driver_lng, last_driver_location_at")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? null, { headers: cacheHeaders(10) });
      },
    },
  },
});
