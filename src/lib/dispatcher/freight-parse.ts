// Простой эвристический разбор текста письма / PDF-заявки заказчика.
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
  payment_type: string | null;
  payment_delay_days: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  comment: string | null;
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
  payment_type: null,
  payment_delay_days: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  comment: null,
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
  // dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return null;
}

const BODY_TYPE_MAP: Array<[RegExp, string]> = [
  [/\bтент\b/i, "тент"],
  [/\bрефриж\w*/i, "рефрижератор"],
  [/\bизотерм\w*/i, "изотерм"],
  [/\bизотерма\b/i, "изотерм"],
  [/\bфургон\b/i, "фургон"],
  [/\bборт\w*/i, "бортовой"],
  [/\bцельномет\w*/i, "цельнометаллический"],
  [/\bконтейнер\b/i, "контейнер"],
  [/\bсамосвал\b/i, "самосвал"],
];

const LOAD_METHOD_MAP: Array<[RegExp, string]> = [
  [/задн\w+/i, "rear"],
  [/боков\w+/i, "side"],
  [/верх\w+/i, "top"],
  [/растентов\w+/i, "tent_off"],
  [/без ворот/i, "no_gates"],
];

export function parseIncomingFreightText(input: string | null | undefined): ParseResult {
  const text = (input ?? "").replace(/\r/g, "").trim();
  if (!text) {
    return {
      fields: { ...NULL_FIELDS },
      missing: ["all"],
      has_any: false,
    };
  }

  const t = text;

  const loadingCity = pickLine(t, [
    /(?:город|г\.?)\s*загрузки\s*[:\-—]\s*([^\n]+)/i,
    /загрузка\s*[:\-—]\s*([^\n,]+)/i,
    /откуда\s*[:\-—]\s*([^\n,]+)/i,
  ]);
  const unloadingCity = pickLine(t, [
    /(?:город|г\.?)\s*выгрузки\s*[:\-—]\s*([^\n]+)/i,
    /выгрузка\s*[:\-—]\s*([^\n,]+)/i,
    /куда\s*[:\-—]\s*([^\n,]+)/i,
  ]);
  const loadingAddress = pickLine(t, [
    /адрес\s*загрузки\s*[:\-—]\s*([^\n]+)/i,
  ]);
  const unloadingAddress = pickLine(t, [
    /адрес\s*выгрузки\s*[:\-—]\s*([^\n]+)/i,
  ]);
  const loadingDate = pickDate(t, [
    /дата\s*загрузки\s*[:\-—]\s*([0-9./\-]+)/i,
    /загрузка\s*[:\-—].*?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i,
  ]);
  const unloadingDate = pickDate(t, [
    /дата\s*выгрузки\s*[:\-—]\s*([0-9./\-]+)/i,
    /выгрузка\s*[:\-—].*?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i,
  ]);
  const cargoName = pickLine(t, [
    /груз\s*[:\-—]\s*([^\n]+)/i,
    /наименование\s*груза\s*[:\-—]\s*([^\n]+)/i,
  ]);
  const weight = pickNumber(t, [
    /вес\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:кг|т\b)/i,
    /масса\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:кг|т\b)/i,
  ]);
  // если указали в тоннах — переводим в кг
  let weightKg: number | null = weight;
  if (weight != null) {
    const inTonnes = /\b(?:вес|масса)[^\n]*?т\b/i.test(t);
    if (inTonnes && weight < 100) weightKg = Math.round(weight * 1000);
  }
  const volume = pickNumber(t, [
    /объ[её]м\s*[:\-—]?\s*([0-9.,]+)\s*(?:м3|м³|куб)/i,
  ]);
  const rate = pickNumber(t, [
    /ставка\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:р|руб|₽)/i,
    /стоимость\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:р|руб|₽)/i,
    /цена\s*[:\-—]?\s*([0-9.,\s\u00A0]+)\s*(?:р|руб|₽)/i,
  ]);

  // Тип кузова
  let bodyType: string | null = null;
  for (const [re, label] of BODY_TYPE_MAP) {
    if (re.test(t)) {
      bodyType = label;
      break;
    }
  }

  // Способы загрузки
  const loadMethods: string[] = [];
  for (const [re, code] of LOAD_METHOD_MAP) {
    if (re.test(t) && !loadMethods.includes(code)) loadMethods.push(code);
  }

  // Тип оплаты / отсрочка
  let paymentType: string | null = null;
  let paymentDelayDays: number | null = null;
  if (/предоплат/i.test(t)) paymentType = "prepayment";
  else if (/на\s*загруз/i.test(t)) paymentType = "on_loading";
  else if (/на\s*выгруз/i.test(t)) paymentType = "on_unloading";
  else if (/отсроч/i.test(t) || /\bпо оригинал/i.test(t)) paymentType = "delayed";
  const dm = t.match(/отсроч\w*\s*[:\-—]?\s*(\d{1,3})\s*(?:к\.?|кален|раб|дн)/i);
  if (dm) paymentDelayDays = Number(dm[1]) || null;

  // Контакты
  const phoneMatch = t.match(
    /(?:тел(?:ефон)?|контакт)?\s*[:\-—]?\s*(\+?7?[\s\-()]?\d{3}[\s\-()]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})/i,
  );
  const contactPhone = phoneMatch ? phoneMatch[1].replace(/\s{2,}/g, " ").trim() : null;
  const emailMatch = t.match(/([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/i);
  const contactEmail = emailMatch ? emailMatch[1] : null;
  const contactName = pickLine(t, [
    /контактное\s*лицо\s*[:\-—]\s*([^\n]+)/i,
    /контакт\s*[:\-—]\s*([^\n]+)/i,
    /от\s*кого\s*[:\-—]\s*([^\n]+)/i,
  ]);
  const comment = pickLine(t, [
    /комментар\w*\s*[:\-—]\s*([^\n]+)/i,
    /примечан\w*\s*[:\-—]\s*([^\n]+)/i,
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
    payment_type: paymentType,
    payment_delay_days: paymentDelayDays,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    comment,
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
    !!fields.loading_date;

  return { fields, missing, has_any };
}
