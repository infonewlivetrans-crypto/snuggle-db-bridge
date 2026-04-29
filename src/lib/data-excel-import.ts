import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ImportEntity = "orders" | "products" | "stock" | "routes" | "transport_requests";
export type ImportSource = "manual" | "excel" | "1c";

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
  example?: string | number;
}

export interface ImportSchema {
  entity: ImportEntity;
  title: string;
  description: string;
  columns: ColumnDef[];
  sheetName: string;
}

export interface ParsedRow {
  rowNumber: number; // 1-based, including header
  data: Record<string, unknown>;
  errors: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  missingColumns: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface ImportResult {
  inserted: number;
  failed: number;
  failedRows: { row: number; message: string }[];
}

// ====== Schemas ======

export const SCHEMAS: Record<ImportEntity, ImportSchema> = {
  orders: {
    entity: "orders",
    title: "Заказы",
    description: "Импорт заказов клиентов",
    sheetName: "Заказы",
    columns: [
      { key: "order_number", label: "order_number", required: true, example: "ORD-1001" },
      { key: "customer_name", label: "customer_name", example: "Иван Иванов" },
      { key: "customer_phone", label: "customer_phone", example: "+7 999 000 00 00" },
      { key: "delivery_address", label: "delivery_address", example: "г. Москва, ул. Ленина, 1" },
      { key: "coordinates", label: "coordinates", example: "55.7558,37.6173" },
      { key: "manager_name", label: "manager_name", example: "Сидоров С. С." },
      { key: "delivery_date", label: "delivery_date", example: "2026-05-01" },
      { key: "delivery_time_from", label: "delivery_time_from", example: "09:00" },
      { key: "delivery_time_to", label: "delivery_time_to", example: "18:00" },
      { key: "payment_type", label: "payment_type", example: "cash" },
      { key: "prepaid", label: "prepaid", example: 0 },
      { key: "amount_to_collect", label: "amount_to_collect", example: 5000 },
      { key: "requires_qr", label: "requires_qr", example: "no" },
      { key: "marketplace", label: "marketplace", example: "" },
      { key: "comment", label: "comment" },
    ],
  },
  products: {
    entity: "products",
    title: "Товары",
    description: "Импорт справочника товаров",
    sheetName: "Товары",
    columns: [
      { key: "product_name", label: "product_name", required: true, example: "Шуруп 50мм" },
      { key: "category", label: "category", example: "Крепёж" },
      { key: "characteristic", label: "characteristic", example: "оцинкованный" },
      { key: "weight", label: "weight", example: 0.05 },
      { key: "volume", label: "volume", example: 0.0001 },
      { key: "length", label: "length", example: 0.05 },
      { key: "width", label: "width", example: 0.005 },
      { key: "height", label: "height", example: 0.005 },
      { key: "comment", label: "comment" },
    ],
  },
  stock: {
    entity: "stock",
    title: "Остатки",
    description: "Импорт начальных остатков на склад",
    sheetName: "Остатки",
    columns: [
      { key: "warehouse", label: "warehouse", required: true, example: "Главный склад" },
      { key: "product_name", label: "product_name", required: true, example: "Шуруп 50мм" },
      { key: "available_quantity", label: "available_quantity", required: true, example: 100 },
      { key: "reserved_quantity", label: "reserved_quantity", example: 0 },
      { key: "in_transit_quantity", label: "in_transit_quantity", example: 0 },
      { key: "min_stock_level", label: "min_stock_level", example: 10 },
    ],
  },
  routes: {
    entity: "routes",
    title: "Маршруты",
    description: "Импорт плановых маршрутов",
    sheetName: "Маршруты",
    columns: [
      { key: "route_number", label: "route_number", required: true, example: "R-2026-001" },
      { key: "driver_name", label: "driver_name", example: "Петров П. П." },
      { key: "vehicle_number", label: "vehicle_number", example: "А123БВ77" },
      { key: "order_number", label: "order_number", example: "ORD-1001" },
      { key: "point_number", label: "point_number", example: 1 },
      { key: "customer_name", label: "customer_name", example: "Иван Иванов" },
      { key: "phone", label: "phone", example: "+7 999 000 00 00" },
      { key: "address", label: "address", example: "г. Москва, ул. Ленина, 1" },
      { key: "coordinates", label: "coordinates", example: "55.7558,37.6173" },
      { key: "amount_to_collect", label: "amount_to_collect", example: 5000 },
      { key: "requires_qr", label: "requires_qr", example: "no" },
      { key: "prepaid", label: "prepaid", example: 0 },
      { key: "comment", label: "comment" },
    ],
  },
  transport_requests: {
    entity: "transport_requests",
    title: "Заявки на транспорт",
    description: "Импорт заявок на транспорт",
    sheetName: "Заявки на транспорт",
    columns: [
      { key: "request_number", label: "request_number", required: true, example: "TR-001" },
      { key: "request_type", label: "request_type", example: "client_delivery" },
      { key: "warehouse_from", label: "warehouse_from", example: "Главный склад" },
      { key: "warehouse_to", label: "warehouse_to", example: "Филиал №2" },
      { key: "planned_date", label: "planned_date", required: true, example: "2026-05-01" },
      { key: "planned_time", label: "planned_time", example: "09:00" },
      { key: "order_number", label: "order_number", example: "ORD-1001" },
      { key: "product_name", label: "product_name", example: "Шуруп 50мм" },
      { key: "quantity", label: "quantity", example: 100 },
      { key: "weight", label: "weight", example: 5 },
      { key: "volume", label: "volume", example: 0.01 },
    ],
  },
};

// ====== Template download ======

export function downloadTemplate(entity: ImportEntity) {
  const schema = SCHEMAS[entity];
  const headers = schema.columns.map((c) => c.label);
  const exampleRow = schema.columns.map((c) => c.example ?? "");
  const data = [headers, exampleRow];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, schema.sheetName);
  XLSX.writeFile(wb, `template_${entity}.xlsx`);
}

