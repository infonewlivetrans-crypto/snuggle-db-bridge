import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const REQ_TABLE = "dispatcher_carrier_requests";
const DEAL_TABLE = "dispatcher_deals";

// Маппинг типа оплаты из заявки перевозчику в payment_type сделки.
// В сделке справочник другой — выбираем ближайший по смыслу.
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
              "rate_amount, commission_percent, payment_type, payment_delay_days, " +
              "terms_text, dispatcher_comment, request_number",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = cur.data as Record<string, unknown>;

        // Если сделка уже привязана — возвращаем её.
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

        const pct = r.commission_percent == null ? 5 : Number(r.commission_percent);
        const commissionRate = Number.isFinite(pct) ? Math.min(Math.max(pct / 100, 0), 1) : 0.05;
        const rt = r.payment_type as string | null;
        const mappedPayment = rt && PAYMENT_MAP[rt] ? PAYMENT_MAP[rt] : null;

        const commentParts: string[] = [];
        if (r.request_number) commentParts.push(`Из заявки ${r.request_number}`);
        if (r.terms_text) commentParts.push(String(r.terms_text));
        if (r.dispatcher_comment) commentParts.push(String(r.dispatcher_comment));
        const comment = commentParts.length ? commentParts.join("\n") : null;

        const dealPayload: Record<string, unknown> = {
          carrier_id: r.dispatcher_carrier_ext_id ?? null,
          driver_id: r.dispatcher_driver_ext_id ?? null,
          vehicle_id: r.dispatcher_vehicle_ext_id ?? null,
          route_from: r.loading_city ?? null,
          route_to: r.unloading_city ?? null,
          loading_date: r.loading_date ?? null,
          unloading_date: r.unloading_date ?? null,
          total_rate: r.rate_amount ?? 0,
          commission_rate: commissionRate,
          payment_type: mappedPayment,
          payment_delay_days: r.payment_delay_days ?? null,
          deal_status: r.request_status === "accepted" ? "agreed" : "draft",
          payment_status: "waiting_customer_payment",
          commission_status: "accrued",
          comment,
          created_by: auth.userId,
        };

        const ins = await client
          .from(DEAL_TABLE)
          .insert(dealPayload as never)
          .select("id, deal_number")
          .single();
        if (ins.error) return jsonResponse({ error: ins.error.message }, { status: 500 });

        // Привязываем заявку к новой сделке.
        await client
          .from(REQ_TABLE)
          .update({ dispatcher_deal_id: ins.data.id } as never)
          .eq("id", params.id);

        return jsonResponse({ row: ins.data, already_linked: false }, { status: 201 });
      },
    },
  },
});
