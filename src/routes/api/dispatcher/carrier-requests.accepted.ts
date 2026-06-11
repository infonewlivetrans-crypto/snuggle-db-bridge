import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];

/**
 * Список «принятых предложений перевозчику» для рабочей доски диспетчера.
 * По умолчанию возвращает request_status = accepted и dispatcher_deal_id IS NULL.
 * Можно расширить через ?include_with_deal=1.
 */
export const Route = createFileRoute("/api/dispatcher/carrier-requests/accepted")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;
        const url = new URL(request.url);
        const includeWithDeal = url.searchParams.get("include_with_deal") === "1";

        let q = client
          .from("dispatcher_carrier_requests")
          .select(
            "id, request_number, request_status, dispatcher_carrier_ext_id, dispatcher_driver_ext_id, " +
              "dispatcher_vehicle_ext_id, dispatcher_deal_id, cargo_name, loading_city, unloading_city, " +
              "loading_date, unloading_date, rate_amount, rate_currency, commission_percent, commission_amount, " +
              "carrier_comment, dispatcher_comment, responded_at, created_at",
          )
          .eq("request_status", "accepted")
          .order("responded_at", { ascending: false, nullsFirst: false })
          .limit(50);
        if (!includeWithDeal) q = q.is("dispatcher_deal_id", null);
        const reqsRes = await q;
        if (reqsRes.error) return jsonResponse({ error: reqsRes.error.message }, { status: 500 });
        const requests = (reqsRes.data ?? []) as Array<Record<string, unknown>>;
        if (!requests.length) return jsonResponse({ rows: [] });

        const carrierIds = Array.from(
          new Set(requests.map((r) => r.dispatcher_carrier_ext_id).filter(Boolean) as string[]),
        );
        const driverIds = Array.from(
          new Set(requests.map((r) => r.dispatcher_driver_ext_id).filter(Boolean) as string[]),
        );
        const vehicleIds = Array.from(
          new Set(requests.map((r) => r.dispatcher_vehicle_ext_id).filter(Boolean) as string[]),
        );
        const reqIds = requests.map((r) => r.id as string);

        const [carriers, drivers, vehicles, freights] = await Promise.all([
          carrierIds.length
            ? client
                .from("dispatcher_carrier_ext")
                .select("id, name, inn, phone, email")
                .in("id", carrierIds)
            : Promise.resolve({ data: [] }),
          driverIds.length
            ? client
                .from("dispatcher_driver_ext")
                .select("id, full_name, phone")
                .in("id", driverIds)
            : Promise.resolve({ data: [] }),
          vehicleIds.length
            ? client
                .from("dispatcher_vehicle_ext")
                .select("id, vehicle_kind, body_type, plate_number, payload_kg, volume_m3")
                .in("id", vehicleIds)
            : Promise.resolve({ data: [] }),
          client
            .from("dispatcher_freights")
            .select(
              "id, carrier_request_id, cargo_name, loading_city, unloading_city, loading_date, weight_kg, volume_m3, rate_amount, customer_name, customer_email, customer_phone",
            )
            .in("carrier_request_id", reqIds),
        ]);

        const carrierMap = new Map(
          ((carriers.data ?? []) as Array<{ id: string }>).map((c) => [c.id, c]),
        );
        const driverMap = new Map(
          ((drivers.data ?? []) as Array<{ id: string }>).map((d) => [d.id, d]),
        );
        const vehicleMap = new Map(
          ((vehicles.data ?? []) as Array<{ id: string }>).map((v) => [v.id, v]),
        );
        const freightsByReq = new Map<string, Array<Record<string, unknown>>>();
        for (const f of (freights.data ?? []) as Array<Record<string, unknown>>) {
          const key = f.carrier_request_id as string;
          if (!freightsByReq.has(key)) freightsByReq.set(key, []);
          freightsByReq.get(key)!.push(f);
        }

        const rows = requests.map((r) => ({
          ...r,
          carrier: r.dispatcher_carrier_ext_id
            ? carrierMap.get(r.dispatcher_carrier_ext_id as string) ?? null
            : null,
          driver: r.dispatcher_driver_ext_id
            ? driverMap.get(r.dispatcher_driver_ext_id as string) ?? null
            : null,
          vehicle: r.dispatcher_vehicle_ext_id
            ? vehicleMap.get(r.dispatcher_vehicle_ext_id as string) ?? null
            : null,
          freights: freightsByReq.get(r.id as string) ?? [],
          payout_amount:
            r.rate_amount != null && r.commission_amount != null
              ? Number(r.rate_amount) - Number(r.commission_amount)
              : null,
        }));

        return jsonResponse({ rows });
      },
    },
  },
});
