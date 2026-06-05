import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { enrichDeals } from "./deals";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const VEHICLE_SELECT =
  "id, vehicle_kind, body_type, payload_kg, volume_m3, home_city, ready_date, " +
  "dispatcher_driver_ext_id, dispatcher_carrier_ext_id, dispatcher_status, " +
  "minimum_trip_rate, minimum_km_rate";

const FREIGHT_SELECT =
  "id, title, loading_city, unloading_city, loading_date, cargo_name, " +
  "weight_kg, volume_m3, body_type, rate, source, dispatcher_status";

const DEAL_SELECT =
  "id, deal_number, main_freight_id, carrier_id, driver_id, vehicle_id, " +
  "route_from, route_to, loading_date, unloading_date, total_rate, " +
  "commission_rate, commission_amount, payment_type, payment_delay_days, " +
  "expected_payment_date, payment_due, carrier_payment_received_at, " +
  "commission_paid_at, deal_status, payment_status, commission_status, " +
  "comment, created_at, updated_at";

const ACTIVE_DEAL_STATUSES = [
  "agreed",
  "documents_sent",
  "loading",
  "in_transit",
  "unloading",
  "delivered",
  "waiting_payment",
  "problem",
];

const VEHICLE_FREE_STATUSES = ["available", "waiting_freight", "new"];
const FREIGHT_ACTIVE_STATUSES = ["new", "checking", "suitable"];

function uniq(arr: Array<string | null | undefined>): string[] {
  return Array.from(new Set(arr.filter((x): x is string => !!x)));
}
function indexBy<T extends Record<string, unknown>>(
  arr: T[],
  key: string,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of arr) {
    const k = r[key] as string | undefined;
    if (k) out[k] = r;
  }
  return out;
}

async function enrichVehicles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  rows: Array<Record<string, unknown>>,
) {
  if (!rows.length) return rows;
  const driverIds = uniq(rows.map((r) => r.dispatcher_driver_ext_id as string | null));
  const carrierIds = uniq(rows.map((r) => r.dispatcher_carrier_ext_id as string | null));
  const [drivers, carriers] = await Promise.all([
    driverIds.length
      ? client
          .from("dispatcher_driver_ext" as never)
          .select("id, full_name, phone")
          .in("id", driverIds)
      : Promise.resolve({ data: [] }),
    carrierIds.length
      ? client
          .from("dispatcher_carrier_ext" as never)
          .select("id, name, phone")
          .in("id", carrierIds)
      : Promise.resolve({ data: [] }),
  ]);
  const dMap = indexBy((drivers.data ?? []) as Array<Record<string, unknown>>, "id");
  const cMap = indexBy((carriers.data ?? []) as Array<Record<string, unknown>>, "id");
  return rows.map((r) => {
    const d = r.dispatcher_driver_ext_id ? dMap[r.dispatcher_driver_ext_id as string] : null;
    const c = r.dispatcher_carrier_ext_id ? cMap[r.dispatcher_carrier_ext_id as string] : null;
    return {
      ...r,
      driver_name: (d?.full_name as string | undefined) ?? null,
      driver_phone: (d?.phone as string | undefined) ?? null,
      carrier_name: (c?.name as string | undefined) ?? null,
      carrier_phone: (c?.phone as string | undefined) ?? null,
    };
  });
}

