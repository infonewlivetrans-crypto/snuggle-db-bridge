import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole, isAdmin } from "@/server/api-helpers.server";
import { enrichDeals } from "./deals";
import {
  DISPATCHER_PAYOUT_STATUSES,
  DEAL_STATUSES,
} from "@/lib/dispatcher/statuses";

// Stage 11.14 — отчёт по заработку диспетчера.
// GET /api/dispatcher/commissions/earnings
// admin видит всех; dispatcher — только свои начисления.

const ALLOWED_ROLES = ["admin", "dispatcher"];
const TABLE = "dispatcher_deals";

const SELECT =
  "id, deal_number, route_from, route_to, loading_date, unloading_date, " +
  "carrier_id, driver_id, vehicle_id, main_freight_id, " +
  "total_rate, commission_rate, commission_amount, " +
  "deal_status, payment_status, commission_status, " +
  "commission_received_at, commission_paid_at, " +
  "dispatcher_user_id, dispatcher_commission_percent, " +
  "dispatcher_commission_amount, platform_commission_amount, " +
  "dispatcher_payout_status, dispatcher_payout_due_date, " +
  "dispatcher_paid_at, dispatcher_payout_comment, " +
  "created_by, created_at, updated_at";

export const Route = createFileRoute("/api/dispatcher/commissions/earnings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;
        const admin = await isAdmin(client, auth.userId);

        const url = new URL(request.url);
        const dateFrom = url.searchParams.get("date_from");
        const dateTo = url.searchParams.get("date_to");
        const dispatcherUserId = url.searchParams.get("dispatcher_user_id");
        const payoutStatus = url.searchParams.get("payout_status");
        const dealStatus = url.searchParams.get("deal_status");

        let q = client.from(TABLE).select(SELECT, { count: "exact" });

        // dispatcher видит только своё
        if (!admin) {
          q = q.eq("dispatcher_user_id", auth.userId);
        } else if (dispatcherUserId) {
          q = q.eq("dispatcher_user_id", dispatcherUserId);
        }

        if (
          payoutStatus &&
          payoutStatus !== "all" &&
          (DISPATCHER_PAYOUT_STATUSES as readonly string[]).includes(payoutStatus)
        ) {
          q = q.eq("dispatcher_payout_status", payoutStatus);
        }
        if (
          dealStatus &&
          dealStatus !== "all" &&
          (DEAL_STATUSES as readonly string[]).includes(dealStatus)
        ) {
          q = q.eq("deal_status", dealStatus);
        }
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59Z`);

        q = q.order("created_at", { ascending: false }).limit(500);

        const { data, error, count } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const enriched = await enrichDeals(client, rows);

        // Сводка
        const sum = (k: string) =>
          enriched.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
        const sumWhere = (k: string, filter: (r: Record<string, unknown>) => boolean) =>
          enriched.filter(filter).reduce((a, r) => a + (Number(r[k]) || 0), 0);

        const summary = {
          total_count: enriched.length,
          dispatcher_total: sum("dispatcher_commission_amount"),
          platform_total: sum("platform_commission_amount"),
          commission_total: sum("commission_amount"),
          dispatcher_pending: sumWhere(
            "dispatcher_commission_amount",
            (r) => r.dispatcher_payout_status === "pending",
          ),
          dispatcher_ready: sumWhere(
            "dispatcher_commission_amount",
            (r) => r.dispatcher_payout_status === "ready",
          ),
          dispatcher_paid: sumWhere(
            "dispatcher_commission_amount",
            (r) => r.dispatcher_payout_status === "paid",
          ),
        };

        return jsonResponse({
          rows: enriched,
          total: count ?? enriched.length,
          summary,
          is_admin: admin,
          current_user_id: auth.userId,
        });
      },
    },
  },
});