// ====== Parse ======

function normalizeKey(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

export async function parseFile(file: File, entity: ImportEntity): Promise<ParseResult> {
  const schema = SCHEMAS[entity];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return { rows: [], missingColumns: schema.columns.filter(c => c.required).map(c => c.label), totalRows: 0, validRows: 0, invalidRows: 0 };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) {
    return { rows: [], missingColumns: schema.columns.filter(c => c.required).map(c => c.label), totalRows: 0, validRows: 0, invalidRows: 0 };
  }
  const headerRow = (aoa[0] as unknown[]).map((h) => normalizeKey(String(h)));
  // Map column key -> index by matching label OR key
  const colIndex: Record<string, number> = {};
  for (const col of schema.columns) {
    const labelN = normalizeKey(col.label);
    const keyN = normalizeKey(col.key);
    let idx = headerRow.findIndex((h) => h === labelN || h === keyN);
    if (idx < 0) {
      // partial match by label start
      idx = headerRow.findIndex((h) => h.startsWith(labelN.split(" ")[0]) && labelN.length > 3);
    }
    if (idx >= 0) colIndex[col.key] = idx;
  }
  const missingColumns = schema.columns
    .filter((c) => c.required && !(c.key in colIndex))
    .map((c) => c.label);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i] as unknown[];
    if (!raw || raw.every((v) => v === "" || v == null)) continue;
    const data: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const col of schema.columns) {
      const idx = colIndex[col.key];
      const val = idx != null ? raw[idx] : undefined;
      const isEmpty = val === "" || val == null;
      if (col.required && isEmpty) {
        errors.push(`Не заполнено: ${col.label}`);
      }
      data[col.key] = isEmpty ? null : val;
    }
    rows.push({ rowNumber: i + 1, data, errors });
  }
  const validRows = rows.filter((r) => r.errors.length === 0).length;
  return {
    rows,
    missingColumns,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
  };
}

