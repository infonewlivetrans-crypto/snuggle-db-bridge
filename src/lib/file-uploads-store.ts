// Локальное хранилище загруженных файлов (универсальный импорт).
// Метаданные — в localStorage, содержимое — в IndexedDB как Blob.
// Полностью клиентский модуль, без обращения к серверу.

// `xlsx` подключается лениво в местах использования.

export type SupportedFormat = "xlsx" | "xls" | "csv" | "txt" | "json" | "pdf" | "unknown";

export type UploadStatus =
  | "uploaded"        // Загружен
  | "needs_mapping"   // Ожидает настройки
  | "processed"       // Обработан
  | "error";          // Ошибка

export interface ColumnMapping {
  // системное поле -> заголовок колонки из файла (или "" — пропустить)
  client?: string;
  route?: string;
  pickup_address?: string;
  delivery_address?: string;
  cargo?: string;
  weight?: string;
  rate?: string;
  pickup_date?: string;
  delivery_date?: string;
  contact?: string;
}

export const TARGET_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: "client", label: "Клиент" },
  { key: "route", label: "Маршрут" },
  { key: "pickup_address", label: "Адрес загрузки" },
  { key: "delivery_address", label: "Адрес выгрузки" },
  { key: "cargo", label: "Груз" },
  { key: "weight", label: "Вес" },
  { key: "rate", label: "Ставка" },
  { key: "pickup_date", label: "Дата загрузки" },
  { key: "delivery_date", label: "Дата доставки" },
  { key: "contact", label: "Контакт" },
];

export interface UploadRecord {
  id: string;
  name: string;
  size: number;
  format: SupportedFormat;
  uploadedAt: string;       // ISO
  status: UploadStatus;
  rowsImported?: number;
  mapping?: ColumnMapping;
  errorMessage?: string;
}

const META_KEY = "lovable.universal_uploads.v1";
const DB_NAME = "lovable_universal_uploads";
const DB_STORE = "files";

// ---------------- format detection ----------------

export function detectFormat(file: File): SupportedFormat {
  const n = (file.name || "").toLowerCase();
  if (n.endsWith(".xlsx")) return "xlsx";
  if (n.endsWith(".xls")) return "xls";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".json")) return "json";
  if (n.endsWith(".txt")) return "txt";
  if (n.endsWith(".pdf")) return "pdf";
  const mt = (file.type || "").toLowerCase();
  if (mt.includes("pdf")) return "pdf";
  if (mt.includes("json")) return "json";
  if (mt.includes("csv")) return "csv";
  if (mt.includes("sheet") || mt.includes("excel")) return "xlsx";
  if (mt.startsWith("text/")) return "txt";
  return "unknown";
}

export const FORMAT_LABEL: Record<SupportedFormat, string> = {
  xlsx: "Excel (.xlsx)",
  xls: "Excel (.xls)",
  csv: "CSV",
  txt: "TXT",
  json: "JSON",
  pdf: "PDF",
  unknown: "Файл",
};

export const STATUS_LABEL: Record<UploadStatus, string> = {
  uploaded: "Загружен",
  needs_mapping: "Ожидает настройки",
  processed: "Обработан",
  error: "Ошибка",
};

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// ---------------- IndexedDB ----------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const r = tx.objectStore(DB_STORE).get(id);
      r.onsuccess = () => resolve((r.result as Blob | undefined) ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

async function deleteBlob(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

// ---------------- metadata ----------------

export function listUploads(): UploadRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as UploadRecord[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(items: UploadRecord[]): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(items));
  } catch {
    // quota / private mode — ignore
  }
}

export function getUpload(id: string): UploadRecord | null {
  return listUploads().find((u) => u.id === id) ?? null;
}

export function updateUpload(id: string, patch: Partial<UploadRecord>): UploadRecord | null {
  const items = listUploads();
  const idx = items.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const next = { ...items[idx], ...patch };
  items[idx] = next;
  saveAll(items);
  return next;
}

