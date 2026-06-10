import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import {
  carrierRequestPatchSchema,
  computeCommissionAmount,
} from "@/lib/dispatcher/carrier-request-schemas";

const TABLE = "dispatcher_carrier_requests";
const ALLOWED_ROLES = ["admin", "dispatcher"];
const SELECT =
  "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, dispatcher_deal_id, " +
  "request_number, cargo_name, loading_city, loading_address, loading_date, " +
  "unloading_city, unloading_address, unloading_date, " +
  "customer_name, customer_contact, customer_email, customer_phone, " +
  "rate_amount, rate_currency, payment_type, payment_delay_days, " +
  "commission_percent, commission_amount, terms_text, dispatcher_comment, carrier_comment, " +
  "request_status, sent_by, sent_at, responded_by, responded_at, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/carrier-requests/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .select(SELECT)
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });
        return jsonResponse({ row: data });
      },

      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = carrierRequestPatchSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            { error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}` },
            { status: 400 },
          );
        }
        const d = parsed.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        // Если меняется driver/vehicle — проверяем принадлежность перевозчику.
        let carrierExtId: string | null = null;
        if (
          d.dispatcher_driver_ext_id !== undefined ||
          d.dispatcher_vehicle_ext_id !== undefined ||
          d.rate_amount !== undefined ||
          d.commission_percent !== undefined
        ) {
          const cur = await client
            .from(TABLE)
            .select("dispatcher_carrier_ext_id, rate_amount, commission_percent")
            .eq("id", params.id)
            .maybeSingle();
          if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
          carrierExtId =
            (d.dispatcher_carrier_ext_id as string | undefined) ??
            (cur.data.dispatcher_carrier_ext_id as string);

          if (d.dispatcher_driver_ext_id) {
            const r = await client
              .from("dispatcher_driver_ext")
              .select("id, dispatcher_carrier_ext_id")
              .eq("id", d.dispatcher_driver_ext_id)
              .maybeSingle();
            if (!r.data || r.data.dispatcher_carrier_ext_id !== carrierExtId)
              return jsonResponse({ error: "driver_not_in_carrier" }, { status: 400 });
          }
          if (d.dispatcher_vehicle_ext_id) {
            const r = await client
              .from("dispatcher_vehicle_ext")
              .select("id, dispatcher_carrier_ext_id")
              .eq("id", d.dispatcher_vehicle_ext_id)
              .maybeSingle();
            if (!r.data || r.data.dispatcher_carrier_ext_id !== carrierExtId)
              return jsonResponse({ error: "vehicle_not_in_carrier" }, { status: 400 });
          }

          // Пересчёт commission_amount, если поменялась ставка или процент.
          const newRate =
            d.rate_amount !== undefined ? d.rate_amount : (cur.data.rate_amount as number | null);
          const newPct =
            d.commission_percent !== undefined
              ? d.commission_percent
              : (cur.data.commission_percent as number | null);
          (d as Record<string, unknown>).commission_amount = computeCommissionAmount(
            newRate ?? null,
            newPct ?? null,
          );
          if (d.commission_percent === null) (d as Record<string, unknown>).commission_percent = 5;
        }

        const update: Record<string, unknown> = { ...d };
        if (d.request_status === "sent") {
          update.sent_at = new Date().toISOString();
          update.sent_by = auth.userId;
        }

        const { data, error } = await client
          .from(TABLE)
          .update(update)
          .eq("id", params.id)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // soft-delete → archive
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .update({ request_status: "archive" } as never)
          .eq("id", params.id)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },
    },
  },
});
