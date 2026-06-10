import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const ALLOWED_ROLES = ["admin", "dispatcher"];
const REQ_TABLE = "dispatcher_carrier_requests";
const TASKS_TABLE = "dispatcher_tasks";

// Стандартный набор задач после принятия заявки/создания сделки.
// task_type ограничен check-constraint'ом dispatcher_task_type_chk —
// используем только разрешённые значения.
const TEMPLATE: Array<{
  task_type: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
}> = [
  {
    task_type: "check_documents",
    title: "Проверить документы перевозчика",
    description: "Проверить актуальность документов перевозчика, водителя и транспорта.",
    priority: "high",
  },
  {
    task_type: "call_driver",
    title: "Подтвердить водителя",
    description: "Связаться с водителем, подтвердить готовность к рейсу.",
    priority: "normal",
  },
  {
    task_type: "call_carrier",
    title: "Подтвердить транспорт",
    description: "Подтвердить с перевозчиком назначенный транспорт.",
    priority: "normal",
  },
  {
    task_type: "custom",
    title: "Отправить карточку заказчику",
    description: "Сформировать и отправить заказчику карточку партнёра.",
    priority: "high",
  },
  {
    task_type: "custom",
    title: "Получить подтверждение заказчика",
    description: "Дождаться подтверждения карточки партнёра от заказчика.",
    priority: "normal",
  },
  {
    task_type: "remind_commission",
    title: "Проконтролировать оплату комиссии",
    description: "Отследить оплату клиентом и поступление комиссии диспетчеру.",
    priority: "normal",
  },
];

export const Route = createFileRoute("/api/dispatcher/carrier-requests/$id/create-tasks")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        const cur = await client
          .from(REQ_TABLE)
          .select(
            "id, request_number, dispatcher_deal_id, dispatcher_carrier_ext_id, " +
              "dispatcher_driver_ext_id, dispatcher_vehicle_ext_id",
          )
          .eq("id", params.id)
          .maybeSingle();
        if (!cur.data) return jsonResponse({ error: "not_found" }, { status: 404 });
        const r = cur.data as Record<string, unknown>;

        const dealId = (r.dispatcher_deal_id as string | null) ?? null;
        const carrierExtId = (r.dispatcher_carrier_ext_id as string | null) ?? null;
        const driverExtId = (r.dispatcher_driver_ext_id as string | null) ?? null;
        const vehicleExtId = (r.dispatcher_vehicle_ext_id as string | null) ?? null;
        const reqNum = (r.request_number as string | null) ?? params.id.slice(0, 8);

        const rows = TEMPLATE.map((t) => ({
          task_type: t.task_type,
          title: t.title,
          description: `${t.description}\n(Заявка ${reqNum})`,
          priority: t.priority,
          task_status: "open",
          related_entity_type: dealId ? "deal" : "carrier",
          related_entity_id: dealId ?? carrierExtId,
          dispatcher_deal_id: dealId,
          dispatcher_carrier_ext_id: carrierExtId,
          dispatcher_driver_ext_id: driverExtId,
          dispatcher_vehicle_ext_id: vehicleExtId,
          action_url: dealId ? `/dispatcher/deals` : `/dispatcher/carriers`,
          created_by: auth.userId,
        }));

        const ins = await client.from(TASKS_TABLE).insert(rows as never).select("id, title");
        if (ins.error) return jsonResponse({ error: ins.error.message }, { status: 500 });
        return jsonResponse(
          { rows: ins.data ?? [], total: ins.data?.length ?? 0 },
          { status: 201 },
        );
      },
    },
  },
});
