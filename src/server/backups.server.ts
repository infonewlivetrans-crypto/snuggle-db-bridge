import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Таблицы, входящие в резервную копию
export const BACKUP_TABLES = [
  // заказы
  "orders",
  "order_items",
  "order_history",
  "delivery_reports",
  // маршруты
  "routes",
  "route_points",
  "route_point_actions",
  "route_point_photos",
  "delivery_routes",
  // заявки на транспорт
  "transport_requests",
  // пользователи и доступ
  "profiles",
  "user_roles",
  // склад и остатки
  "warehouses",
  "products",
  "stock_movements",
  "inbound_shipments",
  // снабжение
  "supply_requests",
  "supply_in_transit",
  // импорт данных
  "data_imports",
  // отчёты
  "notifications",
  // журнал действий
  "audit_log",
] as const;

type SbAdmin = typeof supabaseAdmin;

async function dumpTable(name: string): Promise<unknown[]> {
  const PAGE = 1000;
  let from = 0;
  const all: unknown[] = [];
  // Безопасно: если таблицы нет — вернём пустой массив и зафиксируем как []
  // (но всё равно бросим ошибку, если она реальная — fail-fast по бэкапу)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (supabaseAdmin as SbAdmin)
      .from(name as never)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      // если таблицы не существует — пропустим
      if (/relation .* does not exist/i.test(error.message)) return [];
      throw new Error(`Ошибка чтения таблицы ${name}: ${error.message}`);
    }
    const rows = (data ?? []) as unknown[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export type BackupResult = {
  id: string;
  storagePath: string;
  sizeBytes: number;
  tables: Record<string, number>;
};

export async function runBackup(opts: {
  triggeredBy: string | null;
  triggeredByName: string | null;
  triggerKind: "manual" | "scheduled";
  comment: string | null;
}): Promise<BackupResult> {
  // 1) Создаём запись со статусом running
  const insertRes = await (supabaseAdmin.from("backups") as unknown as {
    insert: (row: Record<string, unknown>) => {
      select: (s: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
    };
  })
    .insert({
      status: "running",
      triggered_by: opts.triggeredBy,
      triggered_by_name: opts.triggeredByName,
      trigger_kind: opts.triggerKind,
      comment: opts.comment,
    })
    .select("id")
    .single();
  if (insertRes.error || !insertRes.data) {
    throw new Error(insertRes.error?.message ?? "Не удалось создать запись о копии");
  }
  const backupId = insertRes.data.id;

  try {
    const tables: Record<string, number> = {};
    const dump: Record<string, unknown[]> = {};
    for (const name of BACKUP_TABLES) {
      const rows = await dumpTable(name);
      dump[name] = rows;
      tables[name] = rows.length;
    }

    const payload = {
      version: 1,
      created_at: new Date().toISOString(),
      tables_count: Object.keys(dump).length,
      tables,
      data: dump,
    };
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    const sizeBytes = bytes.byteLength;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${ts}_${backupId}.json`;

    const upload = await supabaseAdmin.storage
      .from("backups")
      .upload(storagePath, bytes, {
        contentType: "application/json",
        upsert: false,
      });
    if (upload.error) throw new Error(`Загрузка в хранилище: ${upload.error.message}`);

    const upd = await (supabaseAdmin.from("backups") as unknown as {
      update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    })
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        size_bytes: sizeBytes,
        storage_path: storagePath,
        tables,
      })
      .eq("id", backupId);
    if (upd.error) throw new Error(upd.error.message);

    return { id: backupId, storagePath, sizeBytes, tables };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await (supabaseAdmin.from("backups") as unknown as {
      update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    })
      .update({ status: "error", finished_at: new Date().toISOString(), error_message: message })
      .eq("id", backupId);
    throw e;
  }
}

export async function listBackups(limit = 100) {
  const { data, error } = await (supabaseAdmin
    .from("backups") as unknown as {
      select: (s: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }> } };
    })
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    created_at: string;
    finished_at: string | null;
    status: "running" | "success" | "error";
    size_bytes: number | null;
    storage_path: string | null;
    triggered_by: string | null;
    triggered_by_name: string | null;
    trigger_kind: "manual" | "scheduled";
    comment: string | null;
    error_message: string | null;
    tables: Record<string, number> | null;
  }>;
}

export async function getBackupDownloadUrl(storagePath: string, expiresInSec = 300) {
  const { data, error } = await supabaseAdmin.storage
    .from("backups")
    .createSignedUrl(storagePath, expiresInSec);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
