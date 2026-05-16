import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { tripStageStatusFor } from "@/server/trip-stage-error.server";
import {
  listRouteReturns,
  listStageEvents,
  recordRouteReturn,
  recordStageEvent,
} from "@/server/trip-stage.server";
import type { TripStage } from "@/lib/tripStage";

const ALLOWED_STAGES: TripStage[] = [
  "arrived_loading", "loaded", "departed", "finished", "cash_returned",
];

export const Route = createFileRoute("/api/trip-stage")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const url = new URL(request.url);
          const drId = url.searchParams.get("deliveryRouteId");
          const kind = url.searchParams.get("kind") ?? "events";
          if (!drId) return jsonResponse({ error: "deliveryRouteId обязателен" }, { status: 400 });
          if (kind === "returns") {
            return jsonResponse(await listRouteReturns(drId));
          }
          return jsonResponse(await listStageEvents(drId));
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as {
            kind?: "advance" | "return";
            deliveryRouteId?: string;
            stage?: TripStage;
            comment?: string | null;
            gps?: { lat: number; lng: number } | null;
            actorName?: string | null;
            orderId?: string | null;
            reason?: string;
          };
          if (!body?.deliveryRouteId) return jsonResponse({ error: "deliveryRouteId обязателен" }, { status: 400 });
          if (body.kind === "return") {
            if (!body.reason?.trim()) return jsonResponse({ error: "Укажите причину возврата" }, { status: 400 });
            await recordRouteReturn({
              deliveryRouteId: body.deliveryRouteId,
              orderId: body.orderId ?? null,
              reason: body.reason.trim(),
              comment: body.comment ?? null,
              actorUserId: auth.userId,
              actorName: body.actorName ?? null,
            });
            return jsonResponse({ ok: true });
          }
          if (!body.stage || !ALLOWED_STAGES.includes(body.stage)) {
            return jsonResponse({ error: "Недопустимый этап" }, { status: 400 });
          }
          await recordStageEvent({
            deliveryRouteId: body.deliveryRouteId,
            stage: body.stage,
            comment: body.comment ?? null,
            gps: body.gps ?? null,
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
