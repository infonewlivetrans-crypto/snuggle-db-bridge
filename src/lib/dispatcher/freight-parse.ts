// Простой эвристический разбор текста письма / PDF-заявки заказчика
// или объявления из биржи (ATI и подобных).
// Никаких внешних API, OCR или AI. Только регулярки по русским ключевым словам.
// Если поле не нашлось — оставляем null и помечаем needs_review.

export interface ParsedFreightFields {
  loading_city: string | null;
  loading_address: string | null;
  loading_date: string | null;
  unloading_city: string | null;
  unloading_address: string | null;
  unloading_date: string | null;
  cargo_name: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  body_type: string | null;
  load_methods: string[];
  rate: number | null;
  rate_vat: "with" | "without" | "cash" | "card" | "agreed" | null;
  rate_per_km: number | null;
  bargain: "no" | "yes" | "request" | null;
  payment_type: string | null;
  payment_delay_days: number | null;
  direct_contract: boolean | null;
  customer_name: string | null;
  customer_ati_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_phone2: string | null;
  contact_email: string | null;
  comment: string | null;
  package_kind: string | null;
  packages_count: number | null;
  surcharge: boolean | null;
  distance_km: number | null;
}

export interface ParseResult {
  fields: ParsedFreightFields;
  /** Список полей, которые не удалось распознать. */
  missing: string[];
  /** Найдены ли хоть какие-то полезные данные. */
  has_any: boolean;
}

const NULL_FIELDS: ParsedFreightFields = {
  loading_city: null,
  loading_address: null,
  loading_date: null,
  unloading_city: null,
  unloading_address: null,
  unloading_date: null,
  cargo_name: null,
  weight_kg: null,
  volume_m3: null,
  body_type: null,
  load_methods: [],
  rate: null,
  rate_vat: null,
  rate_per_km: null,
  bargain: null,
  payment_type: null,
  payment_delay_days: null,
  direct_contract: null,
  customer_name: null,
  customer_ati_id: null,
  contact_name: null,
  contact_phone: null,
  contact_phone2: null,
  contact_email: null,
  comment: null,
  package_kind: null,
  packages_count: null,
  surcharge: null,
  distance_km: null,
};

function pickLine(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].trim().replace(/\s{2,}/g, " ");
      if (v.length > 0) return v;
    }
  }
  return null;
}

function pickNumber(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const raw = m[1].replace(/[\s\u00A0]/g, "").replace(",", ".");
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickDate(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const norm = normalizeDate(m[1]);
      if (norm) return norm;
    }
  }
  return null;
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return null;
}

const RU_MONTHS: Record<string, string> = {
  янв: "01", фев: "02", мар: "03", апр: "04", май: "05", мая: "05",
  июн: "06", июл: "07", авг: "08", сен: "09", окт: "10", ноя: "11", дек: "12",
};