export async function removeUpload(id: string): Promise<void> {
  const items = listUploads().filter((u) => u.id !== id);
  saveAll(items);
  await deleteBlob(id);
}

export async function addUpload(file: File): Promise<UploadRecord> {
  const id = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const format = detectFormat(file);
  const status: UploadStatus =
    format === "pdf" || format === "unknown" ? "uploaded" : "needs_mapping";

  const record: UploadRecord = {
    id,
    name: file.name,
    size: file.size,
    format,
    uploadedAt: new Date().toISOString(),
    status,
  };

  try {
    await putBlob(id, file);
  } catch (e) {
    record.status = "error";
    record.errorMessage = e instanceof Error ? e.message : "Не удалось сохранить файл";
  }

  const items = listUploads();
  items.unshift(record);
  saveAll(items);
  return record;
}

// ---------------- preview ----------------

export interface TablePreview {
  kind: "table";
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface TextPreview {
  kind: "text";
  content: string;
}

export interface CardPreview {
  kind: "card";
  message: string;
}

export type FilePreview = TablePreview | TextPreview | CardPreview;

const PREVIEW_LIMIT = 20;

export async function buildPreview(record: UploadRecord): Promise<FilePreview> {
  const blob = await getBlob(record.id);
  if (!blob) {
    return { kind: "card", message: "Файл недоступен в локальном хранилище браузера." };
  }

  if (record.format === "xlsx" || record.format === "xls") {
    const XLSX = await import("xlsx");
    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { kind: "card", message: "В файле нет листов." };
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) as unknown[][];
    if (aoa.length === 0) return { kind: "card", message: "Лист пустой." };
    const headers = (aoa[0] as unknown[]).map((c) => String(c ?? ""));
    const rows = aoa.slice(1, 1 + PREVIEW_LIMIT).map((r) => headers.map((_, i) => String((r[i] ?? "")).trim()));
    return { kind: "table", headers, rows, totalRows: aoa.length - 1 };
  }

  if (record.format === "csv" || record.format === "txt") {
    const text = await blob.text();
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return { kind: "card", message: "Файл пустой." };
    // Подбираем разделитель
    const candidates = [",", ";", "\t", "|"];
    let delim = ",";
    let bestCount = 0;
    for (const d of candidates) {
      const n = (lines[0].match(new RegExp(`\\${d === "\t" ? "t" : d}`, "g")) || []).length;
      if (n > bestCount) {
        bestCount = n;
        delim = d;
      }
    }
    if (bestCount === 0 && record.format === "txt") {
      return { kind: "text", content: lines.slice(0, 40).join("\n") };
    }
    const headers = lines[0].split(delim).map((s) => s.trim());
    const rows = lines.slice(1, 1 + PREVIEW_LIMIT).map((l) => {
      const parts = l.split(delim);
      return headers.map((_, i) => (parts[i] ?? "").trim());
    });
    return { kind: "table", headers, rows, totalRows: lines.length - 1 };
  }

  if (record.format === "json") {
    const text = await blob.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
        const headers = Array.from(
          new Set(data.slice(0, PREVIEW_LIMIT).flatMap((o) => Object.keys(o as object))),
        );
        const rows = (data.slice(0, PREVIEW_LIMIT) as Record<string, unknown>[]).map((o) =>
          headers.map((h) => (o[h] === undefined || o[h] === null ? "" : String(o[h]))),
        );
        return { kind: "table", headers, rows, totalRows: data.length };
      }
      return { kind: "text", content: JSON.stringify(data, null, 2).slice(0, 4000) };
    } catch {
      return { kind: "text", content: text.slice(0, 4000) };
    }
  }

  // pdf / unknown
  return {
    kind: "card",
    message:
      record.format === "pdf"
        ? "PDF сохранён в системе. Автоматический парсинг будет настроен позже."
        : "Формат пока не поддерживается для предпросмотра. Файл сохранён.",
  };
}

// ---------------- demo import ----------------

