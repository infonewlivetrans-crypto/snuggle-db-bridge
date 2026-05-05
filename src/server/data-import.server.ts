// Server-side data import: дубликаты + запись данных + журнал.
// Использует RLS-клиент пользователя (через requireAuth → auth.client).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ImportEntity =
  | "orders"
  | "products"
  | "stock"
  | "routes"
  | "transport_requests";
export type ImportSource = "manual" | "excel" | "1c";
export type DuplicateAction = "skip" | "update" | "create";

export interface DuplicateInfo {
  existingId: string;
  matchedBy: string[];
  description: string;
}

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
  duplicate?: DuplicateInfo | null;
}

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
  logId?: string;
}

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
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
function buildKey(parts: Array<unknown>): string | null {
  if (parts.some((p) => p == null || String(p).trim() === "")) return null;
  return parts.map(norm).join("||");
}

type SB = SupabaseClient<Database>;

// ───────────────────────── Duplicates ─────────────────────────
export async function detectDuplicatesServer(
  sb: SB,
  entity: ImportEntity,
  rows: ParsedRow[],
): Promise<void> {
  const valid = rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) return;

  const setDup = (key: string | null, info: DuplicateInfo) => {
    if (!key) return;
    for (const r of rows) {
      if (rowKey(entity, r) === key) r.duplicate = info;
    }
  };

  if (entity === "orders") {
    const vals = Array.from(
      new Set(valid.map((r) => str(r.data.order_number)).filter(Boolean) as string[]),
    );
    if (!vals.length) return;
    const { data } = await sb.from("orders").select("id, order_number").in("order_number", vals);
    for (const d of (data ?? []) as Array<{ id: string; order_number: string }>) {
      setDup(buildKey([d.order_number]), {
        existingId: d.id,
        matchedBy: ["order_number"],
        description: `order_number=${d.order_number}`,
      });
    }
  } else if (entity === "products") {
    const names = Array.from(
      new Set(valid.map((r) => str(r.data.product_name)).filter(Boolean) as string[]),
    );
    if (!names.length) return;
    const { data } = await sb.from("products").select("id, name").in("name", names);
    for (const d of (data ?? []) as Array<{ id: string; name: string }>) {
      setDup(buildKey([d.name]), {
        existingId: d.id,
        matchedBy: ["product_name"],
        description: d.name,
      });
    }
  } else if (entity === "stock") {
    const names = Array.from(
      new Set(valid.map((r) => str(r.data.product_name)).filter(Boolean) as string[]),
    );
    const whs = Array.from(
      new Set(valid.map((r) => str(r.data.warehouse)).filter(Boolean) as string[]),
    );
    if (!names.length || !whs.length) return;
    const { data: prods } = await sb.from("products").select("id, name").in("name", names);
    const { data: whRows } = await sb.from("warehouses").select("id, name").in("name", whs);
    const prodMap = new Map((prods ?? []).map((p) => [p.id, p.name]));
    const whMap = new Map((whRows ?? []).map((w) => [w.id, w.name]));
    if (!prodMap.size || !whMap.size) return;
    const { data: moves } = await sb
      .from("stock_movements")
      .select("id, product_id, warehouse_id")
      .in("product_id", Array.from(prodMap.keys()))
      .in("warehouse_id", Array.from(whMap.keys()))
      .limit(2000);
    for (const m of (moves ?? []) as Array<{ id: string; product_id: string; warehouse_id: string }>) {
      const pname = prodMap.get(m.product_id);
      const wname = whMap.get(m.warehouse_id);
      if (!pname || !wname) continue;
      setDup(buildKey([wname, pname]), {
        existingId: m.id,
        matchedBy: ["warehouse", "product_name"],
        description: `${wname} / ${pname}`,
      });
    }
  } else if (entity === "routes" || entity === "transport_requests") {
    const field = entity === "routes" ? "route_number" : "request_number";
    const nums = Array.from(
      new Set(valid.map((r) => str(r.data[field])).filter(Boolean) as string[]),
    );
    if (!nums.length) return;
    const { data } = await sb.from("routes").select("id, route_number").in("route_number", nums);
    for (const d of (data ?? []) as Array<{ id: string; route_number: string }>) {
      if (entity === "routes") {
        for (const r of valid) {
          if (str(r.data.route_number) === d.route_number) {
            setDup(buildKey([d.route_number, r.data.order_number ?? ""]), {
              existingId: d.id,
              matchedBy: ["route_number"],
              description: `route_number=${d.route_number}`,
            });
          }
        }
      } else {
        setDup(buildKey([d.route_number]), {
          existingId: d.id,
          matchedBy: ["request_number"],
          description: `request_number=${d.route_number}`,
        });
      }
    }
  }
}

