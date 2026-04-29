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
  duplicate?: DuplicateInfo | null;
}

export interface DuplicateInfo {
  existingId: string;
  matchedBy: string[]; // column keys used as the match
  description: string; // short human description, e.g. order_number=ORD-1
}

export type DuplicateAction = "skip" | "update" | "create";

export interface ParseResult {
  rows: ParsedRow[];
  missingColumns: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  newRows: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  duplicates: number;
  duplicateAction: DuplicateAction;
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

function emptyResult(missingColumns: string[]): ParseResult {
  return { rows: [], missingColumns, totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0, newRows: 0 };
}

export async function parseFile(file: File, entity: ImportEntity): Promise<ParseResult> {
  const schema = SCHEMAS[entity];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return emptyResult(schema.columns.filter(c => c.required).map(c => c.label));
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) {
    return emptyResult(schema.columns.filter(c => c.required).map(c => c.label));
  }
  const headerRow = (aoa[0] as unknown[]).map((h) => normalizeKey(String(h)));
  const colIndex: Record<string, number> = {};
  for (const col of schema.columns) {
    const labelN = normalizeKey(col.label);
    const keyN = normalizeKey(col.key);
    let idx = headerRow.findIndex((h) => h === labelN || h === keyN);
    if (idx < 0) {
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
    rows.push({ rowNumber: i + 1, data, errors, duplicate: null });
  }

  // Detect duplicates against existing data
  await detectDuplicates(entity, rows);

  const validRows = rows.filter((r) => r.errors.length === 0).length;
  const duplicateRows = rows.filter((r) => r.duplicate).length;
  const newRows = rows.filter((r) => r.errors.length === 0 && !r.duplicate).length;
  return {
    rows,
    missingColumns,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    duplicateRows,
    newRows,
  };
}

// ====== Duplicate detection ======

interface DuplicateMatcher {
  keys: string[]; // columns from data row used as match
  fetch: (rows: ParsedRow[]) => Promise<Map<string, DuplicateInfo>>;
  rowKey: (row: ParsedRow) => string | null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function buildKey(parts: Array<unknown>): string | null {
  if (parts.some((p) => p == null || String(p).trim() === "")) return null;
  return parts.map(norm).join("||");
}

async function detectDuplicates(entity: ImportEntity, rows: ParsedRow[]): Promise<void> {
  const matcher = getMatcher(entity);
  if (!matcher) return;
  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) return;
  const map = await matcher.fetch(validRows);
  for (const r of rows) {
    const k = matcher.rowKey(r);
    if (k && map.has(k)) {
      r.duplicate = map.get(k)!;
    }
  }
}

function getMatcher(entity: ImportEntity): DuplicateMatcher | null {
  if (entity === "orders") {
    return {
      keys: ["order_number"],
      rowKey: (r) => buildKey([r.data.order_number]),
      fetch: async (rows) => {
        const vals = Array.from(new Set(rows.map((r) => str(r.data.order_number)).filter(Boolean) as string[]));
        const map = new Map<string, DuplicateInfo>();
        if (vals.length === 0) return map;
        const { data } = await supabase.from("orders").select("id, order_number").in("order_number", vals);
        for (const d of data ?? []) {
          const k = buildKey([d.order_number]);
          if (k) map.set(k, { existingId: d.id, matchedBy: ["order_number"], description: `order_number=${d.order_number}` });
        }
        return map;
      },
    };
  }
  if (entity === "products") {
    return {
      keys: ["product_name"],
      rowKey: (r) => buildKey([r.data.product_name]),
      fetch: async (rows) => {
        const names = Array.from(new Set(rows.map((r) => str(r.data.product_name)).filter(Boolean) as string[]));
        const map = new Map<string, DuplicateInfo>();
        if (names.length === 0) return map;
        const { data } = await supabase.from("products").select("id, name").in("name", names);
        for (const d of (data ?? []) as Array<{ id: string; name: string }>) {
          const k = buildKey([d.name]);
          if (k) map.set(k, { existingId: d.id, matchedBy: ["product_name"], description: d.name });
        }
        return map;
      },
    };
  }
  if (entity === "stock") {
    return {
      keys: ["warehouse", "product_name"],
      rowKey: (r) => buildKey([r.data.warehouse, r.data.product_name]),
      fetch: async (rows) => {
        const names = Array.from(new Set(rows.map((r) => str(r.data.product_name)).filter(Boolean) as string[]));
        const whs = Array.from(new Set(rows.map((r) => str(r.data.warehouse)).filter(Boolean) as string[]));
        const map = new Map<string, DuplicateInfo>();
        if (names.length === 0 || whs.length === 0) return map;
        // Existing inbound stock_movements with these product+warehouse already imply existing balance
        const { data: prods } = await supabase.from("products").select("id, name").in("name", names);
        const { data: whRows } = await supabase.from("warehouses").select("id, name").in("name", whs);
        const prodMap = new Map((prods ?? []).map((p) => [p.id, p.name]));
        const whMap = new Map((whRows ?? []).map((w) => [w.id, w.name]));
        const prodIds = Array.from(prodMap.keys());
        const whIds = Array.from(whMap.keys());
        if (prodIds.length === 0 || whIds.length === 0) return map;
        const { data: moves } = await supabase
          .from("stock_movements")
          .select("id, product_id, warehouse_id")
          .in("product_id", prodIds)
          .in("warehouse_id", whIds)
          .limit(2000);
        for (const m of (moves ?? []) as Array<{ id: string; product_id: string; warehouse_id: string }>) {
          const pname = prodMap.get(m.product_id);
          const wname = whMap.get(m.warehouse_id);
          if (!pname || !wname) continue;
          const k = buildKey([wname, pname]);
          if (k && !map.has(k)) {
            map.set(k, { existingId: m.id, matchedBy: ["warehouse", "product_name"], description: `${wname} / ${pname}` });
          }
        }
        return map;
      },
    };
  }
  if (entity === "routes") {
    return {
      keys: ["route_number", "order_number"],
      rowKey: (r) => buildKey([r.data.route_number, r.data.order_number ?? ""]),
      fetch: async (rows) => {
        const nums = Array.from(new Set(rows.map((r) => str(r.data.route_number)).filter(Boolean) as string[]));
        const map = new Map<string, DuplicateInfo>();
        if (nums.length === 0) return map;
        const { data } = await supabase.from("routes").select("id, route_number").in("route_number", nums);
        for (const d of (data ?? []) as Array<{ id: string; route_number: string }>) {
          // Match all rows with same route_number regardless of order_number value
          for (const r of rows) {
            if (str(r.data.route_number) === d.route_number) {
              const k = buildKey([d.route_number, r.data.order_number ?? ""]);
              if (k) map.set(k, { existingId: d.id, matchedBy: ["route_number"], description: `route_number=${d.route_number}` });
            }
          }
        }
        return map;
      },
    };
  }
  if (entity === "transport_requests") {
    return {
      keys: ["request_number"],
      rowKey: (r) => buildKey([r.data.request_number]),
      fetch: async (rows) => {
        const nums = Array.from(new Set(rows.map((r) => str(r.data.request_number)).filter(Boolean) as string[]));
        const map = new Map<string, DuplicateInfo>();
        if (nums.length === 0) return map;
        const { data } = await supabase.from("routes").select("id, route_number").in("route_number", nums);
        for (const d of (data ?? []) as Array<{ id: string; route_number: string }>) {
          const k = buildKey([d.route_number]);
          if (k) map.set(k, { existingId: d.id, matchedBy: ["request_number"], description: `request_number=${d.route_number}` });
        }
        return map;
      },
    };
  }
  return null;
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
  meta?: { fileName?: string | null; importedBy?: string | null; duplicateAction?: DuplicateAction },
): Promise<ImportResult & { logId?: string }> {
  const duplicateAction: DuplicateAction = meta?.duplicateAction ?? "skip";
  const failed: { row: number; message: string; raw?: Record<string, unknown>; matchedId?: string | null }[] = [];
  const insertedLog: { row: number; raw: Record<string, unknown>; matchedId?: string | null }[] = [];
  const updatedLog: { row: number; raw: Record<string, unknown>; matchedId: string }[] = [];
  const skippedLog: { row: number; raw: Record<string, unknown>; matchedId: string }[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const valid = parsed.rows.filter((r) => r.errors.length === 0);

  for (const r of parsed.rows.filter((x) => x.errors.length > 0)) {
    failed.push({ row: r.rowNumber, message: r.errors.join("; "), raw: r.data });
  }

  const recordOk = (r: ParsedRow) => { inserted++; insertedLog.push({ row: r.rowNumber, raw: r.data }); };
  const recordUpdated = (r: ParsedRow, id: string) => { updated++; updatedLog.push({ row: r.rowNumber, raw: r.data, matchedId: id }); };
  const recordSkipped = (r: ParsedRow, id: string) => { skipped++; skippedLog.push({ row: r.rowNumber, raw: r.data, matchedId: id }); };
  const recordFail = (r: ParsedRow, msg: string, matchedId?: string | null) => {
    failed.push({ row: r.rowNumber, message: msg, raw: r.data, matchedId: matchedId ?? null });
  };

  // Helpers per entity to build payload + perform DB op
  const handleRow = async (
    r: ParsedRow,
    insertOp: () => Promise<{ error: { message: string } | null }>,
    updateOp: ((id: string) => Promise<{ error: { message: string } | null }>) | null,
  ) => {
    const dup = r.duplicate;
    if (dup) {
      if (duplicateAction === "skip") { recordSkipped(r, dup.existingId); return; }
      if (duplicateAction === "update") {
        if (!updateOp) { recordFail(r, "Обновление не поддерживается для этого типа", dup.existingId); return; }
        const { error } = await updateOp(dup.existingId);
        if (error) recordFail(r, error.message, dup.existingId);
        else recordUpdated(r, dup.existingId);
        return;
      }
      // create — fall through to insertOp
    }
    const { error } = await insertOp();
    if (error) recordFail(r, error.message);
    else recordOk(r);
  };

  if (entity === "orders") {
    for (const r of valid) {
      const d = r.data;
      const payload: Record<string, unknown> = {
        order_number: str(d.order_number),
        delivery_address: str(d.delivery_address),
        contact_name: str(d.customer_name),
        contact_phone: str(d.customer_phone),
        manager_name: str(d.manager_name),
        delivery_date: str(d.delivery_date),
        delivery_time_from: str(d.delivery_time_from),
        delivery_time_to: str(d.delivery_time_to),
        coordinates: str(d.coordinates),
        payment_type: str(d.payment_type) ?? "cash",
        prepaid: num(d.prepaid) ?? 0,
        amount_to_collect: num(d.amount_to_collect),
        requires_qr: ["yes", "true", "1", "да"].includes(String(d.requires_qr ?? "").toLowerCase()),
        marketplace: str(d.marketplace),
        comment: str(d.comment),
        source,
      };
      await handleRow(
        r,
        () => supabase.from("orders").insert(payload as never),
        (id) => supabase.from("orders").update(payload as never).eq("id", id),
      );
    }
  } else if (entity === "products") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        name: str(d.product_name)!,
        category: str(d.category),
        characteristic: str(d.characteristic),
        weight_kg: num(d.weight),
        volume_m3: num(d.volume),
        length_m: num(d.length),
        width_m: num(d.width),
        height_m: num(d.height),
        comment: str(d.comment),
        source,
      };
      await handleRow(
        r,
        () => supabase.from("products").insert(payload as never),
        (id) => supabase.from("products").update(payload as never).eq("id", id),
      );
    }
  } else if (entity === "stock") {
    const names = Array.from(new Set(valid.map((r) => str(r.data.product_name)).filter(Boolean) as string[]));
    const whNames = Array.from(new Set(valid.map((r) => str(r.data.warehouse)).filter(Boolean) as string[]));
    const { data: products } = await supabase.from("products").select("id, name").in("name", names);
    const { data: whs } = await supabase.from("warehouses").select("id, name").in("name", whNames);
    const prodMap = new Map((products ?? []).map((p) => [p.name, p.id]));
    const whMap = new Map((whs ?? []).map((w) => [w.name, w.id]));
    for (const r of valid) {
      const name = str(r.data.product_name)!;
      const whName = str(r.data.warehouse)!;
      const qty = num(r.data.available_quantity);
      const productId = prodMap.get(name);
      const warehouseId = whMap.get(whName);
      if (!productId) { recordFail(r, `Товар "${name}" не найден`); continue; }
      if (!warehouseId) { recordFail(r, `Склад "${whName}" не найден`); continue; }
      if (qty == null || qty <= 0) { recordFail(r, `Некорректное количество`); continue; }
      // For stock balances, an "update" means correction adjustment — we still insert a movement
      // but skip it when duplicate + action=skip.
      if (r.duplicate && duplicateAction === "skip") { recordSkipped(r, r.duplicate.existingId); continue; }
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        warehouse_id: warehouseId,
        movement_type: "inbound",
        qty,
        reason: r.duplicate && duplicateAction === "update" ? "excel_correction" : "excel_import",
        source,
      } as never);
      if (error) recordFail(r, error.message);
      else if (r.duplicate && duplicateAction === "update") recordUpdated(r, r.duplicate.existingId);
      else recordOk(r);
    }
  } else if (entity === "routes") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        route_number: str(d.route_number)!,
        driver_name: str(d.driver_name),
        vehicle_number: str(d.vehicle_number),
        comment: str(d.comment),
        source,
      };
      await handleRow(
        r,
        () => supabase.from("routes").insert(payload as never),
        (id) => supabase.from("routes").update(payload as never).eq("id", id),
      );
    }
  } else if (entity === "transport_requests") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        route_number: str(d.request_number)!,
        route_date: str(d.planned_date)!,
        request_type: (str(d.request_type) ?? "client_delivery") as never,
        transport_comment: `${str(d.warehouse_from) ?? ""} → ${str(d.warehouse_to) ?? ""} ${str(d.planned_time) ?? ""}`.trim(),
        source,
      };
      await handleRow(
        r,
        () => supabase.from("routes").insert(payload as never),
        (id) => supabase.from("routes").update(payload as never).eq("id", id),
      );
    }
  }

  // Write import log
  let logId: string | undefined;
  try {
    const totalRows = parsed.totalRows;
    const failedCount = failed.length;
    const duplicatesFound = parsed.duplicateRows ?? 0;
    let status: "loaded" | "partial" | "error" = "loaded";
    if (inserted + updated + skipped === 0 && failedCount > 0) status = "error";
    else if (failedCount > 0) status = "partial";

    const { data: logRow, error: logErr } = await supabase
      .from("import_logs")
      .insert({
        entity,
        file_name: meta?.fileName ?? null,
        source,
        imported_by: meta?.importedBy ?? null,
        total_rows: totalRows,
        inserted_rows: inserted,
        failed_rows: failedCount,
        updated_rows: updated,
        skipped_rows: skipped,
        duplicate_rows: duplicatesFound,
        duplicate_action: duplicateAction,
        status,
      } as never)
      .select("id")
      .single();
    if (!logErr && logRow) {
      logId = (logRow as { id: string }).id;
      const rowsPayload = [
        ...insertedLog.map((s) => ({
          import_log_id: logId, row_number: s.row, status: "inserted",
          error_message: null, raw_data: s.raw, matched_existing_id: s.matchedId ?? null,
        })),
        ...updatedLog.map((s) => ({
          import_log_id: logId, row_number: s.row, status: "updated",
          error_message: null, raw_data: s.raw, matched_existing_id: s.matchedId,
        })),
        ...skippedLog.map((s) => ({
          import_log_id: logId, row_number: s.row, status: "skipped",
          error_message: null, raw_data: s.raw, matched_existing_id: s.matchedId,
        })),
        ...failed.map((f) => ({
          import_log_id: logId, row_number: f.row, status: "failed",
          error_message: f.message, raw_data: f.raw ?? {}, matched_existing_id: f.matchedId ?? null,
        })),
      ];
      if (rowsPayload.length > 0) {
        await supabase.from("import_log_rows").insert(rowsPayload as never);
      }
    }
  } catch {
    // logging failures should not break the import
  }

  return {
    inserted,
    updated,
    skipped,
    failed: failed.length,
    duplicates: parsed.duplicateRows ?? 0,
    duplicateAction,
    failedRows: failed.map((f) => ({ row: f.row, message: f.message })),
    logId,
  };
}
