import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";

/**
 * GET /api/delivery-routes/:id/driver-geo
 *
 * Возвращает последнюю геопозицию водителя по delivery_route.
 * Должен отвечать БЫСТРО:
 *  - читает только три колонки delivery_routes;
 *  - никаких внешних запросов;
 *  - если координат нет — 200 со значениями null;
 *  - на ошибке БД логируем и тоже возвращаем 200 с null,
 *    чтобы фронт не уходил в бесконечный retry / не ловил 504.
 */
export const Route = createFileRoute("/api/delivery-routes/$id/driver-geo")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const empty = {
          last_driver_lat: null as number | null,
          last_driver_lng: null as number | null,
          last_driver_location_at: null as string | null,
          geo: null as null | {
            lat: number;
            lng: number;
            at: string | null;
          },
        };

        try {
          const { data, error } = await auth.client
            .from("delivery_routes")
            .select("last_driver_lat, last_driver_lng, last_driver_location_at")
            .eq("id", params.id)
            .maybeSingle();
          if (error) {
            console.error("[/api/delivery-routes/:id/driver-geo] db error:", error.message);
            return jsonResponse(empty, { status: 200 });
          }
          const row =
            (data as {
              last_driver_lat: number | null;
              last_driver_lng: number | null;
              last_driver_location_at: string | null;
            } | null) ?? null;
          const lat = row?.last_driver_lat ?? null;
          const lng = row?.last_driver_lng ?? null;
          const at = row?.last_driver_location_at ?? null;
          return jsonResponse(
            {
              last_driver_lat: lat,
              last_driver_lng: lng,
              last_driver_location_at: at,
              geo:
                typeof lat === "number" && typeof lng === "number"
                  ? { lat, lng, at }
                  : null,
            },
            { headers: cacheHeaders(10) },
          );
        } catch (e) {
          console.error(
            "[/api/delivery-routes/:id/driver-geo] unexpected error:",
            e instanceof Error ? e.message : String(e),
          );
          return jsonResponse(empty, { status: 200 });
        }
      },
    },
  },
});
