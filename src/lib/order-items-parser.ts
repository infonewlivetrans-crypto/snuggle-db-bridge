// Парсер товарного состава заказов.
// Поддерживает:
//  - вставку текста (структура из 1С: блоки строк с разделителями
//    «Заказ покупателя КП_ЮФ_02740 от 13.05.2026 0:00:00»);
//  - Excel/CSV (.xlsx, .xls, .csv) — те же колонки, но в табличном виде.
//
// Возвращает группировку товарных строк по нормализованному номеру заказа
// (КП_ЮФ_02740, КП_КРА01950 и т.п.) + список не разобранных строк и сводку.

export type ParsedItem = {
  /** Порядковый номер строки в исходном файле/тексте (для подсветки). */
  sourceLine: number;
  /** Номер строки заказа внутри документа («1», «2.1» и т.п.), если был. */
  lineNumber: number | null;
  /** Наименование товара. Если плохо разобран — здесь raw_text. */
  nomenclature: string;
  /** Цвет / характеристика / вариант. */
  characteristic: string | null;
  /** Например «Новый». */
  quality: string | null;
  /** Единица измерения («шт», «м», «кг» …). */
  unit: string | null;
  /** Количество. */
  qty: number | null;
  /** Вес, кг (если удалось распарсить). */
  weight_kg: number | null;
  /** Объём, м3 (если удалось). */
  volume_m3: number | null;
  /** Комментарий, если был. */
  comment: string | null;
  /** Исходный текст строки/строк блока. */
  raw_text: string;
  /** true — наименование/количество/единица плохо распарсены. */
  needsReview: boolean;
};

export type OrderItemsParseResult = {
  byOrderNumber: Record<string, ParsedItem[]>;
  totals: {
    orders: number;
    items: number;
    needsReview: number;
  };
  unassignedLines: number; // строки до первого маркера «Заказ покупателя …»
  warnings: string[];
};

const ORDER_MARKER =
  /Заказ\s+покупателя\s+([A-ZА-Я0-9_./-]+(?:_?\d+)?)\s+от\s+(\d{2}\.\d{2}\.\d{4})/i;

const UNIT_RE =
  /^(шт|м|м2|м²|м3|м³|кг|т|компл|компл\.|упак|пог\.м|пог\.\s*м|погм|л|мл)$/i;

const QUALITY_RE = /^(нов(?:ый|ая|ое)?|б\/?у|восст(?:ановленн)?)$/i;

const NUMBER_RE = /^-?\d+(?:[.,]\d+)?$/;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v)
    .replace(/[\u00A0\s]/g, "")
    .replace(",", ".");
  if (!NUMBER_RE.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Нормализация номера заказа из текста: «КП_ЮФ_02740», «КП_КРА01950». */
export function normalizeOrderNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  return s;
}

/**
 * Разобрать «блок» строк (от одного маркера «Заказ покупателя …» до
 * следующего) в массив товарных позиций.
 *
 * Стратегия: строки группируются «по карточкам товара». Карточка обычно
 * состоит из нескольких подряд идущих строк:
 *   [номер строки]
 *   наименование (может быть длинным)
 *   характеристика / цвет
 *   Новый
 *   шт
 *   45            <- может быть вес/объём
 *   1,000         <- количество
 *
 * Мы накапливаем буфер; как только встречаем число + следующую строку-маркер
 * (новый «номер строки» или конец блока) — карточка закрывается.
 */
