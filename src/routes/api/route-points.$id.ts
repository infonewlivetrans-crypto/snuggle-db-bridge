import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

const ALLOWED = new Set([
  "status",
  "point_number",
  "wh_return_status",
  "wh_return_status_changed_at",
  "wh_return_status_changed_by",
  "wh_return_arrived_at",
  "wh_return_accepted_at",
  "wh_return_accepted_by",
  "wh_return_comment",
  "dp_status",
  "dp_status_changed_at",
  "dp_inbound_status",
  "dp_amount_received",
  "dp_payment_comment",
  "dp_undelivered_reason",
  "dp_return_warehouse_id",
  "dp_return_comment",
  "dp_expected_return_at",
  "dp_planned_arrival_at",
  "dp_actual_arrival_at",
  "dp_unload_started_at",
  "dp_unload_finished_at",
  "dp_finished_at",
  "dp_idle_started_at",
  "dp_idle_finished_at",
  "dp_idle_duration_minutes",
  "dp_idle_reason",
  "dp_idle_comment",
  "comment",
]);

export const Route = createFileRoute("/api/route-points/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const fields = url.searchParams.get("fields") || "*";
        const { data, error } = await auth.client
          .from("route_points")
          .select(fields)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? null, { headers: cacheHeaders(10) });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (ALLOWED.has(k)) updates[k] = v;
        }
        if (Object.keys(updates).length === 0) {
          return jsonResponse({ error: "Нет допустимых полей" }, { status: 400 });
        }
        const { error } = await auth.client
          .from("route_points")
          .update(updates as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const { error } = await auth.client
          .from("route_points")
          .delete()
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
