import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ALLOWED_ROLES = ["admin", "dispatcher"];

export interface TimelineEvent {
  id: string;
  event_type: string;
  event_label: string;
  occurred_at: string;
  actor_id: string | null;
  actor_label: string | null;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string | null;
  status: string | null;
  meta?: Record<string, unknown>;
}

interface Filters {
  vehicle_id?: string | null;
  freight_id?: string | null;
  carrier_request_id?: string | null;
  deal_id?: string | null;
  carrier_id?: string | null;
  driver_id?: string | null;
}

const FREIGHT_INACTIVE = new Set([
  "taken_by_other",
  "not_actual",
  "no_answer",
  "bad_rate",
  "suspicious",
  "archived",
  "rejected",
  "cancelled",
]);

const REQUEST_STATUS_LABEL: Record<string, string> = {
  draft: "Черновик предложения",
  sent: "Предложение отправлено перевозчику",
  viewed: "Перевозчик посмотрел предложение",
  accepted: "Перевозчик принял предложение",
  declined: "Перевозчик отказался",
  cancelled: "Предложение отменено",
  archive: "Предложение в архиве",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AC = SupabaseClient<Database> | any;

async function resolveActors(
  client: AC,
  ids: Set<string>,
): Promise<Record<string, string>> {
  const arr = Array.from(ids).filter(Boolean);
  if (arr.length === 0) return {};
  const { data } = await client
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", arr);
  const map: Record<string, string> = {};
  for (const p of (data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
    map[p.user_id] = p.full_name || p.email || p.user_id.slice(0, 8);
  }
  return map;
}

async function buildEvents(
  client: AC,
  f: Filters,
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const actorIds = new Set<string>();

  // --- 1. Vehicle: taken_in_work + readiness
  if (f.vehicle_id) {
    const { data: v } = await client
      .from("dispatcher_vehicle_ext")
      .select(
        "id, dispatcher_taken_by, dispatcher_taken_at, dispatcher_work_status, load_status, current_city, ready_to_cities, ready_date, location_updated_at, ready_comment",
      )
      .eq("id", f.vehicle_id)
      .maybeSingle();
    const veh = v as Record<string, unknown> | null;
    if (veh) {
      if (veh.dispatcher_taken_at) {
        if (veh.dispatcher_taken_by) actorIds.add(veh.dispatcher_taken_by as string);
        events.push({
          id: `vehicle_taken:${veh.id}`,
          event_type: "vehicle_taken",
          event_label: "Машина взята в работу",
          occurred_at: veh.dispatcher_taken_at as string,
          actor_id: (veh.dispatcher_taken_by as string) ?? null,
          actor_label: null,
          entity_type: "vehicle",
          entity_id: veh.id as string,
          title: "Машина взята в работу",
          description: `Статус: ${veh.dispatcher_work_status ?? "—"}`,
          status: (veh.dispatcher_work_status as string) ?? null,
        });
      }
      if (veh.location_updated_at) {
        const dest = Array.isArray(veh.ready_to_cities)
          ? (veh.ready_to_cities as string[]).join(", ")
          : "";
        events.push({
          id: `vehicle_ready:${veh.id}`,
          event_type: "vehicle_ready",
          event_label: "Готовность машины обновлена",
          occurred_at: veh.location_updated_at as string,
          actor_id: null,
          actor_label: null,
          entity_type: "vehicle",
          entity_id: veh.id as string,
          title: "Готовность машины",
          description: `${veh.current_city ?? "—"}${dest ? " → " + dest : ""}${veh.ready_date ? `, с ${veh.ready_date}` : ""}${veh.ready_comment ? `. ${veh.ready_comment}` : ""}`,
          status: (veh.load_status as string) ?? null,
        });
      }
    }
  }

  // --- Resolve deal context: deal -> carrier_request -> vehicle
  let dealRow: Record<string, unknown> | null = null;
  if (f.deal_id) {
    const { data } = await client
      .from("dispatcher_deals")
      .select(
        "id, deal_number, carrier_id, vehicle_id, driver_id, carrier_request_id, main_freight_id, created_by, created_at, deal_status, customer_sent_at, customer_confirmed_at, loading_started_at, in_transit_at, unloading_started_at, delivered_at, customer_paid_at, commission_received_at, deal_closed_at, carrier_payment_received_at, commission_paid_at",
      )
      .eq("id", f.deal_id)
      .maybeSingle();
    dealRow = data as Record<string, unknown> | null;
  }

  // --- 3 + 4. Freights
  let freightQuery = client
    .from("dispatcher_freights")
    .select(
      "id, title, loading_city, unloading_city, rate, dispatcher_status, source_type, created_at, updated_at, created_by, comment, carrier_request_id, deal_id, assigned_vehicle_ext_id",
    );
  let applyFreight = false;
  if (f.freight_id) {
    freightQuery = freightQuery.eq("id", f.freight_id);
    applyFreight = true;
  } else if (f.vehicle_id) {
    freightQuery = freightQuery.eq("assigned_vehicle_ext_id", f.vehicle_id);
    applyFreight = true;
  } else if (f.carrier_request_id) {
    freightQuery = freightQuery.eq("carrier_request_id", f.carrier_request_id);
    applyFreight = true;
  } else if (f.deal_id) {
    freightQuery = freightQuery.eq("deal_id", f.deal_id);
    applyFreight = true;
  }
  if (applyFreight) {
    const { data: fr } = await freightQuery.limit(500);
    for (const row of (fr ?? []) as Record<string, unknown>[]) {
      if (row.created_by) actorIds.add(row.created_by as string);
      events.push({
        id: `freight_added:${row.id}`,
        event_type: "freight_added",
        event_label: "Груз добавлен под машину",
        occurred_at: row.created_at as string,
        actor_id: (row.created_by as string) ?? null,
        actor_label: null,
        entity_type: "freight",
        entity_id: row.id as string,
        title: (row.title as string) || `${row.loading_city ?? "—"} → ${row.unloading_city ?? "—"}`,
        description: `Источник: ${row.source_type ?? "—"}${row.rate ? `, ставка ${row.rate} ₽` : ""}`,
        status: (row.dispatcher_status as string) ?? null,
      });
      if (FREIGHT_INACTIVE.has((row.dispatcher_status as string) ?? "")) {
        events.push({
          id: `freight_inactive:${row.id}`,
          event_type: "freight_inactive",
          event_label: "Груз стал неактуальным",
          occurred_at: (row.updated_at as string) || (row.created_at as string),
          actor_id: null,
          actor_label: null,
          entity_type: "freight",
          entity_id: row.id as string,
          title: `Груз помечен: ${row.dispatcher_status}`,
          description: (row.comment as string) ?? null,
          status: (row.dispatcher_status as string) ?? null,
        });
      }
    }
  }

  // --- 5 + 6. Carrier requests
  let crQuery = client
    .from("dispatcher_carrier_requests")
    .select(
      "id, request_number, request_status, rate_amount, commission_amount, created_at, sent_at, sent_by, responded_at, responded_by, carrier_comment, dispatcher_carrier_ext_id, dispatcher_vehicle_ext_id, dispatcher_driver_ext_id, dispatcher_deal_id, updated_at",
    );
  let crApply = false;
  if (f.carrier_request_id) {
    crQuery = crQuery.eq("id", f.carrier_request_id);
    crApply = true;
  } else if (f.deal_id) {
    crQuery = crQuery.eq("dispatcher_deal_id", f.deal_id);
    crApply = true;
  } else if (f.vehicle_id) {
    crQuery = crQuery.eq("dispatcher_vehicle_ext_id", f.vehicle_id);
    crApply = true;
  } else if (f.carrier_id) {
    crQuery = crQuery.eq("dispatcher_carrier_ext_id", f.carrier_id);
    crApply = true;
  } else if (f.driver_id) {
    crQuery = crQuery.eq("dispatcher_driver_ext_id", f.driver_id);
    crApply = true;
  }
  if (crApply) {
    const { data: cr } = await crQuery.limit(200);
    for (const row of (cr ?? []) as Record<string, unknown>[]) {
      if (row.sent_by) actorIds.add(row.sent_by as string);
      if (row.responded_by) actorIds.add(row.responded_by as string);
      events.push({
        id: `cr_created:${row.id}`,
        event_type: "carrier_request_created",
        event_label: "Предложение перевозчику создано",
        occurred_at: row.created_at as string,
        actor_id: null,
        actor_label: null,
        entity_type: "carrier_request",
        entity_id: row.id as string,
        title: `Предложение №${row.request_number ?? "—"} создано`,
        description: `Ставка: ${row.rate_amount ?? "—"} ₽, комиссия: ${row.commission_amount ?? "—"} ₽`,
        status: (row.request_status as string) ?? null,
      });
      if (row.sent_at) {
        events.push({
          id: `cr_sent:${row.id}`,
          event_type: "carrier_request_sent",
          event_label: "Предложение отправлено перевозчику",
          occurred_at: row.sent_at as string,
          actor_id: (row.sent_by as string) ?? null,
          actor_label: null,
          entity_type: "carrier_request",
          entity_id: row.id as string,
          title: "Предложение отправлено",
          description: null,
          status: "sent",
        });
      }
      if (row.responded_at) {
        const st = (row.request_status as string) ?? "";
        events.push({
          id: `cr_responded:${row.id}`,
          event_type: "carrier_request_responded",
          event_label: REQUEST_STATUS_LABEL[st] ?? "Ответ перевозчика",
          occurred_at: row.responded_at as string,
          actor_id: (row.responded_by as string) ?? null,
          actor_label: null,
          entity_type: "carrier_request",
          entity_id: row.id as string,
          title: REQUEST_STATUS_LABEL[st] ?? "Ответ перевозчика",
          description: (row.carrier_comment as string) ?? null,
          status: st,
        });
      }
    }
  }

  // --- 7 + 8. Deal stages
  if (dealRow) {
    const id = dealRow.id as string;
    if (dealRow.created_by) actorIds.add(dealRow.created_by as string);
    events.push({
      id: `deal_created:${id}`,
      event_type: "deal_created",
      event_label: "Сделка создана",
      occurred_at: dealRow.created_at as string,
      actor_id: (dealRow.created_by as string) ?? null,
      actor_label: null,
      entity_type: "deal",
      entity_id: id,
      title: `Сделка ${dealRow.deal_number ?? ""} создана`,
      description: null,
      status: (dealRow.deal_status as string) ?? null,
    });
    const stages: Array<[string, string, string]> = [
      ["customer_sent_at", "deal_customer_sent", "Данные отправлены заказчику"],
      ["customer_confirmed_at", "deal_customer_confirmed", "Заказчик подтвердил"],
      ["loading_started_at", "deal_loading", "Загрузка"],
      ["in_transit_at", "deal_in_transit", "В пути"],
      ["unloading_started_at", "deal_unloading", "Выгрузка"],
      ["delivered_at", "deal_delivered", "Доставлено"],
      ["carrier_payment_received_at", "deal_carrier_paid", "Перевозчик получил оплату"],
      ["customer_paid_at", "deal_customer_paid", "Заказчик оплатил"],
      ["commission_received_at", "deal_commission_received", "Комиссия получена"],
      ["commission_paid_at", "deal_commission_paid", "Комиссия выплачена"],
      ["deal_closed_at", "deal_closed", "Сделка закрыта"],
    ];
    for (const [field, type, label] of stages) {
      const val = dealRow[field];
      if (val) {
        events.push({
          id: `${type}:${id}`,
          event_type: type,
          event_label: label,
          occurred_at: val as string,
          actor_id: null,
          actor_label: null,
          entity_type: "deal",
          entity_id: id,
          title: label,
          description: null,
          status: null,
        });
      }
    }
  }

  // --- 9. Documents (deal/freight)
  const docOwners: Array<[string, string]> = [];
  if (f.deal_id) docOwners.push(["deal", f.deal_id]);
  if (f.freight_id) docOwners.push(["freight", f.freight_id]);
  if (f.vehicle_id) docOwners.push(["vehicle", f.vehicle_id]);
  if (f.carrier_id) docOwners.push(["carrier", f.carrier_id]);
  if (f.driver_id) docOwners.push(["driver", f.driver_id]);
  for (const [ot, oid] of docOwners) {
    const { data: docs } = await client
      .from("dispatcher_documents")
      .select("id, document_type, document_status, owner_type, owner_id, uploaded_at, uploaded_by, created_at")
      .eq("owner_type", ot)
      .eq("owner_id", oid)
      .limit(200);
    for (const row of (docs ?? []) as Record<string, unknown>[]) {
      if (row.uploaded_by) actorIds.add(row.uploaded_by as string);
      events.push({
        id: `doc:${row.id}`,
        event_type: "document_uploaded",
        event_label: "Документ загружен",
        occurred_at: (row.uploaded_at as string) || (row.created_at as string),
        actor_id: (row.uploaded_by as string) ?? null,
        actor_label: null,
        entity_type: "document",
        entity_id: row.id as string,
        title: `Документ: ${row.document_type}`,
        description: `Владелец: ${row.owner_type}`,
        status: (row.document_status as string) ?? null,
      });
    }
  }

  // --- 10. Partner card sends (deal only)
  if (f.deal_id) {
    const { data: sends } = await client
      .from("dispatcher_partner_card_sends")
      .select("id, status, send_channel, recipient_email, sent_at, created_at")
      .eq("dispatcher_deal_id", f.deal_id)
      .limit(200);
    for (const row of (sends ?? []) as Record<string, unknown>[]) {
      events.push({
        id: `pcs_created:${row.id}`,
        event_type: "partner_card_created",
        event_label: "Данные заказчику сформированы",
        occurred_at: row.created_at as string,
        actor_id: null,
        actor_label: null,
        entity_type: "partner_card_send",
        entity_id: row.id as string,
        title: "Данные заказчику сформированы",
        description: `Канал: ${row.send_channel ?? "—"}`,
        status: (row.status as string) ?? null,
      });
      if (row.sent_at) {
        events.push({
          id: `pcs_sent:${row.id}`,
          event_type: "partner_card_sent",
          event_label: "Данные заказчику отправлены",
          occurred_at: row.sent_at as string,
          actor_id: null,
          actor_label: null,
          entity_type: "partner_card_send",
          entity_id: row.id as string,
          title: "Данные заказчику отправлены",
          description: `${row.send_channel ?? "—"}${row.recipient_email ? `, ${row.recipient_email}` : ""}`,
          status: (row.status as string) ?? null,
        });
      }
    }
  }

  // --- 11. Tasks
  let taskQuery = client
    .from("dispatcher_tasks")
    .select(
      "id, title, priority, task_status, created_at, completed_at, created_by, dispatcher_deal_id, dispatcher_freight_id, dispatcher_vehicle_ext_id, dispatcher_carrier_ext_id, dispatcher_driver_ext_id",
    );
  let taskApply = false;
  if (f.deal_id) {
    taskQuery = taskQuery.eq("dispatcher_deal_id", f.deal_id);
    taskApply = true;
  } else if (f.freight_id) {
    taskQuery = taskQuery.eq("dispatcher_freight_id", f.freight_id);
    taskApply = true;
  } else if (f.vehicle_id) {
    taskQuery = taskQuery.eq("dispatcher_vehicle_ext_id", f.vehicle_id);
    taskApply = true;
  } else if (f.carrier_id) {
    taskQuery = taskQuery.eq("dispatcher_carrier_ext_id", f.carrier_id);
    taskApply = true;
  } else if (f.driver_id) {
    taskQuery = taskQuery.eq("dispatcher_driver_ext_id", f.driver_id);
    taskApply = true;
  }
  if (taskApply) {
    const { data: tasks } = await taskQuery.limit(200);
    for (const row of (tasks ?? []) as Record<string, unknown>[]) {
      if (row.created_by) actorIds.add(row.created_by as string);
      events.push({
        id: `task_created:${row.id}`,
        event_type: "task_created",
        event_label: "Задача создана",
        occurred_at: row.created_at as string,
        actor_id: (row.created_by as string) ?? null,
        actor_label: null,
        entity_type: "task",
        entity_id: row.id as string,
        title: `Задача: ${row.title}`,
        description: `Приоритет: ${row.priority}`,
        status: (row.task_status as string) ?? null,
      });
      if (row.completed_at) {
        events.push({
          id: `task_done:${row.id}`,
          event_type: "task_completed",
          event_label: "Задача выполнена",
          occurred_at: row.completed_at as string,
          actor_id: null,
          actor_label: null,
          entity_type: "task",
          entity_id: row.id as string,
          title: `Задача выполнена: ${row.title}`,
          description: null,
          status: (row.task_status as string) ?? null,
        });
      }
    }
  }

  // Resolve actor labels
  const labels = await resolveActors(client, actorIds);
  for (const ev of events) {
    if (ev.actor_id && labels[ev.actor_id]) ev.actor_label = labels[ev.actor_id];
  }

  // Filter out events without dates and sort desc
  return events
    .filter((e) => !!e.occurred_at)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

export const Route = createFileRoute("/api/dispatcher/timeline")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const f: Filters = {
          vehicle_id: url.searchParams.get("vehicle_id"),
          freight_id: url.searchParams.get("freight_id"),
          carrier_request_id: url.searchParams.get("carrier_request_id"),
          deal_id: url.searchParams.get("deal_id"),
          carrier_id: url.searchParams.get("carrier_id"),
          driver_id: url.searchParams.get("driver_id"),
        };
        if (
          !f.vehicle_id &&
          !f.freight_id &&
          !f.carrier_request_id &&
          !f.deal_id &&
          !f.carrier_id &&
          !f.driver_id
        ) {
          return jsonResponse({ error: "at_least_one_filter_required" }, { status: 400 });
        }
        try {
          const rows = await buildEvents(auth.client, f);
          return jsonResponse({ ok: true, rows });
        } catch (e) {
          return jsonResponse(
            { error: e instanceof Error ? e.message : "timeline_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
