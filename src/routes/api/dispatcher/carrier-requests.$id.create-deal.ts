import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const REQ_TABLE = "dispatcher_carrier_requests";
const DEAL_TABLE = "dispatcher_deals";
const FREIGHTS_TABLE = "dispatcher_freights";
const VEHICLES_TABLE = "dispatcher_vehicle_ext";

// Маппинг типа оплаты из заявки перевозчику в payment_type сделки.
const PAYMENT_MAP: Record<string, string> = {
  prepayment: "advance",
  on_loading: "advance",
  on_unloading: "on_unload",
  delayed: "deferred",
  mixed: "other",
  other: "other",
};

export const Route = createFileRoute("/api/dispatcher/carrier-requests/$id/create-deal")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        const cur = await client
          .from(REQ_TABLE)
          .select(
            "id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, dispatcher_vehicle_ext_id, " +
              "dispatcher_deal_id, request_status, cargo_name, " +
              "loading_city, loading_address, loading_date, " +
              "unloading_city, unloading_address, unloading_date, " +
              "rate_amount, commission_percent, commission_amount, " +
              "payment_type, payment_delay_days, " +
              "terms_text, dispatcher_comment, request_number, sent_by",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = cur.data as Record<string, unknown>;

        // Защита от дублей: если сделка уже привязана — возвращаем её.
        if (r.dispatcher_deal_id) {
          const existing = await client
            .from(DEAL_TABLE)
            .select("id, deal_number")
            .eq("id", r.dispatcher_deal_id)
            .maybeSingle();
          if (existing.data) {
            return jsonResponse({ row: existing.data, already_linked: true });
          }
        }

        if (r.request_status !== "accepted") {
          return jsonResponse(
            { error: "request_not_accepted", request_status: r.request_status },
            { status: 409 },
          );
        }

        // Грузы, привязанные к этой заявке перевозчику.
        const freightsRes = await client
          .from(FREIGHTS_TABLE)
          .select(
            "id, cargo_name, loading_city, unloading_city, loading_date, unloading_date, rate_amount, weight_kg, volume_m3",
          )
          .eq("carrier_request_id", params.id);
        const freights = (freightsRes.data ?? []) as Array<Record<string, unknown>>;

        const pct = r.commission_percent == null ? 5 : Number(r.commission_percent);
        const commissionRate = Number.isFinite(pct) ? Math.min(Math.max(pct / 100, 0), 1) : 0.05;
        const totalRate = Number(r.rate_amount ?? 0) || 0;
        const commissionAmount =
          r.commission_amount != null
            ? Number(r.commission_amount)
            : Math.round(totalRate * commissionRate * 100) / 100;
        const rt = r.payment_type as string | null;
        const mappedPayment = rt && PAYMENT_MAP[rt] ? PAYMENT_MAP[rt] : null;

        const cargoName =
          (r.cargo_name as string | null) ??
          (freights.find((f) => f.cargo_name)?.cargo_name as string | null) ??
          null;

        const commentParts: string[] = [];
        if (r.request_number) commentParts.push(`Создано из принятого предложения ${r.request_number}`);
        if (r.terms_text) commentParts.push(String(r.terms_text));
        if (r.dispatcher_comment) commentParts.push(String(r.dispatcher_comment));
        const comment = commentParts.length ? commentParts.join("\n") : null;

        const mainFreightId = (freights[0]?.id as string | undefined) ?? null;
        const addonIds = freights.slice(1).map((f) => f.id as string);

        const dealPayload: Record<string, unknown> = {
          carrier_id: r.dispatcher_carrier_ext_id ?? null,
          driver_id: r.dispatcher_driver_ext_id ?? null,
          vehicle_id: r.dispatcher_vehicle_ext_id ?? null,
          main_freight_id: mainFreightId,
          addon_freight_ids: addonIds.length ? addonIds : null,
          route_from: r.loading_city ?? null,
          route_to: r.unloading_city ?? null,
          loading_date: r.loading_date ?? null,
          unloading_date: r.unloading_date ?? null,
          total_rate: totalRate,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          payment_type: mappedPayment,
          payment_delay_days: r.payment_delay_days ?? null,
          deal_status: "agreed",
          payment_status: "waiting_customer_payment",
          commission_status: "accrued",
          comment: comment ?? cargoName,
          created_by: auth.userId,
        };

        const ins = await client
          .from(DEAL_TABLE)
          .insert(dealPayload as never)
          .select("id, deal_number")
          .single();
        if (ins.error) return jsonResponse({ error: ins.error.message }, { status: 500 });
        const dealId = ins.data.id as string;

        // Привязываем заявку к новой сделке.
        await client
          .from(REQ_TABLE)
          .update({ dispatcher_deal_id: dealId } as never)
          .eq("id", params.id);

        // Привязываем связанные грузы к сделке + статус deal_created.
        if (freights.length) {
          await client
            .from(FREIGHTS_TABLE)
            .update({ deal_id: dealId, dispatcher_status: "deal_created" } as never)
            .eq("carrier_request_id", params.id);
        }

        // Машина подтверждена под рейс.
        if (r.dispatcher_vehicle_ext_id) {
          await client
            .from(VEHICLES_TABLE)
            .update({ dispatcher_work_status: "accepted" } as never)
            .eq("id", r.dispatcher_vehicle_ext_id);
        }

        return jsonResponse(
          { row: ins.data, already_linked: false, freights_linked: freights.length },
          { status: 201 },
        );
      },
    },
  },
});
