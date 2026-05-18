import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

interface Payload {
  transport_request_id: string;
  status: string;
  comment?: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}

// POST /api/warehouse-status-alerts — dedup via transport_request_warehouse_status_log
// + insert notification(kind=transport_request_warehouse_status)
export const Route = createFileRoute("/api/warehouse-status-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const body = (await request.json().catch(() => null)) as Payload | null;
        if (!body?.transport_request_id || !body.status || !body.title)
          return jsonResponse({ error: "bad_body" }, { status: 400 });

        const { error: logErr } = await auth.client
          .from("transport_request_warehouse_status_log")
          .insert({
            transport_request_id: body.transport_request_id,
            status: body.status,
            comment: body.comment ?? null,
          } as never);
        if (logErr) {
          if ((logErr as { code?: string }).code === "23505") {
            return jsonResponse({ ok: true, skipped: "duplicate" });
          }
          return jsonResponse({ ok: true, skipped: "log_error" });
        }

        const { error: notifErr } = await auth.client
          .from("notifications")
          .insert({
            kind: "transport_request_warehouse_status",
            title: body.title,
            body: body.body,
            route_id: body.transport_request_id,
            payload: body.payload,
          } as never);
        if (notifErr) return jsonResponse({ error: notifErr.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