export const Route = createFileRoute("/api/dispatcher/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const client = auth.client;

        const todayIso = new Date().toISOString().slice(0, 10);
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        const monthStartIso = monthStart.toISOString().slice(0, 10);

        const [
          vehiclesRes,
          freightsRes,
          activeDealsRes,
          waitingPaymentsRes,
          waitingCommissionsRes,
          overdueRes,
          paidMonthRes,
        ] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_vehicle_ext" as never) as any)
            .select(VEHICLE_SELECT, { count: "exact" })
            .in("dispatcher_status", VEHICLE_FREE_STATUSES)
            .order("ready_date", { ascending: true, nullsFirst: false })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_freights" as never) as any)
            .select(FREIGHT_SELECT, { count: "exact" })
            .in("dispatcher_status", FREIGHT_ACTIVE_STATUSES)
            .order("loading_date", { ascending: true, nullsFirst: false })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_deals" as never) as any)
            .select(DEAL_SELECT, { count: "exact" })
            .in("deal_status", ACTIVE_DEAL_STATUSES)
            .order("loading_date", { ascending: true, nullsFirst: false })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_deals" as never) as any)
            .select(DEAL_SELECT)
            .or("payment_status.eq.waiting_customer_payment,deal_status.eq.waiting_payment")
            .neq("deal_status", "archived")
            .order("expected_payment_date", { ascending: true, nullsFirst: false })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_deals" as never) as any)
            .select(DEAL_SELECT)
            .eq("commission_status", "waiting_commission")
            .neq("deal_status", "archived")
            .order("carrier_payment_received_at", { ascending: true, nullsFirst: false })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_deals" as never) as any)
            .select(DEAL_SELECT)
            .lt("expected_payment_date", todayIso)
            .neq("commission_status", "commission_paid")
            .neq("deal_status", "archived")
            .order("expected_payment_date", { ascending: true })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (client.from("dispatcher_deals" as never) as any)
            .select("commission_amount, commission_paid_at")
            .eq("commission_status", "commission_paid")
            .gte("commission_paid_at", monthStartIso),
        ]);

        const firstErr =
          vehiclesRes.error ||
          freightsRes.error ||
          activeDealsRes.error ||
          waitingPaymentsRes.error ||
          waitingCommissionsRes.error ||
          overdueRes.error ||
          paidMonthRes.error;
        if (firstErr) {
          return jsonResponse({ error: firstErr.message }, { status: 500 });
        }

        const availableVehicles = await enrichVehicles(
          client,
          (vehiclesRes.data ?? []) as Array<Record<string, unknown>>,
        );
        const activeFreights = (freightsRes.data ?? []) as Array<Record<string, unknown>>;
        const activeDeals = await enrichDeals(
          client,
          (activeDealsRes.data ?? []) as Array<Record<string, unknown>>,
        );
        const waitingPayments = await enrichDeals(
          client,
          (waitingPaymentsRes.data ?? []) as Array<Record<string, unknown>>,
        );
        const waitingCommissions = await enrichDeals(
          client,
          (waitingCommissionsRes.data ?? []) as Array<Record<string, unknown>>,
        );
        const overdueCommissions = await enrichDeals(
          client,
          (overdueRes.data ?? []) as Array<Record<string, unknown>>,
        );

        const sumCommissionsToReceive =
          waitingCommissions.reduce(
            (s, d) => s + Number((d as { commission_amount?: number }).commission_amount ?? 0),
            0,
          ) +
          waitingPayments.reduce(
            (s, d) => s + Number((d as { commission_amount?: number }).commission_amount ?? 0),
            0,
          );
        const sumOverdue = overdueCommissions.reduce(
          (s, d) => s + Number((d as { commission_amount?: number }).commission_amount ?? 0),
          0,
        );
        const sumReceivedMonth = (
          (paidMonthRes.data ?? []) as Array<{ commission_amount: number | null }>
        ).reduce((s, d) => s + Number(d.commission_amount ?? 0), 0);

        const kpis = {
          available_vehicles_count:
            vehiclesRes.count ?? availableVehicles.length,
          active_freights_count: freightsRes.count ?? activeFreights.length,
          active_deals_count: activeDealsRes.count ?? activeDeals.length,
          commissions_to_receive_sum: round2(sumCommissionsToReceive),
          overdue_sum: round2(sumOverdue),
          received_month_sum: round2(sumReceivedMonth),
        };

        // Auto-generated tasks
        const today = todayIso;
        const todayTasks: Array<{
          id: string;
          type: string;
          title: string;
          target_kind: string;
          target_id: string | null;
          target_label: string | null;
          action_label: string;
          action_href: string;
        }> = [];

        for (const d of overdueCommissions.slice(0, 10)) {
          todayTasks.push({
            id: `overdue-${d.id}`,
            type: "overdue",
            title: "Срочно связаться с перевозчиком",
            target_kind: "deal",
            target_id: d.id as string,
            target_label:
              `${(d.carrier_name as string) ?? "—"} · ${(d.route_from as string) ?? ""} → ${(d.route_to as string) ?? ""}`,
            action_label: "Открыть сделку",
            action_href: "/dispatcher/deals",
          });
        }
        for (const d of waitingCommissions.slice(0, 10)) {
          todayTasks.push({
            id: `commission-${d.id}`,
            type: "waiting_commission",
            title: "Напомнить про комиссию",
            target_kind: "deal",
            target_id: d.id as string,
            target_label:
              `${(d.carrier_name as string) ?? "—"} · ${(d.route_from as string) ?? ""} → ${(d.route_to as string) ?? ""}`,
            action_label: "Открыть комиссии",
            action_href: "/dispatcher/commissions",
          });
        }
        for (const d of waitingPayments.slice(0, 10)) {
          todayTasks.push({
            id: `payment-${d.id}`,
            type: "waiting_payment",
            title: "Проверить оплату заказчика",
            target_kind: "deal",
            target_id: d.id as string,
            target_label:
              `${(d.carrier_name as string) ?? "—"} · ${(d.route_from as string) ?? ""} → ${(d.route_to as string) ?? ""}`,
            action_label: "Открыть сделку",
            action_href: "/dispatcher/deals",
          });
        }
        for (const f of activeFreights.slice(0, 10)) {
          if ((f.dispatcher_status as string) === "new") {
            todayTasks.push({
              id: `freight-${f.id}`,
              type: "check_vehicles",
              title: "Проверить машины для груза",
              target_kind: "freight",
              target_id: f.id as string,
              target_label:
                `${(f.loading_city as string) ?? "—"} → ${(f.unloading_city as string) ?? "—"}`,
              action_label: "Открыть груз",
              action_href: "/dispatcher/freights",
            });
          }
        }
        for (const v of availableVehicles.slice(0, 10)) {
          todayTasks.push({
            id: `vehicle-${v.id}`,
            type: "find_freight",
            title: "Найти груз",
            target_kind: "vehicle",
            target_id: v.id as string,
            target_label:
              `${(v.vehicle_kind as string) ?? "—"} · ${(v.home_city as string) ?? "—"}`,
            action_label: "Открыть транспорт",
            action_href: "/dispatcher/vehicles",
          });
        }

        return jsonResponse(
          {
            kpis,
            availableVehicles,
            activeFreights,
            activeDeals,
            waitingPayments,
            waitingCommissions,
            overdueCommissions,
            todayTasks,
            today,
          },
          { headers: cacheHeaders(0) },
        );
      },
    },
  },
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
