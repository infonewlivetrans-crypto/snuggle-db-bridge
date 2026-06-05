import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { dealFromMatchSchema } from "@/lib/dispatcher/schemas";
import { enrichDeals } from "./deals";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const SELECT =
  "id, deal_number, main_freight_id, carrier_id, driver_id, vehicle_id, " +
  "route_from, route_to, loading_date, unloading_date, " +
  "total_rate, commission_rate, commission_amount, " +
  "payment_type, payment_delay_days, expected_payment_date, payment_due, " +
  "carrier_payment_received_at, commission_paid_at, " +
  "deal_status, payment_status, commission_status, comment, " +
  "created_at, updated_at";

function addDays(date: string | null | undefined, days: number | null | undefined): string | null {
  if (!date || days == null || !Number.isFinite(days)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/dispatcher/deals/from-match")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = dealFromMatchSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const { freight_id, vehicle_id } = parsed.data;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client: any = auth.client;

        const freightRes = await client
          .from("dispatcher_freights" as never)
          .select(
            "id, title, loading_city, unloading_city, loading_date, unloading_date, rate, payment_type, payment_delay_days",
          )
          .eq("id", freight_id)
          .maybeSingle();
        if (freightRes.error)
          return jsonResponse({ error: freightRes.error.message }, { status: 500 });
        if (!freightRes.data)
          return jsonResponse({ error: "freight_not_found" }, { status: 404 });

        const vehicleRes = await client
          .from("dispatcher_vehicle_ext" as never)
          .select("id, dispatcher_driver_ext_id, dispatcher_carrier_ext_id")
          .eq("id", vehicle_id)
          .maybeSingle();
        if (vehicleRes.error)
          return jsonResponse({ error: vehicleRes.error.message }, { status: 500 });
        if (!vehicleRes.data)
          return jsonResponse({ error: "vehicle_not_found" }, { status: 404 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f: any = freightRes.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v: any = vehicleRes.data;

        const rate = typeof f.rate === "number" ? f.rate : Number(f.rate ?? 0) || 0;
        const expected = addDays(f.unloading_date, f.payment_delay_days);

        const payload = {
          main_freight_id: freight_id,
          vehicle_id,
          driver_id: v.dispatcher_driver_ext_id ?? null,
          carrier_id: v.dispatcher_carrier_ext_id ?? null,
          route_from: f.loading_city ?? null,
          route_to: f.unloading_city ?? null,
          loading_date: f.loading_date ?? null,
          unloading_date: f.unloading_date ?? null,
          total_rate: rate,
          commission_rate: 0.05,
          payment_type: f.payment_type ?? null,
          payment_delay_days: f.payment_delay_days ?? null,
          expected_payment_date: expected,
          payment_due: expected,
          deal_status: "agreed",
          payment_status: "waiting_customer_payment",
          commission_status: "accrued",
          created_by: auth.userId,
        };

        const ins = await client
          .from("dispatcher_deals" as never)
          .insert(payload as unknown as never)
          .select(SELECT)
          .single();
        if (ins.error) return jsonResponse({ error: ins.error.message }, { status: 500 });

        // Mark freight as booked (best-effort, ignore errors)
        await client
          .from("dispatcher_freights" as never)
          .update({ dispatcher_status: "booked" } as unknown as never)
          .eq("id", freight_id);

        const [enriched] = await enrichDeals(client, [ins.data as Record<string, unknown>]);
        return jsonResponse({ row: enriched }, { status: 201 });
      },
    },
  },
});
