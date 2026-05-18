import { apiPost } from "@/lib/api-client";

/**
 * Внутренние уведомления для отдела снабжения.
 * Дедупликация и вставка делаются на сервере (/api/supply-alerts),
 * чтобы убрать direct browser→Supabase REST.
 */

async function send(payload: {
  event_type: "low_stock" | "shortage" | "supply_request_created";
  warehouse_id?: string | null;
  product_id?: string | null;
  transport_request_id?: string | null;
  supply_request_id?: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  route_id?: string | null;
}) {
  try {
    await apiPost("/api/supply-alerts", payload);
  } catch {
    // не блокируем UX
  }
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
  const unit = args.unit ?? "";
  await send({
    event_type: "low_stock",
    warehouse_id: args.warehouseId,
    product_id: args.productId,
    title: `На складе ${args.warehouseName} заканчивается товар: ${args.productName}`,
    body: `Доступно: ${args.available} ${unit}. Минимальный остаток: ${args.minStock} ${unit}.`,
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
  const unit = args.unit ?? "";
  await send({
    event_type: "shortage",
    transport_request_id: args.transportRequestId,
    product_id: args.productId,
    warehouse_id: args.warehouseId,
    route_id: args.transportRequestId,
    title: `Не хватает товара под заявку № ${args.routeNumber}`,
    body: `Товар: ${args.productName}. Дефицит: ${args.deficit} ${unit}.`,
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
  const parts = [
    args.warehouseName ? `Склад: ${args.warehouseName}` : null,
    args.productName ? `Товар: ${args.productName}` : null,
    `Количество: ${args.qty} ${args.unit ?? ""}`,
    args.routeNumber ? `Связанная заявка: № ${args.routeNumber}` : null,
  ].filter(Boolean) as string[];

  await send({
    event_type: "supply_request_created",
    supply_request_id: args.supplyRequestId,
    warehouse_id: args.warehouseId,
    product_id: args.productId,
    transport_request_id: args.transportRequestId ?? null,
    route_id: args.transportRequestId ?? null,
    title: `Создана заявка на пополнение № ${args.requestNumber}`,
    body: parts.join(". "),
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
