import { supabase } from "@/integrations/supabase/client";

/**
 * Внутренние уведомления для отдела снабжения.
 * Дедупликация — через таблицу supply_notification_log с уникальными индексами.
 * При нарушении уникальности (код 23505) считаем, что уведомление уже было.
 */

const KIND = "supply_alert";

async function logOnce(args: {
  event_type: "low_stock" | "shortage" | "supply_request_created";
  warehouse_id?: string | null;
  product_id?: string | null;
  transport_request_id?: string | null;
  supply_request_id?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from("supply_notification_log").insert({
    event_type: args.event_type,
    warehouse_id: args.warehouse_id ?? null,
    product_id: args.product_id ?? null,
    transport_request_id: args.transport_request_id ?? null,
    supply_request_id: args.supply_request_id ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return false;
    return false;
  }
  return true;
}

/** 1. Остаток на складе ниже минимального */
export async function notifyLowStock(args: {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  available: number;
  minStock: number;
  unit?: string | null;
}) {
  const created = await logOnce({
    event_type: "low_stock",
    warehouse_id: args.warehouseId,
    product_id: args.productId,
  });
  if (!created) return;

  const unit = args.unit ?? "";
  const title = `На складе ${args.warehouseName} заканчивается товар: ${args.productName}`;
  const body = `Доступно: ${args.available} ${unit}. Минимальный остаток: ${args.minStock} ${unit}.`;

  await supabase.from("notifications").insert({
    kind: KIND,
    title,
    body,
    payload: {
      reason: "low_stock",
      warehouse_id: args.warehouseId,
      warehouse_name: args.warehouseName,
      product_id: args.productId,
      product_name: args.productName,
      available: args.available,
      min_stock: args.minStock,
      recipients: ["supply"],
      occurred_at: new Date().toISOString(),
    },
  });
}

/** 2. Не хватает товара под заявку на транспорт */
export async function notifyShortageForRequest(args: {
  transportRequestId: string;
  routeNumber: string;
  warehouseId: string | null;
  warehouseName: string | null;
  productId: string;
  productName: string;
  deficit: number;
  unit?: string | null;
}) {
  const created = await logOnce({
    event_type: "shortage",
    transport_request_id: args.transportRequestId,
    product_id: args.productId,
    warehouse_id: args.warehouseId,
  });
  if (!created) return;

  const unit = args.unit ?? "";
  const title = `Не хватает товара под заявку № ${args.routeNumber}`;
  const body = `Товар: ${args.productName}. Дефицит: ${args.deficit} ${unit}.`;

  await supabase.from("notifications").insert({
    kind: KIND,
    title,
    body,
    route_id: args.transportRequestId,
    payload: {
      reason: "shortage",
      transport_request_id: args.transportRequestId,
      route_number: args.routeNumber,
      warehouse_id: args.warehouseId,
      warehouse_name: args.warehouseName,
      product_id: args.productId,
      product_name: args.productName,
      deficit: args.deficit,
      recipients: ["supply"],
      occurred_at: new Date().toISOString(),
    },
  });
}

/** 3. Создана заявка на пополнение */
export async function notifySupplyRequestCreated(args: {
  supplyRequestId: string;
  requestNumber: string;
  warehouseId: string | null;
  warehouseName: string | null;
  productId: string | null;
  productName: string | null;
  qty: number;
  unit?: string | null;
  transportRequestId?: string | null;
  routeNumber?: string | null;
}) {
  const created = await logOnce({
    event_type: "supply_request_created",
    supply_request_id: args.supplyRequestId,
    warehouse_id: args.warehouseId,
    product_id: args.productId,
    transport_request_id: args.transportRequestId ?? null,
  });
  if (!created) return;

  const title = `Создана заявка на пополнение № ${args.requestNumber}`;
  const parts = [
    args.warehouseName ? `Склад: ${args.warehouseName}` : null,
    args.productName ? `Товар: ${args.productName}` : null,
    `Количество: ${args.qty} ${args.unit ?? ""}`,
    args.routeNumber ? `Связанная заявка: № ${args.routeNumber}` : null,
  ].filter(Boolean);

  await supabase.from("notifications").insert({
    kind: KIND,
    title,
    body: parts.join(". "),
    route_id: args.transportRequestId ?? null,
    payload: {
      reason: "supply_request_created",
      supply_request_id: args.supplyRequestId,
      request_number: args.requestNumber,
      warehouse_id: args.warehouseId,
      warehouse_name: args.warehouseName,
      product_id: args.productId,
      product_name: args.productName,
      qty: args.qty,
      transport_request_id: args.transportRequestId ?? null,
      route_number: args.routeNumber ?? null,
      recipients: ["supply"],
      occurred_at: new Date().toISOString(),
    },
  });
}
