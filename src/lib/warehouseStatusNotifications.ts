import { apiPost, apiGetAuth } from "@/lib/api-client";
import {
  REQ_WH_STATUS_LABELS,
  type RequestWarehouseStatus,
} from "@/lib/requestWarehouseStatus";

/**
 * Какие статусы превращаются в уведомление и для кого они предназначены.
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
  shortage: { title: (n) => `По заявке № ${n} не хватает товара для отгрузки`, recipients: ["logistician"] },
  reserved: { title: (n) => `По заявке № ${n} товар зарезервирован`, recipients: ["logistician"] },
  ready: { title: (n) => `Заявка № ${n} готова к отгрузке`, recipients: ["logistician"] },
  loaded: { title: (n) => `Заявка № ${n} загружена`, recipients: ["logistician"] },
  shipped: { title: (n) => `Заявка № ${n} отгружена со склада`, recipients: ["logistician", "manager"] },
};

/**
 * Создаёт внутреннее уведомление при смене складского статуса заявки.
 * Дедупликация по (заявка, статус) — на сервере, через /api/warehouse-status-alerts.
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

  let whName = args.warehouseName ?? null;
  if (!whName && args.warehouseId) {
    try {
      const wh = await apiGetAuth<{ name?: string | null }>(
        `/api/warehouses/${args.warehouseId}`,
      );
      whName = wh?.name ?? null;
    } catch {
      /* не блокируем уведомление */
    }
  }

  const title = cfg.title(args.routeNumber);
  const statusLabel = REQ_WH_STATUS_LABELS[args.status];
  const bodyParts = [`Склад: ${whName ?? "—"}`, `Статус: ${statusLabel}`];
  if (args.comment && args.comment.trim().length > 0) {
    bodyParts.push(`Комментарий: ${args.comment.trim()}`);
  }

  try {
    await apiPost("/api/warehouse-status-alerts", {
      transport_request_id: args.requestId,
      status: args.status,
      comment: args.comment ?? null,
      title,
      body: bodyParts.join(". "),
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
  } catch {
    /* дедупликация/ошибки — игнор, лог на сервере */
  }
}
