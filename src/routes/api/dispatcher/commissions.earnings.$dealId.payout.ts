import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole, isAdmin } from "@/server/api-helpers.server";
import { DISPATCHER_PAYOUT_STATUSES } from "@/lib/dispatcher/statuses";

// Stage 11.14 — admin отмечает выплату диспетчеру.
// PATCH /api/dispatcher/commissions/earnings/:dealId/payout

const ALLOWED_ROLES = ["admin", "dispatcher"];
const TABLE = "dispatcher_deals";

const schema = z.object({
  dispatcher_payout_status: z.enum(DISPATCHER_PAYOUT_STATUSES).optional(),
  dispatcher_paid_at: z.string().nullable().optional(),
  dispatcher_payout_due_date: z.string().nullable().optional(),
  dispatcher_payout_comment: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute(
  "/api/dispatcher/commissions/earnings/$dealId/payout",
)({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.dealId)
          return jsonResponse({ error: "id required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;
        const admin = await isAdmin(client, auth.userId);
        if (!admin) {
          return jsonResponse(
            { error: "forbidden", message: "Только админ может отмечать выплату" },
            { status: 403 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const d = parsed.data;

        const upd: Record<string, unknown> = {};
        if (d.dispatcher_payout_status !== undefined) {
          upd.dispatcher_payout_status = d.dispatcher_payout_status;
          if (d.dispatcher_payout_status === "paid") {
            upd.dispatcher_paid_at = d.dispatcher_paid_at ?? new Date().toISOString();
          }
        }
        if (d.dispatcher_paid_at !== undefined) {
          upd.dispatcher_paid_at = d.dispatcher_paid_at;
        }
        if (d.dispatcher_payout_due_date !== undefined) {
          upd.dispatcher_payout_due_date = d.dispatcher_payout_due_date;
        }
        if (d.dispatcher_payout_comment !== undefined) {
          upd.dispatcher_payout_comment = d.dispatcher_payout_comment;
        }

        if (Object.keys(upd).length === 0) {
          return jsonResponse({ error: "nothing_to_update" }, { status: 400 });
        }

        const { data, error } = await client
          .from(TABLE)
          .update(upd as never)
          .eq("id", params.dealId)
          .select(
            "id, dispatcher_payout_status, dispatcher_paid_at, " +
              "dispatcher_payout_due_date, dispatcher_payout_comment, " +
              "dispatcher_commission_amount, platform_commission_amount",
          )
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: "not_found" }, { status: 404 });

        return jsonResponse({ row: data });
      },
    },
  },
});