function parseBlockLines(lines: string[], startSourceLine: number): ParsedItem[] {
  type Buf = {
    sourceLine: number;
    lineNumber: number | null;
    nameParts: string[];
    characteristic: string | null;
    quality: string | null;
    unit: string | null;
    numbers: number[]; // подряд идущие числа (вес/объём/qty)
    raw: string[];
  };
  const items: ParsedItem[] = [];
  let buf: Buf | null = null;

  const flush = () => {
    if (!buf) return;
    const raw_text = buf.raw.join("\n");
    const name = buf.nameParts.join(" ").trim();
    // qty — последнее число в карточке, как в примере (1,000)
    const qty = buf.numbers.length > 0 ? buf.numbers[buf.numbers.length - 1] : null;
    // вес/объём — первое из «больших» чисел перед qty
    const head = buf.numbers.slice(0, -1);
    const weight = head.length > 0 ? head[head.length - 1] : null;
    const volume = head.length > 1 ? head[0] : null;
    const needsReview = !name || qty == null || !buf.unit;
    items.push({
      sourceLine: buf.sourceLine,
      lineNumber: buf.lineNumber,
      nomenclature: name || raw_text.slice(0, 240),
      characteristic: buf.characteristic,
      quality: buf.quality,
      unit: buf.unit,
      qty,
      weight_kg: weight,
      volume_m3: volume,
      comment: null,
      raw_text,
      needsReview,
    });
    buf = null;
  };

  const startNew = (sourceLine: number, lineNumber: number | null, raw: string) => {
    buf = {
      sourceLine,
      lineNumber,
      nameParts: [],
      characteristic: null,
      quality: null,
      unit: null,
      numbers: [],
      raw: [raw],
    };
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const s = raw.trim();
    if (!s) continue;
    const srcLine = startSourceLine + i;

    // Новый «номер строки» — целое число в начале карточки.
    // Должен иметь высокий приоритет: если текущий буфер уже накопил
    // хотя бы одно число → закрываем его и начинаем новый.
    if (/^\d{1,4}(?:\.\d+)?$/.test(s)) {
      const prev = buf as Buf | null;
      if (prev && prev.numbers.length > 0 && prev.unit) {
        flush();
      }
      const cur = buf as Buf | null;
      if (!cur) {
        const ln = parseInt(s.split(".")[0], 10);
        startNew(srcLine, Number.isFinite(ln) ? ln : null, raw);
        continue;
      }
      // если буфер пустой по числам — это, скорее всего, вес/qty
      const n = num(s);
      if (n != null) {
        cur.numbers.push(n);
        cur.raw.push(raw);
        continue;
      }
    }

    if (!buf) startNew(srcLine, null, raw);
    buf!.raw.push(raw);

    if (QUALITY_RE.test(s)) {
      buf!.quality = s;
      continue;
    }
    if (UNIT_RE.test(s)) {
      buf!.unit = s.toLowerCase();
      continue;
    }
    const n = num(s);
    if (n != null) {
      buf!.numbers.push(n);
      continue;
    }
    // Прочий текст: первая длинная строка — наименование; следующая
    // короткая (не число, не unit) — характеристика.
    if (buf!.nameParts.length === 0) {
      buf!.nameParts.push(s);
    } else if (!buf!.characteristic && s.length <= 120) {
      buf!.characteristic = s;
    } else {
      // дописываем в наименование
      buf!.nameParts.push(s);
    }
  }
  flush();
  return items;
}

/**
 * Попытка разобрать «табличную» строку, вставленную из 1С/Excel:
 *   12␉A02. Арочная … 20*20/0,8мм␉Новый␉шт␉60␉5,000␉Заказ покупателя КП_КРА01938 от 14.05.2026 12:51:56
 * Разделители — табы или 2+ пробела. Маркер заказа может быть в конце той же
 * строки или отсутствовать (тогда берётся текущий контекст).
 */
function tryParseTableRow(
  line: string,
): { item: ParsedItem; orderNumber: string | null } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(/\t+|\s{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 5) return null;
  if (!/^\d{1,4}$/.test(parts[0])) return null;

  // Маркер заказа в одном из последних полей
  let orderNumber: string | null = null;
  const working = [...parts];
  for (let i = working.length - 1; i >= 1; i--) {
    const m = working[i].match(ORDER_MARKER);
    if (m) {
      orderNumber = normalizeOrderNumber(m[1]);
      working.splice(i, 1);
      break;
    }
  }

  // Ищем единицу измерения
  const unitIdx = working.findIndex((p, i) => i >= 1 && UNIT_RE.test(p));
  if (unitIdx < 1) return null;
  const unit = working[unitIdx].toLowerCase();

  // Качество — между наименованием и единицей
  let quality: string | null = null;
  let qualityIdx = -1;
  for (let i = unitIdx - 1; i >= 1; i--) {
    if (QUALITY_RE.test(working[i])) {
      quality = working[i];
      qualityIdx = i;
      break;
    }
  }

  const nameEnd = qualityIdx > 0 ? qualityIdx : unitIdx;
  const name = working.slice(1, nameEnd).join(" ").trim();
  if (!name) return null;

  // Числа после единицы
  const nums: number[] = [];
  for (let i = unitIdx + 1; i < working.length; i++) {
    const n = num(working[i]);
    if (n != null) nums.push(n);
  }
  if (nums.length === 0) return null;

  const qty = nums[nums.length - 1];
  const weight = nums.length > 1 ? nums[nums.length - 2] : null;
  const volume = nums.length > 2 ? nums[0] : null;
  const lineNumber = parseInt(parts[0], 10);

  return {
    orderNumber,
    item: {
      sourceLine: 0,
      lineNumber: Number.isFinite(lineNumber) ? lineNumber : null,
      nomenclature: name,
      characteristic: null,
      quality,
      unit,
      qty,
      weight_kg: weight,
      volume_m3: volume,
      comment: null,
      raw_text: line,
      needsReview: false,
    },
  };
}

