import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

// PATCH /api/carrier/deals/:id/progress — этап 11.15.
// Перевозчик/водитель отмечает прогресс рейса. Финансовые статусы,
// commission/payment/payout — не меняются. Только разрешённые переходы.

const ALLOWED_STATUSES = ["loading", "in_transit", "unloading", "delivered"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

const schema = z.object({
  deal_status: z.enum(ALLOWED_STATUSES),
  carrier_comment: z.string().max(2000).optional().nullable(),
});

const STAMP_FIELD: Record<AllowedStatus, string> = {
  loading: "loading_started_at",
  in_transit: "in_transit_at",
  unloading: "unloading_started_at",
  delivered: "delivered_at",
};

export const Route = createFileRoute("/api/carrier/deals/$id/progress")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        const ctx = await resolveCarrierCtx(auth.userId);
        if (ctx instanceof Response) return ctx;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            {
              error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}`,
              hint: "Этот статус может менять только диспетчер",
            },
            { status: 400 },
          );
        }
        const { deal_status, carrier_comment } = parsed.data;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = ctx.admin as any;

        const cur = await admin
          .from("dispatcher_deals")
          .select(
            "id, carrier_id, deal_status, " +
              "loading_started_at, in_transit_at, unloading_started_at, delivered_at, " +
              "dispatcher_carrier_ext_id:carrier_id, " +
              "dispatcher_driver_ext_id:driver_id, " +
              "dispatcher_vehicle_ext_id:vehicle_id",
          )
          .eq("id", params.id)
          .maybeSingle();

        if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = cur.data as Record<string, unknown>;

        if (r.carrier_id !== ctx.dispatcherCarrierExtId) {
          console.warn("[carrier.deal.progress] carrier_ownership_failed", {
            deal_id: params.id,
            user_id: auth.userId,
            deal_carrier_id: r.carrier_id,
            user_carrier_id: ctx.dispatcherCarrierExtId,
          });
          return jsonResponse({ error: "forbidden" }, { status: 403 });
        }

        const now = new Date().toISOString();
        const upd: Record<string, unknown> = { deal_status };
        const stampField = STAMP_FIELD[deal_status];
        if (stampField && !r[stampField]) upd[stampField] = now;
        if (carrier_comment != null) upd.carrier_comment = carrier_comment;

        const updRes = await admin
          .from("dispatcher_deals")
          .update(upd as never)
          .eq("id", params.id)
          .select(
            "id, deal_status, loading_started_at, in_transit_at, " +
              "unloading_started_at, delivered_at, carrier_comment",
          )
          .maybeSingle();
        if (updRes.error)
          return jsonResponse({ error: updRes.error.message }, { status: 500 });

        // Идемпотентная задача диспетчеру при delivered.
        let created_task: { id: string; title: string } | null = null;
        if (deal_status === "delivered") {
          const title = "Проконтролировать оплату заказчика";
          const ex = await admin
            .from("dispatcher_tasks")
            .select("id")
            .eq("dispatcher_deal_id", params.id)
            .eq("title", title)
            .limit(1);
          if ((ex.data ?? []).length === 0) {
            const ins = await admin
              .from("dispatcher_tasks")
              .insert({
                task_type: "custom",
                title,
                description:
                  "Перевозчик отметил доставку. Проследить за оплатой по сделке от заказчика.",
                priority: "high",
                task_status: "open",
                related_entity_type: "deal",
                related_entity_id: params.id,
                dispatcher_deal_id: params.id,
                dispatcher_carrier_ext_id: r.dispatcher_carrier_ext_id ?? null,
                dispatcher_driver_ext_id: r.dispatcher_driver_ext_id ?? null,
                dispatcher_vehicle_ext_id: r.dispatcher_vehicle_ext_id ?? null,
                action_url: "/dispatcher/deals",
                created_by: auth.userId,
              } as never)
              .select("id, title")
              .maybeSingle();
            if (!ins.error && ins.data) {
              created_task = ins.data as { id: string; title: string };
            }
          }
        }

        return jsonResponse({ ok: true, row: updRes.data, created_task });
      },
    },
  },
});
