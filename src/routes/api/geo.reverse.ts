import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";
import { reverseGeocode } from "@/server/yandex.server";

export const Route = createFileRoute("/api/geo/reverse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const lat = Number(url.searchParams.get("lat"));
        const lng = Number(url.searchParams.get("lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return jsonResponse({ error: "valid lat/lng required" }, { status: 400 });
        }
        try {
          const row = await reverseGeocode(auth.client, { lat, lng });
          return jsonResponse(
            {
              lat: row.lat,
              lng: row.lng,
              formatted_address: row.formatted_address,
            },
            { headers: cacheHeaders(3600) },
          );
        } catch (e) {
          return jsonResponse(
            { error: e instanceof Error ? e.message : "reverse_failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
