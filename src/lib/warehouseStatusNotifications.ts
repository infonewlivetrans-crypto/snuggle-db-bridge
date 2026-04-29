import { supabase } from "@/integrations/supabase/client";
import {
  REQ_WH_STATUS_LABELS,
  type RequestWarehouseStatus,
} from "@/lib/requestWarehouseStatus";

/**
 * Какие статусы превращаются в уведомление и для кого они предназначены.
 * Адресаты — внутренние роли, отображаются в payload.recipients.
 */
const STATUS_NOTIFY: Partial<
  Record<
    RequestWarehouseStatus,
    {
      title: (n: string) => string;
      recipients: ("logistician" | "manager")[];
    }
  >
> = {
  shortage: {
    title: (n) => `По заявке № ${n} не хватает товара для отгрузки`,
    recipients: ["logistician"],
  },
  reserved: {
    title: (n) => `По заявке № ${n} товар зарезервирован`,
    recipients: ["logistician"],
  },
  ready: {
    title: (n) => `Заявка № ${n} готова к отгрузке`,
    recipients: ["logistician"],
  },
  loaded: {
    title: (n) => `Заявка № ${n} загружена`,
    recipients: ["logistician"],
  },
  shipped: {
    title: (n) => `Заявка № ${n} отгружена со склада`,
    recipients: ["logistician", "manager"],
  },
};

/**
 * Создаёт внутреннее уведомление при смене складского статуса заявки на транспорт.
 * Дедупликация: на каждый (заявка, статус) уведомление создаётся один раз —
 * за это отвечает уникальный индекс в transport_request_warehouse_status_log.
 */
export async function emitWarehouseStatusNotification(args: {
  requestId: string;
  status: RequestWarehouseStatus;
  routeNumber: string;
  warehouseId: string | null;
  warehouseName?: string | null;
  comment?: string | null;
}) {
  const cfg = STATUS_NOTIFY[args.status];
  if (!cfg) return;

  // Пытаемся занять уникальную пару (заявка, статус). Если уже есть — выходим.
  const { error: logErr } = await supabase
    .from("transport_request_warehouse_status_log")
    .insert({
      transport_request_id: args.requestId,
      status: args.status,
      comment: args.comment ?? null,
    });
  if (logErr) {
    // Уникальное нарушение = уведомление уже создавалось ранее — это норма.
    if ((logErr as { code?: string }).code === "23505") return;
    return;
  }

  // Пробуем достать имя склада, если не передано
  let whName = args.warehouseName ?? null;
  if (!whName && args.warehouseId) {
    const { data } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", args.warehouseId)
      .maybeSingle();
    whName = (data as { name?: string } | null)?.name ?? null;
  }

  const title = cfg.title(args.routeNumber);
  const statusLabel = REQ_WH_STATUS_LABELS[args.status];
  const bodyParts = [
    `Склад: ${whName ?? "—"}`,
    `Статус: ${statusLabel}`,
  ];
  if (args.comment && args.comment.trim().length > 0) {
    bodyParts.push(`Комментарий: ${args.comment.trim()}`);
  }

  await supabase.from("notifications").insert({
    kind: "transport_request_warehouse_status",
    title,
    body: bodyParts.join(". "),
    route_id: args.requestId,
    payload: {
      transport_request_id: args.requestId,
      route_number: args.routeNumber,
      warehouse_id: args.warehouseId,
      warehouse_name: whName,
      status: args.status,
      status_label: statusLabel,
      comment: args.comment ?? null,
      recipients: cfg.recipients,
      occurred_at: new Date().toISOString(),
    },
  });
}
