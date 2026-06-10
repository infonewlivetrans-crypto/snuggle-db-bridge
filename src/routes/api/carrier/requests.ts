import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth, parseListParams } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

const TABLE = "dispatcher_carrier_requests";
const SELECT =
  "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, dispatcher_deal_id, " +
  "request_number, cargo_name, loading_city, loading_address, loading_date, " +
  "unloading_city, unloading_address, unloading_date, " +
  "rate_amount, rate_currency, payment_type, payment_delay_days, " +
  "commission_percent, commission_amount, terms_text, dispatcher_comment, carrier_comment, " +
  "request_status, sent_at, responded_at, created_at, updated_at";

export const Route = createFileRoute("/api/carrier/requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;
        const { limit, offset } = parseListParams(request);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = (ctx.admin.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" })
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .neq("request_status", "archive")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: count ?? 0 });
      },
    },
  },
});
