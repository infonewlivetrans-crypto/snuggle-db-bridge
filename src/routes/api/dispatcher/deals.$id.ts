import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { dealUpdateSchema } from "@/lib/dispatcher/schemas";
import { enrichDeals } from "./deals";

const TABLE = "dispatcher_deals";
const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, deal_number, main_freight_id, carrier_id, driver_id, vehicle_id, " +
  "route_from, route_to, loading_date, unloading_date, " +
  "total_rate, commission_rate, commission_amount, " +
  "payment_type, payment_delay_days, expected_payment_date, payment_due, " +
  "carrier_payment_received_at, commission_paid_at, " +
  "deal_status, payment_status, commission_status, comment, " +
  "created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/deals/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const [enriched] = await enrichDeals(auth.client, [data]);
        return jsonResponse({ row: enriched });
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = dealUpdateSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            {
              error: `validation_failed: ${first?.path?.join(".") || "?"} — ${first?.message ?? ""}`,
              issues: parsed.error.issues,
            },
            { status: 400 },
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update(parsed.data as unknown as never)
          .eq("id", params.id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const [enriched] = await enrichDeals(auth.client, [data]);
        return jsonResponse({ row: enriched });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (auth.client.from(TABLE as never) as any)
          .update({ deal_status: "archived" } as unknown as never)
          .eq("id", params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
