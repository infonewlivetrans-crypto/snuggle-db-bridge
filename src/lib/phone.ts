// Утилиты работы с телефонными номерами (формат +7 XXX XXX-XX-XX)

/** Возвращает только цифры из строки. */
export function digitsOnly(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D+/g, "");
}

/**
 * Нормализует российский номер к формату E.164 (+7XXXXXXXXXX).
 * Возвращает null, если номер некорректен.
 */
export function normalizeRuPhone(input: string | null | undefined): string | null {
  const d = digitsOnly(input);
  if (!d) return null;
  let core = d;
  if (core.length === 11 && (core.startsWith("7") || core.startsWith("8"))) {
    core = core.slice(1);
  } else if (core.length === 10) {
    // already 10 digits
  } else if (core.length > 11) {
    // обрежем ведущие лишние цифры (например "00 7 ...")
    core = core.slice(-10);
  } else {
    return null;
  }
  if (core.length !== 10) return null;
  return `+7${core}`;
}

/** Форматирует номер как "+7 XXX XXX-XX-XX". Возвращает исходную строку, если не удалось распарсить. */
export function formatRuPhone(input: string | null | undefined): string {
  if (!input) return "";
  const e164 = normalizeRuPhone(input);
  if (!e164) return String(input);
  const c = e164.slice(2); // 10 digits
  return `+7 ${c.slice(0, 3)} ${c.slice(3, 6)}-${c.slice(6, 8)}-${c.slice(8, 10)}`;
}

/** Готовит ссылку tel: для звонка. Возвращает null, если телефон пустой/некорректный. */
export function telHref(input: string | null | undefined): string | null {
  const e164 = normalizeRuPhone(input);
  if (e164) return `tel:${e164}`;
  const d = digitsOnly(input);
  if (!d) return null;
  return `tel:+${d}`;
}
