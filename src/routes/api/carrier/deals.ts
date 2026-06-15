import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// GET /api/carrier/deals — сделки dispatcher_deals, привязанные к текущему
// перевозчику (carrier_id = dispatcher_carrier_ext.id). Только чтение,
// без production-полей старого контура routes/orders.
export const Route = createFileRoute("/api/carrier/deals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) {
          return jsonResponse({ ok: false, reason: "no_carrier_linked", rows: [], total: 0 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = ctx.admin as any;
        const { data: deals, error } = await admin
          .from("dispatcher_deals")
          .select(
            "id, deal_number, route_from, route_to, loading_date, unloading_date, " +
              "total_rate, commission_rate, commission_amount, payment_type, " +
              "deal_status, payment_status, commission_status, comment, carrier_comment, " +
              "loading_started_at, in_transit_at, unloading_started_at, delivered_at, " +
              "driver_id, vehicle_id, created_at, updated_at",
          )
          .eq("carrier_id", ctx.dispatcherCarrierExtId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error)
          return jsonResponse(
            { ok: false, error: error.message, rows: [], total: 0 },
            { status: 200 },
          );
        const rows = (deals ?? []) as Array<Record<string, unknown>>;

        // Подтягиваем имя водителя, описание транспорта и номер заявки-источника.
        const driverIds = uniq(rows.map((r) => r.driver_id as string | null));
        const vehicleIds = uniq(rows.map((r) => r.vehicle_id as string | null));
        const dealIds = rows.map((r) => r.id as string);

        const [drv, veh, req] = await Promise.all([
          driverIds.length
            ? admin
                .from("dispatcher_driver_ext")
                .select("id, full_name, phone")
                .in("id", driverIds)
            : Promise.resolve({ data: [] }),
          vehicleIds.length
            ? admin
                .from("dispatcher_vehicle_ext")
                .select("id, vehicle_kind, body_type, plate_number")
                .in("id", vehicleIds)
            : Promise.resolve({ data: [] }),
          dealIds.length
            ? admin
                .from("dispatcher_carrier_requests")
                .select("id, request_number, dispatcher_deal_id, request_status")
                .in("dispatcher_deal_id", dealIds)
            : Promise.resolve({ data: [] }),
        ]);

        const dMap = indexBy((drv.data ?? []) as Array<Record<string, unknown>>, "id");
        const vMap = indexBy((veh.data ?? []) as Array<Record<string, unknown>>, "id");
        const rMap = indexBy(
          (req.data ?? []) as Array<Record<string, unknown>>,
          "dispatcher_deal_id",
        );

        const enriched = rows.map((r) => {
          const d = r.driver_id ? dMap[r.driver_id as string] : null;
          const v = r.vehicle_id ? vMap[r.vehicle_id as string] : null;
          const req = rMap[r.id as string] ?? null;
          return {
            ...r,
            driver_name: d?.full_name ?? null,
            driver_phone: d?.phone ?? null,
            vehicle_kind: v?.vehicle_kind ?? null,
            vehicle_body_type: v?.body_type ?? null,
            vehicle_plate: v?.plate_number ?? null,
            source_request_number: req?.request_number ?? null,
            source_request_id: req?.id ?? null,
          };
        });

        return jsonResponse({ ok: true, rows: enriched, total: enriched.length });
      },
    },
  },
});

function uniq(arr: Array<string | null>): string[] {
  return Array.from(new Set(arr.filter((x): x is string => !!x)));
}
function indexBy(
  arr: Array<Record<string, unknown>>,
  key: string,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const row of arr) {
    const k = row[key] as string | undefined;
    if (k) out[k] = row;
  }
  return out;
}
