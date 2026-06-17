// Утилиты конвертации единиц для UI.
// В БД грузоподъёмность хранится в килограммах (`payload_kg`).
// В интерфейсе перевозчик и диспетчер работают в тоннах.

export function parseTons(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const s = typeof input === "number" ? String(input) : input;
  const trimmed = s.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Конвертирует строку из формы в кг (для сохранения в `payload_kg`). */
export function tonsInputToKg(input: string | number | null | undefined): number | null {
  const t = parseTons(input);
  if (t == null) return null;
  return Math.round(t * 1000);
}

/** Конвертирует значение из БД (`payload_kg`) в строку «в тоннах» для input. */
export function kgToTonsInput(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return "";
  const t = kg / 1000;
  // целое число — без десятичной части; иначе до 3 знаков, убирая нули
  if (Math.abs(t - Math.round(t)) < 1e-6) return String(Math.round(t));
  return String(Number(t.toFixed(3)));
}

/** Форматирование «1500 кг» → «1,5 т» для отображения в карточках. */
export function formatTons(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return "—";
  const t = kg / 1000;
  const formatted =
    Math.abs(t - Math.round(t)) < 1e-6
      ? String(Math.round(t))
      : t.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return `${formatted} т`;
}