export interface DemoOrder {
  id: string;
  client: string;
  route: string;
  pickup_address: string;
  delivery_address: string;
  cargo: string;
  weight: string;
  rate: string;
  pickup_date: string;
  delivery_date: string;
  contact: string;
  source_file: string;
  created_at: string;
}

const DEMO_KEY = "lovable.universal_uploads.demo_orders.v1";

export function listDemoOrders(): DemoOrder[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as DemoOrder[]) : [];
  } catch {
    return [];
  }
}

function saveDemoOrders(items: DemoOrder[]): void {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export async function importWithMapping(
  record: UploadRecord,
  mapping: ColumnMapping,
): Promise<{ imported: number }> {
  const preview = await buildPreview(record);
  if (preview.kind !== "table") {
    throw new Error("Импорт доступен только для табличных форматов (Excel/CSV/JSON-массив).");
  }

  // Для импорта читаем все строки заново (не только первые 20).
  const blob = await getBlob(record.id);
  if (!blob) throw new Error("Файл недоступен.");

  let headers: string[] = [];
  let dataRows: string[][] = [];

  if (record.format === "xlsx" || record.format === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) as unknown[][];
    headers = (aoa[0] as unknown[]).map((c) => String(c ?? ""));
    dataRows = aoa.slice(1).map((r) => headers.map((_, i) => String((r[i] ?? "")).trim()));
  } else if (record.format === "csv" || record.format === "txt") {
    headers = preview.headers;
    const text = await blob.text();
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const delims = [",", ";", "\t", "|"];
    const delim =
      delims.find((d) => lines[0].split(d).length === headers.length) ?? ",";
    dataRows = lines.slice(1).map((l) => {
      const parts = l.split(delim);
      return headers.map((_, i) => (parts[i] ?? "").trim());
    });
  } else if (record.format === "json") {
    const data = JSON.parse(await blob.text());
    if (!Array.isArray(data)) throw new Error("Ожидается JSON-массив объектов.");
    headers = preview.headers;
    dataRows = data.map((o) =>
      headers.map((h) => {
        const v = (o as Record<string, unknown>)[h];
        return v === undefined || v === null ? "" : String(v);
      }),
    );
  }

  const indexOf = (col?: string): number => (col ? headers.indexOf(col) : -1);
  const idx = {
    client: indexOf(mapping.client),
    route: indexOf(mapping.route),
    pickup_address: indexOf(mapping.pickup_address),
    delivery_address: indexOf(mapping.delivery_address),
    cargo: indexOf(mapping.cargo),
    weight: indexOf(mapping.weight),
    rate: indexOf(mapping.rate),
    pickup_date: indexOf(mapping.pickup_date),
    delivery_date: indexOf(mapping.delivery_date),
    contact: indexOf(mapping.contact),
  };

  const get = (row: string[], i: number) => (i >= 0 ? row[i] ?? "" : "");
  const now = new Date().toISOString();
  const created: DemoOrder[] = dataRows.map((row, i) => ({
    id: `demo_${record.id}_${i}`,
    client: get(row, idx.client),
    route: get(row, idx.route),
    pickup_address: get(row, idx.pickup_address),
    delivery_address: get(row, idx.delivery_address),
    cargo: get(row, idx.cargo),
    weight: get(row, idx.weight),
    rate: get(row, idx.rate),
    pickup_date: get(row, idx.pickup_date),
    delivery_date: get(row, idx.delivery_date),
    contact: get(row, idx.contact),
    source_file: record.name,
    created_at: now,
  }));

  const all = listDemoOrders();
  // Удаляем ранее импортированные из этого же файла
  const filtered = all.filter((o) => !o.id.startsWith(`demo_${record.id}_`));
  saveDemoOrders([...created, ...filtered]);

  updateUpload(record.id, { status: "processed", rowsImported: created.length, mapping });

  return { imported: created.length };
}

export function clearDemoOrdersFor(uploadId: string): void {
  const all = listDemoOrders().filter((o) => !o.id.startsWith(`demo_${uploadId}_`));
  saveDemoOrders(all);
}
