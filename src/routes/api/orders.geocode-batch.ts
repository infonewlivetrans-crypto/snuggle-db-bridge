/**
 * POST /api/orders/geocode-batch
 *  body: { order_ids: string[] }  // максимум 50
 *  -> { updated, failed, skipped }
 *
 * Используется:
 *  - перед созданием маршрута из выбранных заказов (CreateRouteFromOrdersDialog);
 *  - кнопкой «Догеокодировать» (когда импорт оставил часть без координат).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { geocodeOrdersByIds } from "@/server/orders-geocode.server";

const BodySchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(50),
});

export const Route = createFileRoute("/api/orders/geocode-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid json" }, { status: 400 });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "order_ids must be array of 1..50 uuids" },
            { status: 400 },
          );
        }
        try {
          const result = await geocodeOrdersByIds(auth.client, parsed.data.order_ids);
          return jsonResponse(result);
        } catch (e) {
          return jsonResponse(
            { error: e instanceof Error ? e.message : "geocode_batch_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
