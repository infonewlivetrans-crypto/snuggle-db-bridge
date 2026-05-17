import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";
import { geocodeAddress } from "@/server/yandex.server";

export const Route = createFileRoute("/api/geo/geocode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const address = (url.searchParams.get("address") ?? "").trim();
        if (!address || address.length > 500) {
          return jsonResponse({ error: "address required (1..500)" }, { status: 400 });
        }
        try {
          const row = await geocodeAddress(address);
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
            { error: e instanceof Error ? e.message : "geocode_failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
