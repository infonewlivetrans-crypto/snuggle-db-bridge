import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { DEAL_STATUSES } from "@/lib/dispatcher/statuses";

// PATCH /api/dispatcher/deals/:id/status
// Stage 11.12 — централизованный переход статусов сделки.
// Сам обновляет автоматические таймстампы, payment_status, commission_status
// и идемпотентно создаёт сопутствующие задачи в dispatcher_tasks.

const ALLOWED_ROLES = ["admin", "dispatcher"];
const DEAL_TABLE = "dispatcher_deals";
const TASKS_TABLE = "dispatcher_tasks";

const schema = z.object({
  deal_status: z.enum(DEAL_STATUSES),
  comment: z.string().max(4000).optional().nullable(),
  cancel_reason: z.string().max(2000).optional().nullable(),
  customer_payment_due_date: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
  commission_due_date: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
  dispatcher_next_action: z.string().max(500).optional().nullable(),
});

// task_type, который соответствует переходу. Шаблон используется для
// idempotent создания: если по dispatcher_deal_id уже есть задача с таким
// task_type — повторно не создаём.
type TaskTpl = {
  task_type: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
};

const TASK_ON_STATUS: Record<string, TaskTpl> = {
  customer_sent: {
    task_type: "custom",
    title: "Получить подтверждение заказчика",
    description: "Дождаться подтверждения данных машины/водителя от заказчика.",
    priority: "high",
  },
  customer_confirmed: {
    task_type: "custom",
    title: "Проконтролировать загрузку",
    description: "Связаться с водителем и заказчиком, проконтролировать загрузку.",
    priority: "high",
  },
  delivered: {
    task_type: "custom",
    title: "Проконтролировать оплату заказчика",
    description: "Проследить за оплатой по сделке от заказчика.",
    priority: "high",
  },
  waiting_commission: {
    task_type: "remind_commission",
    title: "Получить комиссию перевозчика",
    description: "Связаться с перевозчиком и проконтролировать оплату комиссии.",
    priority: "high",
  },
  commission_received: {
    task_type: "custom",
    title: "Закрыть сделку",
    description: "Все этапы завершены. Закрыть сделку и подвести итог.",
    priority: "normal",
  },
};

export const Route = createFileRoute("/api/dispatcher/deals/$id/status")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

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
              error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${
                first?.message ?? ""
              }`,
            },
            { status: 400 },
          );
        }
        const d = parsed.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        // Текущее состояние — чтобы не затирать существующие таймстампы.
        const cur = await client
          .from(DEAL_TABLE)
          .select(
            "id, deal_status, payment_status, commission_status, " +
              "customer_sent_at, customer_confirmed_at, loading_started_at, " +
              "in_transit_at, unloading_started_at, delivered_at, " +
              "customer_paid_at, commission_received_at, deal_closed_at, " +
              "dispatcher_carrier_ext_id:carrier_id, " +
              "dispatcher_driver_ext_id:driver_id, " +
              "dispatcher_vehicle_ext_id:vehicle_id",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = cur.data as Record<string, unknown>;

        const now = new Date().toISOString();
        const upd: Record<string, unknown> = { deal_status: d.deal_status };

        // Только дописываем таймстамп, если он ещё не выставлен.
        const stampIfEmpty = (col: string) => {
          if (!r[col]) upd[col] = now;
        };

        switch (d.deal_status) {
          case "customer_sent":
            stampIfEmpty("customer_sent_at");
            break;
          case "customer_confirmed":
            stampIfEmpty("customer_confirmed_at");
            break;
          case "loading":
            stampIfEmpty("loading_started_at");
            break;
          case "in_transit":
            stampIfEmpty("in_transit_at");
            break;
          case "unloading":
            stampIfEmpty("unloading_started_at");
            break;
          case "delivered":
            stampIfEmpty("delivered_at");
            break;
          case "waiting_customer_payment":
          case "waiting_payment":
            upd.payment_status = "waiting_customer_payment";
            break;
          case "waiting_commission":
            upd.commission_status = "waiting_commission";
            break;
          case "commission_received":
            upd.commission_status = "commission_paid";
            stampIfEmpty("commission_received_at");
            upd.commission_paid_at = (upd.commission_received_at ?? now);
            break;
          case "closed":
            stampIfEmpty("deal_closed_at");
            break;
          case "cancelled":
            if (d.cancel_reason != null) upd.cancel_reason = d.cancel_reason;
            break;
          default:
            break;
        }

        if (d.comment != null) upd.comment = d.comment;
        if (d.customer_payment_due_date !== undefined)
          upd.customer_payment_due_date = d.customer_payment_due_date;
        if (d.commission_due_date !== undefined)
          upd.commission_due_date = d.commission_due_date;
        if (d.dispatcher_next_action !== undefined)
          upd.dispatcher_next_action = d.dispatcher_next_action;
        if (d.cancel_reason !== undefined && d.deal_status !== "cancelled")
          upd.cancel_reason = d.cancel_reason;

        const updRes = await client
          .from(DEAL_TABLE)
          .update(upd as never)
          .eq("id", params.id)
          .select(
            "id, deal_status, payment_status, commission_status, " +
              "customer_sent_at, customer_confirmed_at, loading_started_at, " +
              "in_transit_at, unloading_started_at, delivered_at, " +
              "customer_payment_due_date, customer_paid_at, " +
              "commission_due_date, commission_received_at, deal_closed_at, " +
              "cancel_reason, dispatcher_next_action, comment",
          )
          .maybeSingle();
        if (updRes.error)
          return jsonResponse({ error: updRes.error.message }, { status: 500 });

        // Идемпотентное создание задачи по переходу.
        let created_task: { id: string; title: string } | null = null;
        const tpl = TASK_ON_STATUS[d.deal_status];
        if (tpl) {
          const ex = await client
            .from(TASKS_TABLE)
            .select("id")
            .eq("dispatcher_deal_id", params.id)
            .eq("title", tpl.title)
            .limit(1);
          if ((ex.data ?? []).length === 0) {
            const ins = await client
              .from(TASKS_TABLE)
              .insert({
                task_type: tpl.task_type,
                title: tpl.title,
                description: tpl.description,
                priority: tpl.priority,
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

        return jsonResponse({ row: updRes.data, created_task });
      },
    },
  },
});
