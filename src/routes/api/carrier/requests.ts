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

const FREIGHTS_SELECT =
  "id, carrier_request_id, cargo_name, loading_city, unloading_city, loading_date, " +
  "weight_kg, volume_m3, rate_amount";

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

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const reqIds = rows.map((r) => r.id as string);

        let freightsByReq = new Map<string, Array<Record<string, unknown>>>();
        if (reqIds.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fr = await (ctx.admin.from("dispatcher_freights" as never) as any)
            .select(FREIGHTS_SELECT)
            .in("carrier_request_id", reqIds);
          for (const f of (fr.data ?? []) as Array<Record<string, unknown>>) {
            const key = f.carrier_request_id as string;
            if (!freightsByReq.has(key)) freightsByReq.set(key, []);
            freightsByReq.get(key)!.push(f);
          }
        }

        const enriched = rows.map((r) => ({
          ...r,
          freights: freightsByReq.get(r.id as string) ?? [],
        }));

        // Счётчики по статусам — для бейджей и панели «Входящие предложения».
        const counts: Record<string, number> = {
          sent: 0,
          viewed: 0,
          accepted: 0,
          declined: 0,
          draft: 0,
          cancelled: 0,
        };
        for (const r of rows) {
          const s = r.request_status as string;
          if (counts[s] != null) counts[s] += 1;
        }

        return jsonResponse({ rows: enriched, total: count ?? 0, counts });
      },
    },
  },
});
