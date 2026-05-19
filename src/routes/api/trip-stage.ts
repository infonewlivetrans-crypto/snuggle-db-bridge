import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import type { TripStage } from "@/lib/tripStage";

const ALLOWED_STAGES: TripStage[] = [
  "arrived_loading", "loaded", "departed", "finished", "cash_returned",
];

function statusFromPgError(message: string): number {
  const m = (message || "").toLowerCase();
  if (m.includes("forbidden")) return 403;
  if (m.includes("unauthorized")) return 401;
  if (m.includes("не найден")) return 404;
  if (m.includes("обязател") || m.includes("недопустим") || m.includes("укажите")) return 400;
  return 500;
}

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
          if (!drId)
            return jsonResponse({ error: "deliveryRouteId обязателен" }, { status: 400 });
          // Чтение выполняется только через JWT-клиент текущего пользователя, без admin/service role.
          if (kind === "returns") {
            const { data, error } = await auth.client
              .from("route_returns")
              .select("*")
              .eq("delivery_route_id", drId)
              .order("occurred_at", { ascending: false });
            if (error) {
              console.error("/api/trip-stage GET returns error:", error.message);
              return jsonResponse([]);
            }
            return jsonResponse(data ?? []);
          }
          const { data, error } = await auth.client
            .from("route_stage_events")
            .select("*")
            .eq("delivery_route_id", drId)
            .order("occurred_at", { ascending: true });
          if (error) {
            console.error("/api/trip-stage GET events error:", error.message);
            return jsonResponse([]);
          }
          return jsonResponse(data ?? []);
        } catch (e) {
          console.error("/api/trip-stage GET error:", e);
          // Никогда не возвращаем 500 на чтении — отдаём пустой список.
          return jsonResponse([]);
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
          if (!body?.deliveryRouteId)
            return jsonResponse({ error: "deliveryRouteId обязателен" }, { status: 400 });

          if (body.kind === "return") {
            if (!body.reason?.trim())
              return jsonResponse({ error: "Укажите причину возврата" }, { status: 400 });
            const { error } = await auth.client.rpc("driver_record_route_return", {
              p_delivery_route_id: body.deliveryRouteId,
              p_order_id: body.orderId ?? null,
              p_reason: body.reason.trim(),
              p_comment: body.comment ?? null,
              p_actor_name: body.actorName ?? null,
            } as never);
            if (error) {
              return jsonResponse({ error: error.message }, { status: statusFromPgError(error.message) });
            }
            return jsonResponse({ ok: true });
          }

          if (!body.stage || !ALLOWED_STAGES.includes(body.stage)) {
            return jsonResponse({ error: "Недопустимый этап" }, { status: 400 });
          }
          const { error } = await auth.client.rpc("driver_record_stage_event", {
            p_delivery_route_id: body.deliveryRouteId,
            p_stage: body.stage,
            p_comment: body.comment ?? null,
            p_gps_lat: body.gps?.lat ?? null,
            p_gps_lng: body.gps?.lng ?? null,
            p_actor_name: body.actorName ?? null,
          } as never);
          if (error) {
            return jsonResponse({ error: error.message }, { status: statusFromPgError(error.message) });
          }
          return jsonResponse({ ok: true });
        } catch (e) {
          console.error("/api/trip-stage POST error:", e);
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