// ====== Import ======

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function importParsed(
  entity: ImportEntity,
  parsed: ParseResult,
  source: ImportSource,
): Promise<ImportResult> {
  const failed: { row: number; message: string }[] = [];
  let inserted = 0;
  const valid = parsed.rows.filter((r) => r.errors.length === 0);

  // pre-fail rows with errors
  for (const r of parsed.rows.filter((x) => x.errors.length > 0)) {
    failed.push({ row: r.rowNumber, message: r.errors.join("; ") });
  }

  if (entity === "orders") {
    for (const r of valid) {
      const d = r.data;
      const payload: Record<string, unknown> = {
        order_number: str(d.order_number),
        delivery_address: str(d.delivery_address),
        contact_name: str(d.contact_name),
        contact_phone: str(d.contact_phone),
        payment_type: str(d.payment_type) ?? "cash",
        delivery_cost: num(d.delivery_cost) ?? 0,
        goods_amount: num(d.goods_amount),
        comment: str(d.comment),
        source,
      };
      const { error } = await supabase.from("orders").insert(payload as never);
      if (error) failed.push({ row: r.rowNumber, message: error.message });
      else inserted++;
    }
  } else if (entity === "products") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        name: str(d.name)!,
        sku: str(d.sku),
        unit: str(d.unit),
        weight_kg: num(d.weight_kg),
        volume_m3: num(d.volume_m3),
        category: str(d.category),
        source,
      };
      const { error } = await supabase.from("products").insert(payload as never);
      if (error) failed.push({ row: r.rowNumber, message: error.message });
      else inserted++;
    }
  } else if (entity === "stock") {
    // resolve sku -> product_id, warehouse_name -> warehouse_id
    const skus = Array.from(new Set(valid.map((r) => str(r.data.product_sku)).filter(Boolean) as string[]));
    const whNames = Array.from(new Set(valid.map((r) => str(r.data.warehouse_name)).filter(Boolean) as string[]));
    const { data: products } = await supabase.from("products").select("id, sku").in("sku", skus);
    const { data: whs } = await supabase.from("warehouses").select("id, name").in("name", whNames);
    const skuMap = new Map((products ?? []).map((p) => [p.sku, p.id]));
    const whMap = new Map((whs ?? []).map((w) => [w.name, w.id]));
    for (const r of valid) {
      const sku = str(r.data.product_sku)!;
      const whName = str(r.data.warehouse_name)!;
      const qty = num(r.data.qty);
      const productId = skuMap.get(sku);
      const warehouseId = whMap.get(whName);
      if (!productId) {
        failed.push({ row: r.rowNumber, message: `Товар с SKU "${sku}" не найден` });
        continue;
      }
      if (!warehouseId) {
        failed.push({ row: r.rowNumber, message: `Склад "${whName}" не найден` });
        continue;
      }
      if (qty == null || qty <= 0) {
        failed.push({ row: r.rowNumber, message: `Некорректное количество` });
        continue;
      }
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        warehouse_id: warehouseId,
        movement_type: "inbound",
        qty,
        reason: "excel_import",
        comment: str(r.data.comment),
        source,
      } as never);
      if (error) failed.push({ row: r.rowNumber, message: error.message });
      else inserted++;
    }
  } else if (entity === "routes") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        route_number: str(d.route_number)!,
        route_date: str(d.route_date)!,
        driver_name: str(d.driver_name),
        comment: str(d.comment),
        source,
      };
      const { error } = await supabase.from("routes").insert(payload as never);
      if (error) failed.push({ row: r.rowNumber, message: error.message });
      else inserted++;
    }
  } else if (entity === "transport_requests") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        route_number: str(d.route_number)!,
        route_date: str(d.route_date)!,
        request_type: (str(d.request_type) ?? "client_delivery") as never,
        required_capacity_kg: num(d.required_capacity_kg),
        required_volume_m3: num(d.required_volume_m3),
        transport_comment: str(d.transport_comment),
        source,
      };
      const { error } = await supabase.from("routes").insert(payload as never);
      if (error) failed.push({ row: r.rowNumber, message: error.message });
      else inserted++;
    }
  }

  return { inserted, failed: failed.length, failedRows: failed };
}