function parseRuShortDate(text: string): string | null {
  // примеры: "15-19 июн.", "15 июн", "15 июня 2026"
  const m = text.match(/(\d{1,2})(?:\s*-\s*\d{1,2})?\s*([а-я]{3,5})\.?(?:\s*(\d{2,4}))?/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const monKey = m[2].toLowerCase().slice(0, 3);
  const mo = RU_MONTHS[monKey];
  if (!mo) return null;
  const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : String(new Date().getFullYear());
  return `${y}-${mo}-${day}`;
}

const BODY_TYPE_MAP: Array<[RegExp, string]> = [
  [/\bтент\w*/i, "тент"],
  [/\bрефриж\w*|\bреф\b/i, "рефрижератор"],
  [/\bизотерм\w*|\bтерм\b/i, "изотерм"],
  [/\bфургон\b/i, "фургон"],
  [/\bборт\w*/i, "бортовой"],
  [/\bцельномет\w*|\bзакр\w*/i, "закрытый"],
  [/\bконтейнер|танк-?конт/i, "контейнер"],
  [/\bсамосвал\b/i, "самосвал"],
];

const LOAD_METHOD_MAP: Array<[RegExp, string]> = [
  [/задн\w+/i, "rear"],
  [/боков\w+/i, "side"],
  [/верх\w+/i, "top"],
  [/растентов\w+/i, "tent_off"],
  [/без ворот/i, "no_gates"],
  [/\bкран\b/i, "crane"],
  [/погрузчик/i, "forklift"],
  [/ручн\w+/i, "manual"],
];

const PHONE_RE = /\+?7?[\s\-()]*\d{3,4}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/g;

export function parseIncomingFreightText(input: string | null | undefined): ParseResult {
  const text = (input ?? "").replace(/\r/g, "").trim();
  if (!text) {
    return { fields: { ...NULL_FIELDS }, missing: ["all"], has_any: false };
  }

  const t = text;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);

  // ============ Тип кузова ============
  let bodyType: string | null = null;
  for (const [re, label] of BODY_TYPE_MAP) {
    if (re.test(t)) { bodyType = label; break; }
  }

  // ============ Способы загрузки ============
  const loadMethods: string[] = [];
  for (const [re, code] of LOAD_METHOD_MAP) {
    if (re.test(t) && !loadMethods.includes(code)) loadMethods.push(code);
  }

  // ============ Вес / Объём ============
  // ATI-формат: "1,5 / 12" — тонны / м³
  let weightKg: number | null = null;
  let volume: number | null = null;
  const wv = t.match(/(?<![A-Za-zА-Яа-я0-9])(\d+[.,]?\d*)\s*\/\s*(\d+[.,]?\d*)(?![A-Za-zА-Яа-я0-9/])/);
  if (wv) {
    const t1 = Number(wv[1].replace(",", "."));
    const v1 = Number(wv[2].replace(",", "."));
    if (Number.isFinite(t1) && t1 > 0 && t1 < 100) weightKg = Math.round(t1 * 1000);
    if (Number.isFinite(v1) && v1 > 0 && v1 < 500) volume = v1;
  }
  if (weightKg == null) {
    const w = pickNumber(t, [
      /вес\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:кг|т\b)/i,
      /масса\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:кг|т\b)/i,
    ]);
    if (w != null) {
      const inTonnes = /\b(?:вес|масса)[^\n]*?т\b/i.test(t);
      weightKg = inTonnes && w < 100 ? Math.round(w * 1000) : w;
    }
  }
  if (volume == null) {
    volume = pickNumber(t, [/объ[её]м\s*[:\-—]?\s*([0-9.,]+)\s*(?:м3|м³|куб)/i]);
  }

  // ============ Упаковка / места ============
  let packageKind: string | null = null;
  let packagesCount: number | null = null;
  const pk = t.match(/(палет[ыа]?|короб[аки]?|меш[коа]+|биг[\s-]?бэг|паллет[ыа]?)\s*[-—:]?\s*(\d+)\s*(?:шт|мест)/i);
  if (pk) {
    packageKind = pk[1].toLowerCase().startsWith("палет") || pk[1].toLowerCase().startsWith("паллет")
      ? "палеты"
      : pk[1].toLowerCase();
    packagesCount = Number(pk[2]);
  }

  // ============ Догруз ============
  const surcharge = /\bдогруз/i.test(t) ? true : null;

  // ============ Расстояние ============
  const distance = pickNumber(t, [/(\d+[\s\u00A0]*\d*)\s*км/i]);

  // ============ Адреса / Города ============
  // Эвристика для ATI-объявлений: ищем "готов <date>" и берём города/адреса
  // вокруг этого якоря.
  let loadingCity: string | null = null;
  let loadingAddress: string | null = null;
  let loadingDate: string | null = null;
  let unloadingCity: string | null = null;
  let unloadingAddress: string | null = null;

  // Сначала пытаемся стандартные шаблоны "Загрузка: ..., Выгрузка: ..."
  loadingCity = pickLine(t, [
    /(?:город|г\.?)\s*загрузки\s*[:\-—]\s*([^\n]+)/i,
    /загрузка\s*[:\-—]\s*([^\n,]+)/i,
    /откуда\s*[:\-—]\s*([^\n,]+)/i,
  ]);
  unloadingCity = pickLine(t, [
    /(?:город|г\.?)\s*выгрузки\s*[:\-—]\s*([^\n]+)/i,
    /выгрузка\s*[:\-—]\s*([^\n,]+)/i,
    /куда\s*[:\-—]\s*([^\n,]+)/i,
  ]);
  loadingAddress = pickLine(t, [/адрес\s*загрузки\s*[:\-—]\s*([^\n]+)/i]);
  unloadingAddress = pickLine(t, [/адрес\s*выгрузки\s*[:\-—]\s*([^\n]+)/i]);
  loadingDate = pickDate(t, [
    /дата\s*загрузки\s*[:\-—]\s*([0-9./\-]+)/i,
    /загрузка\s*[:\-—].*?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i,
  ]);
  const unloadingDate = pickDate(t, [
    /дата\s*выгрузки\s*[:\-—]\s*([0-9./\-]+)/i,
    /выгрузка\s*[:\-—].*?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i,
  ]);

  // ATI-стиль: ищем индекс строки "готов ..." — над ней блок загрузки, под ним блок выгрузки
  const readyIdx = lines.findIndex((l) => /^готов\b/i.test(l));
  if (readyIdx > 0) {
    if (!loadingDate) {
      const d = parseRuShortDate(lines[readyIdx]);
      if (d) loadingDate = d;
    }
    // Поднимаемся вверх — последние "содержательные" строки до якоря, исключая числа/км/упаковку
    const upper = lines.slice(Math.max(0, readyIdx - 5), readyIdx)
      .filter((l) => !/^\d/.test(l) && !/км от/i.test(l) && !/палет|короб|меш|шт\b/i.test(l));
    if (upper.length >= 1 && !loadingAddress) loadingAddress = upper[upper.length - 1];
    if (upper.length >= 2 && !loadingCity) loadingCity = upper[upper.length - 3] ?? upper[0];
    // выгрузка — первые две содержательные строки ниже "готов"
    const lower = lines.slice(readyIdx + 1)
      .filter((l) => !/руб|без торга|прям|отправить|написать|^код:/i.test(l));
    if (lower.length >= 1 && !unloadingCity) unloadingCity = lower[0];
    if (lower.length >= 2 && !unloadingAddress) unloadingAddress = lower[1];
  }

  // ============ Ставка / условия оплаты ============
  let rate = pickNumber(t, [
    /(\d[\d\s\u00A0]{2,})\s*руб(?:\.|лей)?(?!\/км)/i,
    /ставка\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:р|руб|₽)/i,
    /стоимость\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:р|руб|₽)/i,
    /цена\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:р|руб|₽)/i,
  ]);
  if (rate != null && rate < 100) rate = null; // отсев "20,5 руб/км"
  const ratePerKm = pickNumber(t, [/(\d+[.,]?\d*)\s*руб\.?\s*\/\s*км/i]);

  let rateVat: ParsedFreightFields["rate_vat"] = null;
  if (/без\s*ндс/i.test(t)) rateVat = "without";
  else if (/с\s*ндс/i.test(t)) rateVat = "with";
  else if (/наличн/i.test(t)) rateVat = "cash";
  else if (/на\s*карт/i.test(t)) rateVat = "card";
  else if (/по\s*договор/i.test(t)) rateVat = "agreed";

  let bargain: ParsedFreightFields["bargain"] = null;
  if (/без\s*торга/i.test(t)) bargain = "no";
  else if (/возможен\s*торг|торг\s*возм/i.test(t)) bargain = "yes";
  else if (/\bторг\b/i.test(t)) bargain = "request";

  let paymentType: string | null = null;
  let paymentDelayDays: number | null = null;
  if (/предоплат/i.test(t)) paymentType = "prepayment";
  else if (/на\s*загруз|по\s*загр/i.test(t)) paymentType = "on_loading";
  else if (/на\s*выгр/i.test(t)) paymentType = "on_unloading";
  else if (/по\s*оригинал|после\s*док|отсроч/i.test(t)) paymentType = "delayed";
  const dm = t.match(/отсроч\w*\s*[:\-—]?\s*(\d{1,3})\s*(?:к\.?|кален|раб|банк|дн)/i);
  if (dm) paymentDelayDays = Number(dm[1]) || null;

  const directContract = /прям\.?\s*дог/i.test(t) ? true : null;

  // ============ Контакты ============
  const phones: string[] = [];
  let pm: RegExpExecArray | null;
  PHONE_RE.lastIndex = 0;
  while ((pm = PHONE_RE.exec(t))) {
    const raw = pm[0].replace(/\s+/g, " ").trim();
    if (raw && !phones.includes(raw)) phones.push(raw);
  }
  const contactPhone = phones[0] ?? null;
  const contactPhone2 = phones[1] ?? null;

  const emailMatch = t.match(/([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/i);
  const contactEmail = emailMatch ? emailMatch[1] : null;

  // ATI: "Код:7131479" → ATI ID; компания — строка непосредственно перед "Код:"
  let customerName: string | null = null;
  let customerAtiId: string | null = null;
  const atiM = t.match(/Код\s*[:\-]\s*(\d{4,})/i);
  if (atiM) {
    customerAtiId = atiM[1];
    // в той же строке может быть "Код:7131479,Ковров,грузовл.ГВ" — компания выше
    const atiLineIdx = lines.findIndex((l) => /Код\s*[:\-]\s*\d{4,}/i.test(l));
    if (atiLineIdx > 0) {
      const prev = lines[atiLineIdx - 1].replace(/,$/, "").trim();
      if (prev && !/руб|написать|отправить/i.test(prev)) customerName = prev;
    }
  }

  // Имя контакта — последняя строка с двумя словами с заглавных, не телефон
  let contactName: string | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].replace(/,$/, "").trim();
    if (PHONE_RE.test(l)) { PHONE_RE.lastIndex = 0; continue; }
    PHONE_RE.lastIndex = 0;
    if (/^[А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z][а-яёa-z]+(?:\s+[А-ЯЁA-Z][а-яёa-z]+)?$/.test(l)) {
      contactName = l; break;
    }
  }
  if (!contactName) {
    contactName = pickLine(t, [
      /контактное\s*лицо\s*[:\-—]\s*([^\n]+)/i,
      /контакт\s*[:\-—]\s*([^\n]+)/i,
      /от\s*кого\s*[:\-—]\s*([^\n]+)/i,
    ]);
  }

  const comment = pickLine(t, [
    /комментар\w*\s*[:\-—]\s*([^\n]+)/i,
    /примечан\w*\s*[:\-—]\s*([^\n]+)/i,
  ]);

  // ============ Наименование груза ============
  const cargoName = pickLine(t, [
    /груз\s*[:\-—]\s*([^\n]+)/i,
    /наименование\s*груза\s*[:\-—]\s*([^\n]+)/i,
  ]);

  const fields: ParsedFreightFields = {
    loading_city: loadingCity,
    loading_address: loadingAddress,
    loading_date: loadingDate,
    unloading_city: unloadingCity,
    unloading_address: unloadingAddress,
    unloading_date: unloadingDate,
    cargo_name: cargoName,
    weight_kg: weightKg,
    volume_m3: volume,
    body_type: bodyType,
    load_methods: loadMethods,
    rate,
    rate_vat: rateVat,
    rate_per_km: ratePerKm,
    bargain,
    payment_type: paymentType,
    payment_delay_days: paymentDelayDays,
    direct_contract: directContract,
    customer_name: customerName,
    customer_ati_id: customerAtiId,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_phone2: contactPhone2,
    contact_email: contactEmail,
    comment,
    package_kind: packageKind,
    packages_count: packagesCount,
    surcharge,
    distance_km: distance,
  };

  const missing: string[] = [];
  if (!fields.loading_city) missing.push("loading_city");
  if (!fields.unloading_city) missing.push("unloading_city");
  if (!fields.cargo_name) missing.push("cargo_name");
  if (fields.rate == null) missing.push("rate");
  if (!fields.loading_date) missing.push("loading_date");

  const has_any =
    !!fields.loading_city ||
    !!fields.unloading_city ||
    !!fields.cargo_name ||
    fields.rate != null ||
    !!fields.loading_date ||
    fields.weight_kg != null ||
    fields.volume_m3 != null ||
    !!fields.contact_phone;

  return { fields, missing, has_any };
}
