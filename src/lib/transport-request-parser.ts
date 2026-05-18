/**
 * Парсер файла «Заявка на транспорт» из 1С (xlsx).
 *
 * Файл представляет собой одиночную заявку (а не маршрутный лист со
 * списком заказов). Структура от поставщика к поставщику меняется,
 * поэтому извлекаем поля «по подписям»: для каждого ярлыка ищем ячейку
 * справа или снизу. Всё, что не легло в типизированные поля, сохраняем
 * в `raw` (плоский Record<label, value>).
 */

export type ParsedTransportRequest = {
  requestNumber: string | null;
  requestDate: string | null; // ISO yyyy-mm-dd
  loadingDate: string | null; // ISO
  loadingTime: string | null; // HH:MM
  loadingAddress: string | null;
  unloadingAddress: string | null;
  shipper: string | null;
  consignee: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  cargoDescription: string | null;
  weightKg: number | null;
  volumeM3: number | null;
  placesCount: number | null;
  vehicleRequirements: string | null;
  carrier: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  comment: string | null;
  organization: string | null;
  orderNumbers: string[]; // обнаруженные КП_...
  raw: Record<string, string>; // label → value, для аудита
  warnings: string[];
};

type Aoa = unknown[][];

function norm(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const cleaned = String(v).replace(/[\s\u00A0]/g, "").replace(/,/g, ".");
  const lastDot = cleaned.lastIndexOf(".");
  let s = cleaned;
  if (lastDot >= 0 && cleaned.indexOf(".") !== lastDot) {
    s = cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function parseTime(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = m[1].padStart(2, "0");
  return `${h}:${m[2]}`;
}

/** Ищет ячейку справа от подписи; если справа пусто — берёт ячейку снизу. */
function findByLabel(grid: Aoa, patterns: RegExp[]): { value: string | null; label: string | null } {
  const max = Math.min(grid.length, 200);
  for (let r = 0; r < max; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c]);
      if (!cell) continue;
      const matched = patterns.find((p) => p.test(cell));
      if (!matched) continue;
      const labelText = str(row[c]);
      // справа
      for (let cc = c + 1; cc < row.length; cc++) {
        const v = str(row[cc]);
        if (v && norm(v) !== cell) return { value: v, label: labelText };
      }
      // снизу
      const below = grid[r + 1] ?? [];
      const v2 = str(below[c]);
      if (v2) return { value: v2, label: labelText };
    }
  }
  return { value: null, label: null };
}

/** Все совпадающие подписи — для raw. */
function collectAllByLabel(grid: Aoa, patterns: RegExp[]): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const max = Math.min(grid.length, 400);
  for (let r = 0; r < max; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c]);
      if (!cell) continue;
      if (!patterns.some((p) => p.test(cell))) continue;
      const labelText = str(row[c]);
      let val: string | null = null;
      for (let cc = c + 1; cc < row.length; cc++) {
        const v = str(row[cc]);
        if (v && norm(v) !== cell) { val = v; break; }
      }
      if (!val) {
        const below = grid[r + 1] ?? [];
        val = str(below[c]);
      }
      if (labelText && val) out.push({ label: labelText, value: val });
    }
  }
  return out;
}

const LABELS = {
  requestNumber: [/^заявка(\s+на\s+транспорт)?\s*№/i, /^№\s*заявки/i, /номер\s+заявки/i],
  requestDate: [/^дата\s+заявки/i, /дата\s+создания/i],
  loadingDate: [/дата\s+погрузк/i, /дата\s+загрузк/i, /дата\s+отгрузк/i],
  loadingTime: [/время\s+погрузк/i, /время\s+загрузк/i, /время\s+отгрузк/i],
  loadingAddress: [/адрес\s+погрузк/i, /место\s+погрузк/i, /пункт\s+погрузк/i, /адрес\s+загрузк/i],
  unloadingAddress: [/адрес\s+выгрузк/i, /адрес\s+доставк/i, /место\s+выгрузк/i, /пункт\s+выгрузк/i, /адрес\s+разгрузк/i],
  shipper: [/грузоотправител/i, /отправител/i],
  consignee: [/грузополучател/i, /получател/i],
  contactPerson: [/контактн(ое|ый)\s+лиц/i, /^контакт/i, /контактн(ое|ый)\s+ф/i],
  contactPhone: [/телефон\s+контакт/i, /^телефон$/i, /^тел\.?$/i, /контактн.*телефон/i],
  cargoDescription: [/^груз$/i, /наименование\s+груза/i, /описание\s+груза/i, /характер\s+груза/i],
  weight: [/^вес/i, /^масса/i, /вес\s*,?\s*кг/i, /вес\s+груза/i],
  volume: [/^объ[её]м/i, /объ[её]м\s*,?\s*м/i, /объ[её]м\s+груза/i],
  places: [/кол-?во\s+мест/i, /количество\s+мест/i, /^мест/i],
  vehicleReq: [/требовани.*тс/i, /требования\s+к\s+(машин|автомоб|транспорт)/i, /тип\s+кузова/i, /тип\s+тс/i],
  carrier: [/^перевозчик/i],
  driverName: [/водитель.*ф[иp]/i, /^водитель$/i, /ф[иp]о\s+водител/i],
  driverPhone: [/телефон\s+водител/i, /^тел\.?\s+водител/i],
  vehiclePlate: [/гос\.?\s*ном/i, /номер\s+тс/i, /номер\s+(автомобил|машин)/i, /^автомобиль$/i],
  comment: [/^комментар/i, /^примечан/i, /^доп\.?\s+информ/i],
  organization: [/^организац/i, /^заказчик\s*:?$/i],
};

