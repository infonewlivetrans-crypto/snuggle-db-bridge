import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

const TABLE = "dispatcher_carrier_requests";
const SELECT =
  "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, dispatcher_deal_id, " +
  "request_number, cargo_name, loading_city, loading_address, loading_date, " +
  "unloading_city, unloading_address, unloading_date, " +
  "rate_amount, rate_currency, payment_type, payment_delay_days, " +
  "commission_percent, commission_amount, terms_text, dispatcher_comment, carrier_comment, " +
  "request_status, sent_at, responded_at, created_at, updated_at";

export const Route = createFileRoute("/api/carrier/requests/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (ctx.admin.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });

        // Если sent → авто-перевод в viewed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = data as any;
        if (row.request_status === "sent") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ctx.admin.from(TABLE as never) as any)
            .update({ request_status: "viewed" } as never)
            .eq("id", params.id);
          row.request_status = "viewed";
        }
        return jsonResponse({ row });
      },
    },
  },
});
