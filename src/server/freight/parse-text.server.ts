// Базовый rule-based разбор текста груза.
// Не зависит от внешнего AI: работает на регулярках. Архитектура позволяет
// позже добавить AI-провайдера (DeepSeek/OpenAI-совместимый) через настройки,
// не меняя сигнатуру endpoint'а.

export interface ParsedPoint {
  kind: "loading" | "unloading";
  index: number; // 1-based
  city: string | null;
  date: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  pallets: number | null;
  cargo_name: string | null;
  is_additional: boolean;
}

export interface ParsedFreight {
  loading_city: string | null;
  unloading_city: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  pallets: number | null;
  rate_amount: number | null;
  cargo_name: string | null;
  body_type: string | null;
  load_method: string | null;
  unload_method: string | null;
  points: ParsedPoint[];
  warnings: string[];
  hits: string[]; // что распознано — для UI "Нужно проверить"
}

const MONTHS: Record<string, number> = {
  января: 1, январь: 1, янв: 1,
  февраля: 2, февраль: 2, фев: 2,
  марта: 3, март: 3, мар: 3,
  апреля: 4, апрель: 4, апр: 4,
  мая: 5, май: 5,
  июня: 6, июнь: 6, июн: 6,
  июля: 7, июль: 7, июл: 7,
  августа: 8, август: 8, авг: 8,
  сентября: 9, сентябрь: 9, сен: 9, сент: 9,
  октября: 10, октябрь: 10, окт: 10,
  ноября: 11, ноябрь: 11, ноя: 11,
  декабря: 12, декабрь: 12, дек: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Ищет первую дату: "16.06", "16/06/2026", "16 числа", "16 июня". */
function parseDate(text: string): string | null {
  const now = new Date();
  const year = now.getFullYear();

  const m1 = text.match(/(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]);
    let y = m1[3] ? Number(m1[3]) : year;
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${pad(mo)}-${pad(d)}`;
    }
  }

  const m2 = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв\.?|фев\.?|мар\.?|апр\.?|май|июн\.?|июл\.?|авг\.?|сен\.?|сент\.?|окт\.?|ноя\.?|дек\.?)/iu);
  if (m2) {
    const d = Number(m2[1]);
    const mo = MONTHS[m2[2].toLowerCase().replace(".", "")];
    if (mo && d >= 1 && d <= 31) return `${year}-${pad(mo)}-${pad(d)}`;
  }

  const m3 = text.match(/(\d{1,2})\s*(?:числа|число|го)\b/iu);
  if (m3) {
    const d = Number(m3[1]);
    if (d >= 1 && d <= 31) return `${year}-${pad(now.getMonth() + 1)}-${pad(d)}`;
  }

  return null;
}

function parseNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const raw = m[1].replace(",", ".").replace(/\s+/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseWeight(text: string): number | null {
  // тонны
  const t = parseNumber(text, /(\d+(?:[.,]\d+)?)\s*(?:тонн[аы]?|т\b|тн\b)/iu);
  if (t != null) return Math.round(t * 1000);
  // килограммы
  const kg = parseNumber(text, /(\d+(?:[.,]\d+)?)\s*кг\b/iu);
  if (kg != null) return Math.round(kg);
  return null;
}

function parseVolume(text: string): number | null {
  const v = parseNumber(text, /(\d+(?:[.,]\d+)?)\s*(?:куб(?:ов|а|ометр)?|м3|м³|m3)\b/iu);
  return v;
}

function parsePallets(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:палет|паллет|пал\.|pll)/iu);
  if (m) return Number(m[1]);
  const w = text.match(/\b(один|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(?:палет|паллет)/iu);
  if (w) {
    const map: Record<string, number> = {
      один: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
      шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
    };
    return map[w[1].toLowerCase()] ?? null;
  }
  return null;
}

function parseRate(text: string): number | null {
  // "80 000 ₽", "80000 руб", "80 тыс"
  const m = text.match(/(\d[\d\s]{2,})\s*(?:₽|руб(?:лей)?\.?|р\.?)/iu);
  if (m) {
    const n = Number(m[1].replace(/\s+/g, ""));
    if (Number.isFinite(n)) return n;
  }
  const mk = text.match(/(\d+(?:[.,]\d+)?)\s*(?:тыс\.?|к\b|k\b)/iu);
  if (mk) {
    const n = Number(mk[1].replace(",", "."));
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }
  return null;
}

function parseBodyType(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bреф(?:рижератор)?|изотерм/.test(t)) return "refrigerator";
  if (/\bтент/.test(t)) return "tent";
  if (/\bфургон/.test(t)) return "box";
  if (/\bборт(?:овой)?/.test(t)) return "board";
  if (/\bшаланд/.test(t)) return "flatbed";
  if (/\bконтейнер/.test(t)) return "container";
  if (/\bлесовоз|коник/.test(t)) return "timber";
  return null;
}

function parseLoadMethod(text: string): string | null {
  const t = text.toLowerCase();
  if (/задн(?:яя|юю)\s+(?:загрузк|выгрузк|погрузк)/.test(t)) return "back";
  if (/боков(?:ая|ую)\s+(?:загрузк|выгрузк|погрузк)/.test(t)) return "side";
  if (/верхн(?:яя|юю)\s+(?:загрузк|выгрузк|погрузк)/.test(t)) return "top";
  return null;
}

// Капитализированные русские слова — кандидаты в города.
// Не идеально, но достаточно для MVP.
function extractCityCandidates(text: string): string[] {
  const re = /\b([А-ЯЁ][а-яё]{2,}(?:[\s-][А-ЯЁ][а-яё-]+)?)\b/g;
  const STOP = new Set([
    "Загрузка", "Выгрузка", "Погрузка", "Догруз", "Груз", "Тонны", "Палет", "Паллет",
    "Тент", "Реф", "Фургон", "Москва-Сити",
  ]);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const w = m[1].trim();
    if (STOP.has(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** Разбивает текст на сегменты по маркерам нескольких точек. */
function splitSegments(text: string): { text: string; isAdditional: boolean }[] {
  const markers = [
    "потом забрать",
    "потом погрузк",
    "ещё забрать",
    "еще забрать",
    "догруз",
    "затем",
  ];
  const lower = text.toLowerCase();
  const positions: { pos: number; isAdditional: boolean }[] = [
    { pos: 0, isAdditional: false },
  ];
  for (const m of markers) {
    let from = 0;
    while (true) {
      const i = lower.indexOf(m, from);
      if (i === -1) break;
      positions.push({ pos: i, isAdditional: true });
      from = i + m.length;
    }
  }
  positions.sort((a, b) => a.pos - b.pos);
  const out: { text: string; isAdditional: boolean }[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].pos;
    const end = i + 1 < positions.length ? positions[i + 1].pos : text.length;
    out.push({ text: text.slice(start, end), isAdditional: positions[i].isAdditional });
  }
  return out;
}

/** Простая эвристика город после "в Город" / "до Город" / "из Город". */
function findCityAfter(text: string, preps: string[]): string | null {
  for (const p of preps) {
    const re = new RegExp(`\\b${p}\\s+([А-ЯЁ][а-яё-]+(?:[\\s-][А-ЯЁ][а-яё-]+)?)`, "u");
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

export function parseFreightText(input: string): ParsedFreight {
  const text = (input ?? "").trim();
  const warnings: string[] = [];
  const hits: string[] = [];
  const points: ParsedPoint[] = [];

  if (!text) {
    return {
      loading_city: null, unloading_city: null,
      loading_date: null, unloading_date: null,
      weight_kg: null, volume_m3: null, pallets: null,
      rate_amount: null, cargo_name: null,
      body_type: null, load_method: null, unload_method: null,
      points: [],
      warnings: ["Пустой текст"], hits: [],
    };
  }

  const segments = splitSegments(text);

  // Загрузки: ищем по маркерам "из/в Краснодаре/Ростове" в каждом сегменте.
  let loadIdx = 0;
  let unloadIdx = 0;
  for (const seg of segments) {
    const loadingCity =
      findCityAfter(seg.text, ["из", "погрузка в", "загрузка в", "забрать в", "в"]) ??
      null;
    const weight = parseWeight(seg.text);
    const volume = parseVolume(seg.text);
    const pallets = parsePallets(seg.text);
    const date = parseDate(seg.text);

    if (loadingCity || weight || volume || pallets) {
      loadIdx += 1;
      points.push({
        kind: "loading",
        index: loadIdx,
        city: loadingCity,
        date,
        weight_kg: weight,
        volume_m3: volume,
        pallets,
        cargo_name: null,
        is_additional: seg.isAdditional,
      });
    }
  }

  // Выгрузки: ищем "в/до Москву/Домодедово", в т.ч. "первый в ..., второй в ..."
  const unloadRe = /(?:в|до|на)\s+([А-ЯЁ][а-яё-]+(?:[\s-][А-ЯЁ][а-яё-]+)?)/giu;
  const seenUnload = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = unloadRe.exec(text)) !== null) {
    const city = m[1];
    // Не дублируем города загрузки
    if (points.some((p) => p.kind === "loading" && p.city === city)) continue;
    if (seenUnload.has(city)) continue;
    seenUnload.add(city);
  }
  // эвристика: последние 1-2 города из общего списка кандидатов, не попавшие в загрузку
  const candidates = extractCityCandidates(text);
  const loadCities = new Set(points.filter((p) => p.kind === "loading").map((p) => p.city));
  const unloadCandidates = candidates.filter((c) => !loadCities.has(c));
  // Берём города, упомянутые после слов "отвезти|первый|второй|в"
  const explicitUnload = Array.from(seenUnload).filter((c) => !loadCities.has(c));
  const finalUnload = explicitUnload.length ? explicitUnload : unloadCandidates.slice(-2);

  for (const c of finalUnload) {
    unloadIdx += 1;
    points.push({
      kind: "unloading",
      index: unloadIdx,
      city: c,
      date: null,
      weight_kg: null,
      volume_m3: null,
      pallets: null,
      cargo_name: null,
      is_additional: false,
    });
  }

  const firstLoad = points.find((p) => p.kind === "loading");
  const firstUnload = points.find((p) => p.kind === "unloading");

  const totalWeight = points
    .filter((p) => p.kind === "loading" && p.weight_kg != null)
    .reduce((s, p) => s + (p.weight_kg ?? 0), 0) || null;
  const totalVolume = points
    .filter((p) => p.kind === "loading" && p.volume_m3 != null)
    .reduce((s, p) => s + (p.volume_m3 ?? 0), 0) || null;
  const totalPallets = points
    .filter((p) => p.kind === "loading" && p.pallets != null)
    .reduce((s, p) => s + (p.pallets ?? 0), 0) || null;

  const rate = parseRate(text);
  const body = parseBodyType(text);
  const loadMethod = parseLoadMethod(text);

  if (firstLoad?.city) hits.push("loading_city");
  if (firstUnload?.city) hits.push("unloading_city");
  if (firstLoad?.date) hits.push("loading_date");
  if (totalWeight) hits.push("weight");
  if (totalVolume) hits.push("volume");
  if (rate) hits.push("rate");
  if (body) hits.push("body_type");

  if (!firstLoad?.city) warnings.push("Город загрузки не найден — проверьте вручную");
  if (!firstUnload?.city) warnings.push("Город выгрузки не найден — проверьте вручную");
  if (!firstLoad?.date) warnings.push("Дата загрузки не найдена");
  if (!totalWeight && !totalVolume && !totalPallets)
    warnings.push("Вес/объём/палеты не найдены");
  if (!rate) warnings.push("Ставка не найдена — укажите вручную или отметьте «уточняется»");

  return {
    loading_city: firstLoad?.city ?? null,
    unloading_city: firstUnload?.city ?? null,
    loading_date: firstLoad?.date ?? null,
    unloading_date: null,
    weight_kg: totalWeight,
    volume_m3: totalVolume,
    pallets: totalPallets,
    rate_amount: rate,
    cargo_name: null,
    body_type: body,
    load_method: loadMethod,
    unload_method: null,
    points,
    warnings,
    hits,
  };
}
