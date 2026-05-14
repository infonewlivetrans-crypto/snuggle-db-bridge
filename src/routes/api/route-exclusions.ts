import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import {
  EXCLUSION_REASONS,
  excludeOrderFromRoute,
  listRouteExclusions,
  type ExclusionReason,
} from "@/server/route-exclusions.server";

const REASON_SET = new Set<string>(EXCLUSION_REASONS);

export const Route = createFileRoute("/api/route-exclusions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const drId = url.searchParams.get("deliveryRouteId");
          if (!drId) return jsonResponse({ error: "deliveryRouteId обязателен" }, { status: 400 });
          const rows = await listRouteExclusions(drId);
          return jsonResponse(rows);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as {
            deliveryRouteId?: string; orderId?: string;
            reason?: string; comment?: string | null; actorName?: string | null;
          };
          if (!body?.deliveryRouteId) return jsonResponse({ error: "deliveryRouteId обязателен" }, { status: 400 });
          if (!body?.orderId) return jsonResponse({ error: "orderId обязателен" }, { status: 400 });
          if (!body?.reason || !REASON_SET.has(body.reason)) return jsonResponse({ error: "Недопустимая причина" }, { status: 400 });
          if (body.comment != null && body.comment.length > 1000) {
            return jsonResponse({ error: "Комментарий слишком длинный" }, { status: 400 });
          }
          await excludeOrderFromRoute({
            deliveryRouteId: body.deliveryRouteId,
            orderId: body.orderId,
            reason: body.reason as ExclusionReason,
            comment: body.comment ?? null,
            actorUserId: auth.userId,
            actorName: body.actorName ?? null,
          });
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
