import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  requireUser,
} from "@/server/api-helpers.server";

/**
 * Финансовая сводка по маршруту (хранится в таблице routes — поля
 * carrier_payment_*, payout_*). Возвращаем урезанный набор, а не всю строку.
 */
export const Route = createFileRoute("/api/payments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const routeId = url.searchParams.get("route_id");
        if (!routeId)
          return jsonResponse({ error: "route_id required" }, { status: 400 });

        const { data, error } = await auth.client
          .from("routes")
          .select("*")
          .eq("id", routeId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { route: data ?? null },
          { headers: cacheHeaders(120) },
        );
      },
    },
  },
});
