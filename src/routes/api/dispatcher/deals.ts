import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  parseListParams,
  requireAnyRole,
} from "@/server/api-helpers.server";
import { dealCreateSchema } from "@/lib/dispatcher/schemas";
import {
  COMMISSION_STATUSES,
  DEAL_STATUSES,
  PAYMENT_STATUSES,
} from "@/lib/dispatcher/statuses";

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

export const Route = createFileRoute("/api/dispatcher/deals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const { limit, offset, search, url } = parseListParams(request);
        const dealStatus = url.searchParams.get("deal_status");
        const paymentStatus = url.searchParams.get("payment_status");
        const commissionStatus = url.searchParams.get("commission_status");
        const carrierId = url.searchParams.get("carrier_id");
        const driverId = url.searchParams.get("driver_id");
        const vehicleId = url.searchParams.get("vehicle_id");
        const dateFrom = url.searchParams.get("date_from");
        const dateTo = url.searchParams.get("date_to");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (auth.client.from(TABLE as never) as any)
          .select(SELECT, { count: "exact" });

        if (
          dealStatus &&
          dealStatus !== "all" &&
          (DEAL_STATUSES as readonly string[]).includes(dealStatus)
        ) {
          q = q.eq("deal_status", dealStatus);
        }
        if (
          paymentStatus &&
          paymentStatus !== "all" &&
          (PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)
        ) {
          q = q.eq("payment_status", paymentStatus);
        }
        if (
          commissionStatus &&
          commissionStatus !== "all" &&
          (COMMISSION_STATUSES as readonly string[]).includes(commissionStatus)
        ) {
          q = q.eq("commission_status", commissionStatus);
        }
        if (carrierId) q = q.eq("carrier_id", carrierId);
        if (driverId) q = q.eq("driver_id", driverId);
        if (vehicleId) q = q.eq("vehicle_id", vehicleId);
        if (dateFrom) q = q.gte("loading_date", dateFrom);
        if (dateTo) q = q.lte("loading_date", dateTo);
        if (search) {
          const s = search.replace(/[%,]/g, " ").trim();
          q = q.or(
            `deal_number.ilike.%${s}%,route_from.ilike.%${s}%,route_to.ilike.%${s}%,comment.ilike.%${s}%`,
          );
        }
        q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const enriched = await enrichDeals(auth.client, rows);
        return jsonResponse(
          { rows: enriched, total: count ?? enriched.length },
          { headers: cacheHeaders(0) },
        );
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
        const parsed = dealCreateSchema.safeParse(body);
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
        const payload = { ...parsed.data, created_by: auth.userId };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (auth.client.from(TABLE as never) as any)
          .insert(payload as unknown as never)
          .select(SELECT)
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ row: data }, { status: 201 });
      },
    },
  },
});

// Joins carrier/driver/vehicle/freight names + carrier/driver contacts.
// Done client-side in JS to avoid relying on Supabase FK relationship hints.
export async function enrichDeals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  if (!rows.length) return rows;
  const carrierIds = uniq(rows.map((r) => r.carrier_id as string | null));
  const driverIds = uniq(rows.map((r) => r.driver_id as string | null));
  const vehicleIds = uniq(rows.map((r) => r.vehicle_id as string | null));
  const freightIds = uniq(rows.map((r) => r.main_freight_id as string | null));
  const dealIds = rows.map((r) => r.id as string);

  const [carriers, drivers, vehicles, freights, requests] = await Promise.all([
    carrierIds.length
      ? client
          .from("dispatcher_carrier_ext" as never)
          .select("id, name, phone, max_messenger, whatsapp, telegram")
          .in("id", carrierIds)
      : Promise.resolve({ data: [] }),
    driverIds.length
      ? client
          .from("dispatcher_driver_ext" as never)
          .select("id, full_name, phone, max_messenger, whatsapp, telegram")
          .in("id", driverIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length
      ? client
          .from("dispatcher_vehicle_ext" as never)
          .select("id, vehicle_kind, body_type")
          .in("id", vehicleIds)
      : Promise.resolve({ data: [] }),
    freightIds.length
      ? client
          .from("dispatcher_freights" as never)
          .select("id, title")
          .in("id", freightIds)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? client
          .from("dispatcher_carrier_requests" as never)
          .select("id, request_number, dispatcher_deal_id")
          .in("dispatcher_deal_id", dealIds)
      : Promise.resolve({ data: [] }),
  ]);

  const cMap = indexBy((carriers.data ?? []) as Array<Record<string, unknown>>, "id");
  const dMap = indexBy((drivers.data ?? []) as Array<Record<string, unknown>>, "id");
  const vMap = indexBy((vehicles.data ?? []) as Array<Record<string, unknown>>, "id");
  const fMap = indexBy((freights.data ?? []) as Array<Record<string, unknown>>, "id");
  const rMap = indexBy(
    (requests.data ?? []) as Array<Record<string, unknown>>,
    "dispatcher_deal_id",
  );

  return rows.map((r) => {
    const c = r.carrier_id ? cMap[r.carrier_id as string] : null;
    const d = r.driver_id ? dMap[r.driver_id as string] : null;
    const v = r.vehicle_id ? vMap[r.vehicle_id as string] : null;
    const f = r.main_freight_id ? fMap[r.main_freight_id as string] : null;
    const req = rMap[r.id as string] ?? null;
    return {
      ...r,
      carrier_name: c?.name ?? null,
      carrier_phone: c?.phone ?? null,
      carrier_max_messenger: c?.max_messenger ?? null,
      carrier_whatsapp: c?.whatsapp ?? null,
      carrier_telegram: c?.telegram ?? null,
      driver_name: d?.full_name ?? null,
      driver_phone: d?.phone ?? null,
      driver_max_messenger: d?.max_messenger ?? null,
      driver_whatsapp: d?.whatsapp ?? null,
      driver_telegram: d?.telegram ?? null,
      vehicle_kind: v?.vehicle_kind ?? null,
      vehicle_body_type: v?.body_type ?? null,
      freight_title: f?.title ?? null,
      source_request_id: req?.id ?? null,
      source_request_number: req?.request_number ?? null,
    };
  });
}

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