/** Парсинг свободного текста. */
export function parseOrderItemsText(text: string): OrderItemsParseResult {
  const byOrderNumber: Record<string, ParsedItem[]> = {};
  const warnings: string[] = [];
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");

  // === Пред-проход: вытаскиваем «табличные» строки из 1С/Excel ===
  // Маркер заказа может быть на отдельной строке выше или в той же строке.
  let currentOrder: string | null = null;
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const tab = tryParseTableRow(line);
    if (tab) {
      if (tab.orderNumber) currentOrder = tab.orderNumber;
      const orderKey = currentOrder;
      if (orderKey) {
        tab.item.sourceLine = i + 1;
        if (!byOrderNumber[orderKey]) byOrderNumber[orderKey] = [];
        byOrderNumber[orderKey].push(tab.item);
        lines.push(""); // строка «израсходована»
        continue;
      }
      // нет контекста заказа — отдадим вертикальному парсеру как есть
    }
    // Если строка содержит маркер — запоминаем контекст
    const mk = line.match(ORDER_MARKER);
    if (mk) {
      const n = normalizeOrderNumber(mk[1]);
      if (n) currentOrder = n;
    }
    lines.push(line);
  }

  // Находим все индексы маркеров «Заказ покупателя …»
  const markers: { index: number; orderNumber: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ORDER_MARKER);
    if (m) {
      const num = normalizeOrderNumber(m[1]);
      if (num) markers.push({ index: i, orderNumber: num });
    }
  }

  let unassignedLines = 0;
  if (markers.length === 0) {
    // Если табличный пред-проход уже что-то нашёл — отдаём это.
    if (Object.keys(byOrderNumber).length === 0) {
      warnings.push(
        "Не найден маркер «Заказ покупателя КП_…». Проверьте, что номера заказов присутствуют в тексте.",
      );
      return {
        byOrderNumber: {},
        totals: { orders: 0, items: 0, needsReview: 0 },
        unassignedLines: lines.filter((l) => l.trim()).length,
        warnings,
      };
    }
    let total = 0;
    let needsReview = 0;
    for (const arr of Object.values(byOrderNumber)) {
      total += arr.length;
      needsReview += arr.filter((x) => x.needsReview).length;
    }
    return {
      byOrderNumber,
      totals: { orders: Object.keys(byOrderNumber).length, items: total, needsReview },
      unassignedLines: 0,
      warnings,
    };
  }

  // Строки до первого маркера — без привязки.
  unassignedLines = lines
    .slice(0, markers[0].index)
    .filter((l) => l.trim()).length;

  for (let k = 0; k < markers.length; k++) {
    const start = markers[k].index + 1;
    const end = k + 1 < markers.length ? markers[k + 1].index : lines.length;
    const blockLines = lines.slice(start, end);
    const items = parseBlockLines(blockLines, start + 1);
    if (items.length === 0) continue;
    const key = markers[k].orderNumber;
    if (!byOrderNumber[key]) byOrderNumber[key] = [];
    byOrderNumber[key].push(...items);
  }

  let total = 0;
  let needsReview = 0;
  for (const arr of Object.values(byOrderNumber)) {
    total += arr.length;
    needsReview += arr.filter((x) => x.needsReview).length;
  }
  if (needsReview > 0) {
    warnings.push(
      `Товарных строк требуют проверки: ${needsReview}. Сохранены как raw_text.`,
    );
  }

  return {
    byOrderNumber,
    totals: { orders: Object.keys(byOrderNumber).length, items: total, needsReview },
    unassignedLines,
    warnings,
  };
}

/** Парсинг Excel/CSV — приводим к тексту и используем текстовый парсер. */
export async function parseOrderItemsFile(file: File): Promise<OrderItemsParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) {
    const text = await file.text();
    return parseOrderItemsText(text);
  }
  if (name.endsWith(".csv")) {
    const text = await file.text();
    // CSV → текст: заменяем разделители на переводы строк, чтобы попасть в
    // тот же построчный парсер.
    const flat = text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((row) => row.split(/[;,\t]/).map((c) => c.trim()).filter(Boolean).join("\n"))
      .join("\n");
    return parseOrderItemsText(flat);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const out: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
      }) as unknown[][];
      for (const row of grid) {
        for (const cell of row) {
          const v = clean(cell);
          if (v) out.push(v);
        }
      }
    }
    return parseOrderItemsText(out.join("\n"));
  }
  // По умолчанию — пытаемся как текст
  const text = await file.text();
  return parseOrderItemsText(text);
}
