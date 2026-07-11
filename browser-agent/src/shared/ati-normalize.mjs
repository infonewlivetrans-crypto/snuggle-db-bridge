// Pure helpers для безопасного преобразования веса/объёма/дат перед вводом в ATI.
// Внутри Радиус Трек вес хранится в килограммах, объём — в м³ (число).
// Все функции возвращают строку в формате, ожидаемом ATI, либо null.

const LOCALE_SEP = { ru: ",", en: "." };

function fmt(n, locale) {
  if (!Number.isFinite(n)) return null;
  // Отрезаем висящие нули, максимум 3 знака после запятой.
  const s = n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  const sep = LOCALE_SEP[locale] || ",";
  return sep === "," ? s.replace(".", ",") : s;
}

/**
 * Преобразовать вес в кг в строку тонн для формы ATI.
 * 200 кг -> "0,2", 1500 кг -> "1,5", 20000 кг -> "20".
 */
export function normalizeWeightForAti(weightKg, locale = "ru") {
  const n = Number(weightKg);
  if (!Number.isFinite(n) || n <= 0) return null;
  const tons = n / 1000;
  return fmt(tons, locale);
}

/**
 * Прочитать значение поля веса из ATI (строка тонн) обратно в кг.
 * Поддерживает "0,2" и "0.2". Возвращает null для нечитаемого ввода.
 */
export function parseAtiWeightTonsToKg(text) {
  if (text == null) return null;
  const cleaned = String(text).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

/**
 * Проверить эквивалентность введённого веса ожидаемому.
 * Допуск — 1 кг (округление тонн до 3 знаков).
 */
export function weightsEquivalentKg(expectedKg, actualKg) {
  if (!Number.isFinite(expectedKg) || !Number.isFinite(actualKg)) return false;
  return Math.abs(expectedKg - actualKg) <= 1;
}

/**
 * Объём в м³ -> строка для ATI.
 * 0.5 -> "0,5", 12.7 -> "12,7".
 */
export function normalizeVolumeForAti(volumeM3, locale = "ru") {
  const n = Number(volumeM3);
  if (!Number.isFinite(n) || n < 0) return null;
  return fmt(n, locale);
}

export function parseAtiVolume(text) {
  if (text == null) return null;
  const cleaned = String(text).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function volumesEquivalent(expected, actual) {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  return Math.abs(expected - actual) <= 0.01;
}

/**
 * Резолвер режима даты загрузки.
 * Принимает { mode, from, to, exactDates } и «today» (ISO YYYY-MM-DD).
 * Возвращает { textCandidates, from, to } — что искать в UI ATI по видимой подписи.
 * Не выбирает по индексу — только по семантике.
 */
export function resolveLoadDateMode(spec, todayIso) {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const addDays = (iso, d) => {
    const t = new Date(iso + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + d);
    return t.toISOString().slice(0, 10);
  };
  const mode = spec?.mode;
  switch (mode) {
    case "today":
      return { textCandidates: ["сегодня"], from: today, to: today };
    case "today_tomorrow":
      return { textCandidates: ["сегодня + завтра", "сегодня и завтра"], from: today, to: addDays(today, 1) };
    case "today_plus_2":
      return {
        textCandidates: ["сегодня + 2", "три дня"],
        from: today,
        to: addDays(today, 2),
      };
    case "from_today":
      return { textCandidates: ["с сегодня", "с сегодняшнего"], from: today, to: null };
    case "from_tomorrow":
      return { textCandidates: ["с завтра", "с завтрашнего"], from: addDays(today, 1), to: null };
    case "range":
      return { textCandidates: [], from: spec.from ?? null, to: spec.to ?? null };
    case "exact":
      return { textCandidates: [], from: null, to: null, exactDates: spec.exactDates ?? [] };
    default:
      return { textCandidates: [], from: null, to: null };
  }
}
