// Утилиты работы с телефонными номерами (формат +7 XXX XXX-XX-XX)
//
// Поддерживает извлечение добавочных номеров и кодов из строки:
//   "+7 (495) 123-45-67 доп 187"     → ext "187"
//   "8 495 123 45 67, доб. 1234"     → ext "1234"
//   "+7 495 123-45-67 код 516"       → ext "516"  (тип "код" сохраняется)
//   "Иванов И.И. +7 495 1234567"     → label "Иванов И.И."

/** Возвращает только цифры из строки. */
export function digitsOnly(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D+/g, "");
}

export type ParsedPhone = {
  /** Сырая строка как пришла. */
  raw: string;
  /** Нормализованный E.164 номер либо null, если не распознан. */
  e164: string | null;
  /** Отформатированный «+7 XXX XXX-XX-XX» либо исходник, если не распознан. */
  formatted: string;
  /** Добавочный/код, цифры. */
  extension: string | null;
  /** Тип добавочного: «доб», «доп», «код», «ext» — как было в исходнике. */
  extensionKind: string | null;
  /** Имя/подпись контакта, если оно встретилось рядом с номером. */
  label: string | null;
  /** Готовая ссылка tel: (с учётом добавочного через `,`). */
  telHref: string | null;
  /** Человекочитаемый display: «+7 … доб. 187» или «+7 … (Иванов)». */
  display: string;
};

const EXT_REGEX =
  /(доб(?:авочный)?|доп(?:олнительный)?|внутр(?:енний)?|вн|код|ext\.?|extension)\s*\.?\s*[:#-]?\s*(\d{1,6})/i;

/**
 * Полный разбор строки с телефоном: основной номер, добавочный, имя контакта.
 */
export function parsePhone(input: string | null | undefined): ParsedPhone {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return {
      raw: "",
      e164: null,
      formatted: "",
      extension: null,
      extensionKind: null,
      label: null,
      telHref: null,
      display: "",
    };
  }

  // 1. Извлекаем добавочный (если есть)
  let working = raw;
  let extension: string | null = null;
  let extensionKind: string | null = null;
  const extMatch = working.match(EXT_REGEX);
  if (extMatch) {
    extensionKind = extMatch[1].toLowerCase().replace(/\.$/, "");
    extension = extMatch[2];
    working = working.replace(extMatch[0], " ").trim();
  }

  // 2. Находим основной номер: ищем непрерывную последовательность,
  // содержащую достаточно цифр (10+).
  const phoneCandidates = working.match(/\+?[\d\s().\-–—]{7,}/g) ?? [];
  let phonePart = "";
  for (const c of phoneCandidates) {
    if (digitsOnly(c).length >= 10) {
      phonePart = c.trim();
      break;
    }
  }
  // Если основной не нашли, но есть «короткий» номер и есть extension — телефон скорее всего
  // целиком закодирован в одной строке без 10 цифр. Берём первого кандидата.
  if (!phonePart && phoneCandidates.length > 0) {
    phonePart = phoneCandidates[0].trim();
  }

  const e164 = normalizeRuPhone(phonePart);
  const formatted = e164 ? formatRuPhoneE164(e164) : phonePart || raw;

  // 3. Метка/имя — это всё, что осталось вокруг телефона (буквы)
  let label: string | null = null;
  const withoutPhone = phonePart ? working.replace(phonePart, " ") : working;
  const labelText = withoutPhone
    .replace(/[,;|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (labelText && /[a-zа-яё]/i.test(labelText)) {
    label = labelText.replace(/^[-–—:]+|[-–—:]+$/g, "").trim() || null;
  }

  // 4. tel: ссылка — добавочный через запятую (DTMF-пауза, поддерживается на iOS/Android)
  let tel: string | null = null;
  if (e164) {
    tel = extension ? `tel:${e164},${extension}` : `tel:${e164}`;
  } else {
    const d = digitsOnly(phonePart || raw);
    if (d) tel = extension ? `tel:+${d},${extension}` : `tel:+${d}`;
  }

  // 5. Display
  let display = formatted;
  if (extension) {
    const kind = extensionKind === "код" ? "код" : "доб.";
    display = `${formatted} ${kind} ${extension}`;
  }
  if (label) display = `${display} (${label})`;

  return {
    raw,
    e164,
    formatted,
    extension,
    extensionKind,
    label,
    telHref: tel,
    display,
  };
}

/**
 * Нормализует российский номер к формату E.164 (+7XXXXXXXXXX).
 * Возвращает null, если номер некорректен. Учитывает добавочные —
 * если в строке есть «доб/код/ext», эти цифры отбрасываются.
 */
export function normalizeRuPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  // Сначала вырезаем добавочный, чтобы его цифры не попали в основной номер.
  const cleaned = String(input).replace(EXT_REGEX, " ");
  const d = digitsOnly(cleaned);
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

function formatRuPhoneE164(e164: string): string {
  const c = e164.slice(2);
  return `+7 ${c.slice(0, 3)} ${c.slice(3, 6)}-${c.slice(6, 8)}-${c.slice(8, 10)}`;
}

/** Форматирует номер как "+7 XXX XXX-XX-XX". Возвращает исходную строку, если не удалось распарсить. */
export function formatRuPhone(input: string | null | undefined): string {
  if (!input) return "";
  const parsed = parsePhone(input);
  return parsed.display || String(input);
}

/** Готовит ссылку tel: для звонка. Возвращает null, если телефон пустой/некорректный. */
export function telHref(input: string | null | undefined): string | null {
  if (!input) return null;
  return parsePhone(input).telHref;
}
