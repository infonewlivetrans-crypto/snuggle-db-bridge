import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole, parseListParams } from "@/server/api-helpers.server";
import {
  carrierRequestCreateSchema,
  computeCommissionAmount,
} from "@/lib/dispatcher/carrier-request-schemas";
import { generateCarrierRequestNumber } from "@/lib/dispatcher/carrier-request";

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

export { SELECT as CARRIER_REQUEST_SELECT };

export const Route = createFileRoute("/api/dispatcher/carrier-requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, url } = parseListParams(request);
        const carrierId = url.searchParams.get("carrier_id");
        const dealId = url.searchParams.get("deal_id");
        const status = url.searchParams.get("status");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any).select(SELECT, { count: "exact" });
        if (carrierId) q = q.eq("dispatcher_carrier_ext_id", carrierId);
        if (dealId) q = q.eq("dispatcher_deal_id", dealId);
        if (status && status !== "all") q = q.eq("request_status", status);
        q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ rows: data ?? [], total: count ?? 0 });
      },

      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = carrierRequestCreateSchema.safeParse(body);
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

        // Перевозчик существует.
        const carrierRes = await client
          .from("dispatcher_carrier_ext")
          .select("id")
          .eq("id", d.dispatcher_carrier_ext_id)
          .maybeSingle();
        if (carrierRes.error)
          return jsonResponse({ error: carrierRes.error.message }, { status: 500 });
        if (!carrierRes.data)
          return jsonResponse({ error: "carrier_not_found" }, { status: 404 });

        // Водитель принадлежит этому перевозчику.
        if (d.dispatcher_driver_ext_id) {
          const r = await client
            .from("dispatcher_driver_ext")
            .select("id, dispatcher_carrier_ext_id")
            .eq("id", d.dispatcher_driver_ext_id)
            .maybeSingle();
          if (!r.data || r.data.dispatcher_carrier_ext_id !== d.dispatcher_carrier_ext_id) {
            return jsonResponse(
              { error: "driver_not_in_carrier" },
              { status: 400 },
            );
          }
        }
        // Транспорт принадлежит этому перевозчику.
        if (d.dispatcher_vehicle_ext_id) {
          const r = await client
            .from("dispatcher_vehicle_ext")
            .select("id, dispatcher_carrier_ext_id")
            .eq("id", d.dispatcher_vehicle_ext_id)
            .maybeSingle();
          if (!r.data || r.data.dispatcher_carrier_ext_id !== d.dispatcher_carrier_ext_id) {
            return jsonResponse(
              { error: "vehicle_not_in_carrier" },
              { status: 400 },
            );
          }
        }

        const commissionPercent =
          d.commission_percent == null ? 5 : d.commission_percent;
        const commissionAmount = computeCommissionAmount(
          d.rate_amount ?? null,
          commissionPercent,
        );

        const insertRow: Record<string, unknown> = {
          ...d,
          request_number: d.request_number ?? generateCarrierRequestNumber(),
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          sent_by: auth.userId,
        };
        if (d.request_status === "sent" && !insertRow.sent_at) {
          insertRow.sent_at = new Date().toISOString();
        }

        const { data, error } = await client
          .from(TABLE)
          .insert(insertRow)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data });
      },
    },
  },
});