function rowKey(entity: ImportEntity, r: ParsedRow): string | null {
  switch (entity) {
    case "orders":
      return buildKey([r.data.order_number]);
    case "products":
      return buildKey([r.data.product_name]);
    case "stock":
      return buildKey([r.data.warehouse, r.data.product_name]);
    case "routes":
      return buildKey([r.data.route_number, r.data.order_number ?? ""]);
    case "transport_requests":
      return buildKey([r.data.request_number]);
  }
}

// ───────────────────────── Import ─────────────────────────
export async function importParsedServer(
  sb: SB,
  entity: ImportEntity,
  parsed: ParseResult,
  source: ImportSource,
  meta: {
    fileName?: string | null;
    importedBy?: string | null;
    duplicateAction?: DuplicateAction;
    fileFormat?: string | null;
  } = {},
): Promise<ImportResult> {
  const duplicateAction: DuplicateAction = meta.duplicateAction ?? "skip";
  const failed: { row: number; message: string; raw?: Record<string, unknown>; matchedId?: string | null }[] = [];
  const insertedLog: { row: number; raw: Record<string, unknown> }[] = [];
  const updatedLog: { row: number; raw: Record<string, unknown>; matchedId: string }[] = [];
  const skippedLog: { row: number; raw: Record<string, unknown>; matchedId: string }[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  for (const r of parsed.rows.filter((x) => x.errors.length > 0)) {
    failed.push({ row: r.rowNumber, message: r.errors.join("; "), raw: r.data });
  }

  const recOk = (r: ParsedRow) => { inserted++; insertedLog.push({ row: r.rowNumber, raw: r.data }); };
  const recUpd = (r: ParsedRow, id: string) => { updated++; updatedLog.push({ row: r.rowNumber, raw: r.data, matchedId: id }); };
  const recSkip = (r: ParsedRow, id: string) => { skipped++; skippedLog.push({ row: r.rowNumber, raw: r.data, matchedId: id }); };
  const recFail = (r: ParsedRow, msg: string, matchedId?: string | null) => {
    failed.push({ row: r.rowNumber, message: msg, raw: r.data, matchedId: matchedId ?? null });
  };

  const handleRow = async (
    r: ParsedRow,
    insertOp: () => Promise<{ error: { message: string } | null }>,
    updateOp: ((id: string) => Promise<{ error: { message: string } | null }>) | null,
  ) => {
    const dup = r.duplicate;
    if (dup) {
      if (duplicateAction === "skip") return recSkip(r, dup.existingId);
      if (duplicateAction === "update") {
        if (!updateOp) return recFail(r, "Обновление не поддерживается", dup.existingId);
        const { error } = await updateOp(dup.existingId);
        if (error) recFail(r, error.message, dup.existingId);
        else recUpd(r, dup.existingId);
        return;
      }
    }
    const { error } = await insertOp();
    if (error) recFail(r, error.message);
    else recOk(r);
  };

  if (entity === "orders") {
    for (const r of valid) {
      const d = r.data;
      let lat: number | null = null, lon: number | null = null;
      const coordRaw = str(d.coordinates);
      if (coordRaw) {
        const parts = coordRaw.split(/[,;\s]+/).map((p) => parseFloat(p.replace(",", ".")));
        if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          lat = parts[0]; lon = parts[1];
        }
      }
      const extras: string[] = [];
      if (str(d.manager_name)) extras.push(`Менеджер: ${str(d.manager_name)}`);
      if (str(d.delivery_date)) extras.push(`Дата: ${str(d.delivery_date)}`);
      if (str(d.delivery_time_from) || str(d.delivery_time_to))
        extras.push(`Окно: ${str(d.delivery_time_from) ?? "?"}–${str(d.delivery_time_to) ?? "?"}`);
      if (num(d.prepaid)) extras.push(`Предоплата: ${num(d.prepaid)}`);
      const fullComment = [str(d.comment), ...extras].filter(Boolean).join(" | ") || null;

      const payload: Record<string, unknown> = {
        order_number: str(d.order_number),
        delivery_address: str(d.delivery_address),
        contact_name: str(d.customer_name),
        contact_phone: str(d.customer_phone),
        latitude: lat,
        longitude: lon,
        amount_due: num(d.amount_to_collect),
        payment_type: str(d.payment_type) ?? "cash",
        requires_qr: ["yes", "true", "1", "да"].includes(String(d.requires_qr ?? "").toLowerCase()),
        marketplace: str(d.marketplace),
        comment: fullComment,
        delivery_cost: 0,
        delivery_cost_source: "auto",
        source,
      };
      await handleRow(
        r,
        async () => await sb.from("orders").insert(payload as never),
        async (id) => await sb.from("orders").update(payload as never).eq("id", id),
      );
    }
  } else if (entity === "products") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        name: str(d.product_name)!,
        category: str(d.category),
        weight_kg: num(d.weight),
        volume_m3: num(d.volume),
        source,
      };
      await handleRow(
        r,
        async () => await sb.from("products").insert(payload as never),
        async (id) => await sb.from("products").update(payload as never).eq("id", id),
      );
    }
  } else if (entity === "stock") {
    const names = Array.from(new Set(valid.map((r) => str(r.data.product_name)).filter(Boolean) as string[]));
    const whNames = Array.from(new Set(valid.map((r) => str(r.data.warehouse)).filter(Boolean) as string[]));
    const { data: products } = names.length
      ? await sb.from("products").select("id, name").in("name", names)
      : { data: [] as Array<{ id: string; name: string }> };
    const { data: whs } = whNames.length
      ? await sb.from("warehouses").select("id, name").in("name", whNames)
      : { data: [] as Array<{ id: string; name: string }> };
    const prodMap = new Map((products ?? []).map((p) => [p.name, p.id]));
    const whMap = new Map((whs ?? []).map((w) => [w.name, w.id]));
    for (const r of valid) {
      const name = str(r.data.product_name)!;
      const whName = str(r.data.warehouse)!;
      const qty = num(r.data.available_quantity);
      const productId = prodMap.get(name);
      const warehouseId = whMap.get(whName);
      if (!productId) { recFail(r, `Товар "${name}" не найден`); continue; }
      if (!warehouseId) { recFail(r, `Склад "${whName}" не найден`); continue; }
      if (qty == null || qty <= 0) { recFail(r, `Некорректное количество`); continue; }
      if (r.duplicate && duplicateAction === "skip") { recSkip(r, r.duplicate.existingId); continue; }
      const { error } = await sb.from("stock_movements").insert({
        product_id: productId,
        warehouse_id: warehouseId,
        movement_type: "inbound",
        qty,
        reason: r.duplicate && duplicateAction === "update" ? "excel_correction" : "excel_import",
        source,
      } as never);
      if (error) recFail(r, error.message);
      else if (r.duplicate && duplicateAction === "update") recUpd(r, r.duplicate.existingId);
      else recOk(r);
    }
  } else if (entity === "routes") {
    for (const r of valid) {
      const d = r.data;
      const extras: string[] = [];
      if (str(d.driver_name)) extras.push(`Водитель: ${str(d.driver_name)}`);
      if (str(d.vehicle_number)) extras.push(`ТС: ${str(d.vehicle_number)}`);
      const payload = {
        route_number: str(d.route_number)!,
        driver_name: str(d.driver_name),
        comment: [str(d.comment), ...extras].filter(Boolean).join(" | ") || null,
        source,
      };
      await handleRow(
        r,
        async () => await sb.from("routes").insert(payload as never),
        async (id) => await sb.from("routes").update(payload as never).eq("id", id),
      );
    }
  } else if (entity === "transport_requests") {
    for (const r of valid) {
      const d = r.data;
      const payload = {
        route_number: str(d.request_number)!,
        route_date: str(d.planned_date) ?? new Date().toISOString().slice(0, 10),
        request_type: str(d.request_type) ?? "client_delivery",
        transport_comment:
          `${str(d.warehouse_from) ?? ""} → ${str(d.warehouse_to) ?? ""} ${str(d.planned_time) ?? ""}`.trim(),
        source,
      };
      await handleRow(
        r,
        async () => await sb.from("routes").insert(payload as never),
        async (id) => await sb.from("routes").update(payload as never).eq("id", id),
      );
    }
  }

  // Журнал
  let logId: string | undefined;
  try {
    const totalRows = parsed.totalRows;
    let status: "loaded" | "partial" | "error" = "loaded";
    if (inserted + updated + skipped === 0 && failed.length > 0) status = "error";
    else if (failed.length > 0) status = "partial";

    const { data: logRow } = await sb
      .from("import_logs")
      .insert({
        entity,
        file_name: meta.fileName ?? null,
        file_format: meta.fileFormat ?? "xlsx",
        source,
        imported_by: meta.importedBy ?? null,
        total_rows: totalRows,
        inserted_rows: inserted,
        failed_rows: failed.length,
        updated_rows: updated,
        skipped_rows: skipped,
        duplicate_rows: parsed.duplicateRows ?? 0,
        duplicate_action: duplicateAction,
        status,
      } as never)
      .select("id")
      .single();
    if (logRow) {
      logId = (logRow as { id: string }).id;
      const rowsPayload = [
        ...insertedLog.map((s) => ({
          import_log_id: logId, row_number: s.row, status: "inserted",
          error_message: null, raw_data: s.raw, matched_existing_id: null,
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
        await sb.from("import_log_rows").insert(rowsPayload as never);
      }
    }
  } catch {
    /* logging failures must not break import */
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
