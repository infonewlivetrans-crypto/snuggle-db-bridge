import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

type EventType = "low_stock" | "shortage" | "supply_request_created";

interface Payload {
  event_type: EventType;
  warehouse_id?: string | null;
  product_id?: string | null;
  transport_request_id?: string | null;
  supply_request_id?: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  route_id?: string | null;
}

// POST /api/supply-alerts — dedup via supply_notification_log + insert notification
export const Route = createFileRoute("/api/supply-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Payload | null;
        if (!body || !body.event_type || !body.title)
          return jsonResponse({ error: "bad_body" }, { status: 400 });

        const { error: logErr } = await auth.client
          .from("supply_notification_log")
          .insert({
            event_type: body.event_type,
            warehouse_id: body.warehouse_id ?? null,
            product_id: body.product_id ?? null,
            transport_request_id: body.transport_request_id ?? null,
            supply_request_id: body.supply_request_id ?? null,
          } as never);
        if (logErr) {
          // 23505 = уже отправляли, это нормально, тихо выходим
          if ((logErr as { code?: string }).code === "23505") {
            return jsonResponse({ ok: true, skipped: "duplicate" });
          }
          // Прочие ошибки лог-таблицы — не блокируют пользователя
          return jsonResponse({ ok: true, skipped: "log_error" });
        }

        const { error: notifErr } = await auth.client
          .from("notifications")
          .insert({
            kind: "supply_alert",
            title: body.title,
            body: body.body,
            route_id: body.route_id ?? null,
            payload: body.payload,
          } as never);
        if (notifErr) return jsonResponse({ error: notifErr.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