/**
 * Принимает строку, претендующую на название организации, и возвращает её
 * только если она похожа на нормальное название компании.
 * Отсеивает фрагменты договорных условий, штрафов, требований и т.п.,
 * которые в 1С-выгрузках часто оказываются в той же ячейке/рядом.
 */
function sanitizeOrganization(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > 160) return null;
  // Слова, типичные для пунктов договора/условий — точно не имя организации.
  const banned = /(штраф|сутки|просто[яй]|уплачив|обязуется|неустойк|пеня|пени|ответствен|сверхнормат|претензи|расторж|настоящ(его|ему)|договор|услов|порядок|оплат[аы]|тариф|нормат)/i;
  if (banned.test(s)) return null;
  // Слишком "литературный" текст: длинная фраза с несколькими предложениями.
  if (/[.!?]\s+[А-ЯЁA-Z]/.test(s)) return null;
  // Должно быть похоже на короткое название (1-8 слов).
  const words = s.split(/\s+/);
  if (words.length > 10) return null;
  return s;
}

export async function parseTransportRequestXlsx(file: File): Promise<ParsedTransportRequest> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Файл не содержит листов");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as Aoa;

  const warnings: string[] = [];

  // Номер заявки: сначала из заголовка «Заявка на транспорт № 000003855»
  let requestNumber: string | null = null;
  let requestDate: string | null = null;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r] ?? [];
    for (const cell of row) {
      const s = str(cell);
      if (!s) continue;
      const m = s.match(/заявк[аи]\s+на\s+транспорт\s*№?\s*([\w\-/]+)(?:\s+от\s+(\d{2}\.\d{2}\.\d{4}))?/i);
      if (m) {
        requestNumber = requestNumber ?? m[1];
        requestDate = requestDate ?? (m[2] ? parseDate(m[2]) : null);
      }
    }
  }

  const pick = (key: keyof typeof LABELS) => findByLabel(grid, LABELS[key]);

  if (!requestNumber) {
    const v = pick("requestNumber").value;
    if (v) requestNumber = v.replace(/^№\s*/i, "").trim();
  }
  if (!requestDate) requestDate = parseDate(pick("requestDate").value);

  const loadingDate = parseDate(pick("loadingDate").value);
  const loadingTime = parseTime(pick("loadingTime").value);
  const loadingAddress = pick("loadingAddress").value;
  const unloadingAddress = pick("unloadingAddress").value;
  const shipper = pick("shipper").value;
  const consignee = pick("consignee").value;
  const contactPerson = pick("contactPerson").value;
  const contactPhone = pick("contactPhone").value;
  const cargoDescription = pick("cargoDescription").value;
  const weightKg = parseNumber(pick("weight").value);
  const volumeM3 = parseNumber(pick("volume").value);
  const placesCount = parseNumber(pick("places").value);
  const vehicleRequirements = pick("vehicleReq").value;
  const carrier = pick("carrier").value;
  const driverName = pick("driverName").value;
  const driverPhone = pick("driverPhone").value;
  const vehiclePlate = pick("vehiclePlate").value;
  const comment = pick("comment").value;
  const organization = pick("organization").value;

  // КП_...  по всему файлу
  const orderSet = new Set<string>();
  for (const row of grid) {
    for (const cell of row ?? []) {
      const s = str(cell);
      if (!s) continue;
      const re = /\b(КП[_\-][A-ZА-Я0-9_]+)/giu;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) orderSet.add(m[1].toUpperCase());
    }
  }

  // raw: сохраняем все известные подписи + значения для аудита
  const raw: Record<string, string> = {};
  for (const patterns of Object.values(LABELS)) {
    for (const { label, value } of collectAllByLabel(grid, patterns)) {
      const key = label.replace(/\s+/g, " ").trim();
      if (!raw[key]) raw[key] = value;
    }
  }

  if (!requestNumber) warnings.push("Не распознан номер заявки");
  if (!loadingAddress) warnings.push("Не распознан адрес погрузки");
  if (!unloadingAddress) warnings.push("Не распознан адрес выгрузки");
  if (!loadingDate) warnings.push("Не распознана дата погрузки");

  return {
    requestNumber,
    requestDate,
    loadingDate,
    loadingTime,
    loadingAddress,
    unloadingAddress,
    shipper,
    consignee,
    contactPerson,
    contactPhone,
    cargoDescription,
    weightKg,
    volumeM3,
    placesCount,
    vehicleRequirements,
    carrier,
    driverName,
    driverPhone,
    vehiclePlate,
    comment,
    organization,
    orderNumbers: Array.from(orderSet),
    raw,
    warnings,
  };
}
