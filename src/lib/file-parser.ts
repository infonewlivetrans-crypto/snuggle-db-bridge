// Универсальный парсер файлов: xlsx/xls/csv/txt/json → таблица для предпросмотра.
// Тяжёлые библиотеки подгружаются лениво.

export type ParsedTable = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  rawRows: unknown[][]; // включая заголовки
  format: "xlsx" | "csv" | "txt" | "json";
};

function detectFormat(file: File): ParsedTable["format"] | "unknown" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".txt")) return "txt";
  return "unknown";
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectCsvSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", "\t", ",", "|"];
  let best = ",";
  let bestCount = -1;
  for (const s of candidates) {
    const c = firstLine.split(s).length;
    if (c > bestCount) {
      bestCount = c;
      best = s;
    }
  }
  return best;
}

function parseCsv(text: string): { headers: string[]; rawRows: unknown[][] } {
  const sep = detectCsvSeparator(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rawRows: [] };
  const rows = lines.map((l) => splitCsvLine(l, sep));
  const headers = rows[0].map((h, i) => String(h || `col_${i + 1}`));
  return { headers, rawRows: rows };
}

export async function parseFile(file: File): Promise<ParsedTable> {
  const fmt = detectFormat(file);
  if (fmt === "unknown") {
    throw new Error("Неподдерживаемый формат. Используйте .xlsx, .xls, .csv, .txt или .json");
  }

  if (fmt === "xlsx") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error("Файл не содержит листов");
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (aoa.length === 0) return { headers: [], rows: [], rawRows: [], format: fmt };
    const headers = (aoa[0] as unknown[]).map((h, i) => String(h ?? `col_${i + 1}`));
    const rows = aoa.slice(1).map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = (r as unknown[])[i] ?? "";
      });
      return obj;
    });
    return { headers, rows, rawRows: aoa as unknown[][], format: fmt };
  }

  if (fmt === "csv" || fmt === "txt") {
    const text = await file.text();
    const { headers, rawRows } = parseCsv(text);
    const rows = rawRows.slice(1).map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
    return { headers, rows, rawRows, format: fmt };
  }

  // JSON: ожидаем массив объектов или {data: [...]}
  const text = await file.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Невалидный JSON");
  }
  let arr: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) arr = payload as Record<string, unknown>[];
  else if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    arr = (payload as { data: Record<string, unknown>[] }).data;
  } else {
    throw new Error("JSON должен быть массивом объектов или {data: [...]}");
  }
  const headers = Array.from(
    arr.reduce<Set<string>>((acc, row) => {
      if (row && typeof row === "object") Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set()),
  );
  const rawRows: unknown[][] = [headers, ...arr.map((r) => headers.map((h) => r?.[h] ?? ""))];
  return { headers, rows: arr, rawRows, format: "json" };
}

// Канонические поля заявки → подсказки автосопоставления
export const TARGET_FIELDS = [
  { key: "order_number", label: "Номер заказа", aliases: ["номер", "номер заказа", "order", "order_number", "№"] },
  { key: "contact_name", label: "Клиент / контакт", aliases: ["клиент", "контакт", "имя", "получатель", "name", "contact"] },
  { key: "contact_phone", label: "Телефон", aliases: ["телефон", "тел", "phone", "мобильный"] },
  { key: "delivery_address", label: "Адрес выгрузки", aliases: ["адрес", "адрес выгрузки", "address", "выгрузка", "точка выгрузки"] },
  { key: "pickup_address", label: "Адрес загрузки", aliases: ["адрес загрузки", "загрузка", "откуда", "склад", "pickup"] },
  { key: "goods", label: "Груз", aliases: ["груз", "товар", "наименование", "cargo", "goods"] },
  { key: "total_weight_kg", label: "Вес, кг", aliases: ["вес", "вес кг", "weight", "масса", "кг"] },
  { key: "total_volume_m3", label: "Объём, м³", aliases: ["объём", "объем", "volume", "м3", "куб"] },
  { key: "goods_amount", label: "Сумма / ставка", aliases: ["сумма", "ставка", "amount", "стоимость", "цена"] },
  { key: "pickup_date", label: "Дата загрузки", aliases: ["дата загрузки", "дата", "date_pickup"] },
  { key: "delivery_date", label: "Дата доставки", aliases: ["дата доставки", "delivery_date"] },
  { key: "comment", label: "Комментарий", aliases: ["комментарий", "коммент", "примечание", "comment", "note"] },
] as const;

export type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

export function autoMap(headers: string[]): Record<TargetKey, string | null> {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[._-]+/g, " ");
  const result = {} as Record<TargetKey, string | null>;
  for (const f of TARGET_FIELDS) {
    const aliases = f.aliases.map(norm);
    const found = headers.find((h) => {
      const n = norm(h);
      return aliases.some((a) => n === a || n.includes(a));
    });
    result[f.key] = found ?? null;
  }
  return result;
}
